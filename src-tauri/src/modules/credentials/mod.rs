use crate::modules::hosts::HostsDb;
use crate::modules::secrets::{delete_password, store_password, SecretsState};
use base64::Engine as _;

const CRED_SERVICE: &str = "labonair-cred";

const SELECT_CREDS: &str =
    "SELECT id, name, cred_type, key_path, key_type, public_key, has_secret, created_at FROM credentials";

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct Credential {
    pub id: String,
    pub name: String,
    pub cred_type: String,
    pub key_path: Option<String>,
    pub key_type: Option<String>,
    pub public_key: Option<String>,
    pub has_secret: bool,
    pub created_at: i64,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct HostRef {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct GenerateKeypairResult {
    pub key_path: String,
    pub public_key: String,
}

fn row_to_cred(row: &rusqlite::Row) -> rusqlite::Result<Credential> {
    Ok(Credential {
        id: row.get(0)?,
        name: row.get(1)?,
        cred_type: row.get(2)?,
        key_path: row.get(3)?,
        key_type: row.get(4)?,
        public_key: row.get(5)?,
        has_secret: row.get::<_, i64>(6).map(|v| v != 0).unwrap_or(false),
        created_at: row.get(7)?,
    })
}

fn now_millis() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

// SSH wire-format helpers for building OpenSSH authorized_keys public keys.
fn ssh_wire_str(s: &[u8]) -> Vec<u8> {
    let mut v = Vec::with_capacity(4 + s.len());
    v.extend_from_slice(&(s.len() as u32).to_be_bytes());
    v.extend_from_slice(s);
    v
}

fn ssh_wire_mpint(bytes: &[u8]) -> Vec<u8> {
    let pos = bytes.iter().position(|&b| b != 0).unwrap_or(bytes.len().saturating_sub(1));
    let trimmed = &bytes[pos..];
    if trimmed.is_empty() || (trimmed[0] & 0x80 != 0) {
        let mut padded = vec![0u8];
        padded.extend_from_slice(trimmed);
        ssh_wire_str(&padded)
    } else {
        ssh_wire_str(trimmed)
    }
}

fn pkey_to_openssh_pubkey(
    pkey: &openssl::pkey::PKey<openssl::pkey::Private>,
    key_type: &str,
) -> Result<String, String> {
    let mut wire = Vec::new();
    match key_type {
        "ed25519" => {
            let raw = pkey.raw_public_key().map_err(|e| e.to_string())?;
            wire.extend(ssh_wire_str(b"ssh-ed25519"));
            wire.extend(ssh_wire_str(&raw));
        }
        "rsa-4096" => {
            let rsa = pkey.rsa().map_err(|e| e.to_string())?;
            let e_bytes = rsa.e().to_vec();
            let n_bytes = rsa.n().to_vec();
            wire.extend(ssh_wire_str(b"ssh-rsa"));
            wire.extend(ssh_wire_mpint(&e_bytes));
            wire.extend(ssh_wire_mpint(&n_bytes));
        }
        _ => return Err(format!("Unknown key_type: {key_type}")),
    }
    let b64 = base64::engine::general_purpose::STANDARD.encode(&wire);
    let prefix = if key_type == "ed25519" { "ssh-ed25519" } else { "ssh-rsa" };
    Ok(format!("{} {} labonair-generated", prefix, b64))
}

#[tauri::command]
pub async fn credentials_get_all(db: tauri::State<'_, HostsDb>) -> Result<Vec<Credential>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(&format!("{} ORDER BY name ASC", SELECT_CREDS))
        .map_err(|e| e.to_string())?;
    let creds = stmt
        .query_map([], row_to_cred)
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(creds)
}

#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn credentials_create(
    app: tauri::AppHandle,
    db: tauri::State<'_, HostsDb>,
    secrets: tauri::State<'_, SecretsState>,
    name: String,
    cred_type: String,
    key_path: Option<String>,
    key_type: Option<String>,
    public_key: Option<String>,
    secret: Option<String>,
) -> Result<Credential, String> {
    let id = uuid::Uuid::new_v4().to_string();
    let created_at = now_millis();
    let has_secret = secret.as_deref().map(|s| !s.is_empty()).unwrap_or(false);
    let has_secret_int = has_secret as i64;
    {
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT INTO credentials (id, name, cred_type, key_path, key_type, public_key, has_secret, created_at) \
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
            rusqlite::params![id, name, cred_type, key_path, key_type, public_key, has_secret_int, created_at],
        )
        .map_err(|e| e.to_string())?;
    }
    if let Some(s) = secret {
        if !s.is_empty() {
            store_password(&app, &secrets, CRED_SERVICE, &id, &s)?;
        }
    }
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.query_row(
        &format!("{} WHERE id=?1", SELECT_CREDS),
        rusqlite::params![id],
        row_to_cred,
    )
    .map_err(|e| e.to_string())
}

#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn credentials_update(
    app: tauri::AppHandle,
    db: tauri::State<'_, HostsDb>,
    secrets: tauri::State<'_, SecretsState>,
    id: String,
    name: Option<String>,
    cred_type: Option<String>,
    key_path: Option<String>,
    key_type: Option<String>,
    public_key: Option<String>,
    secret: Option<String>,
) -> Result<Credential, String> {
    {
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        if let Some(v) = &name {
            conn.execute("UPDATE credentials SET name=?1 WHERE id=?2", rusqlite::params![v, id])
                .map_err(|e| e.to_string())?;
        }
        if let Some(v) = &cred_type {
            conn.execute("UPDATE credentials SET cred_type=?1 WHERE id=?2", rusqlite::params![v, id])
                .map_err(|e| e.to_string())?;
        }
        if key_path.is_some() {
            conn.execute("UPDATE credentials SET key_path=?1 WHERE id=?2", rusqlite::params![key_path, id])
                .map_err(|e| e.to_string())?;
        }
        if key_type.is_some() {
            conn.execute("UPDATE credentials SET key_type=?1 WHERE id=?2", rusqlite::params![key_type, id])
                .map_err(|e| e.to_string())?;
        }
        if public_key.is_some() {
            conn.execute("UPDATE credentials SET public_key=?1 WHERE id=?2", rusqlite::params![public_key, id])
                .map_err(|e| e.to_string())?;
        }
    }
    if let Some(s) = secret {
        if s.is_empty() {
            let _ = delete_password(&app, &secrets, CRED_SERVICE, &id);
            let conn = db.0.lock().map_err(|e| e.to_string())?;
            let _ = conn.execute("UPDATE credentials SET has_secret=0 WHERE id=?1", rusqlite::params![id]);
        } else {
            store_password(&app, &secrets, CRED_SERVICE, &id, &s)?;
            let conn = db.0.lock().map_err(|e| e.to_string())?;
            let _ = conn.execute("UPDATE credentials SET has_secret=1 WHERE id=?1", rusqlite::params![id]);
        }
    }
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.query_row(
        &format!("{} WHERE id=?1", SELECT_CREDS),
        rusqlite::params![id],
        row_to_cred,
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn credentials_delete(
    app: tauri::AppHandle,
    db: tauri::State<'_, HostsDb>,
    secrets: tauri::State<'_, SecretsState>,
    id: String,
) -> Result<(), String> {
    // Fetch key_path before deleting so we can clean up app-generated key files
    let key_path: Option<String> = {
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        conn.query_row(
            "SELECT key_path FROM credentials WHERE id=?1",
            rusqlite::params![id],
            |r| r.get(0),
        )
        .ok()
        .flatten()
    };

    {
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        // ON DELETE SET NULL on hosts.credential_id handles referential cleanup automatically
        conn.execute("DELETE FROM credentials WHERE id=?1", rusqlite::params![id])
            .map_err(|e| e.to_string())?;
    }
    let _ = delete_password(&app, &secrets, CRED_SERVICE, &id);

    // Remove app-generated key files (only those stored inside our data dir)
    if let Some(path) = key_path {
        let data_dir = crate::modules::fs::paths::data_dir();
        let keys_dir = data_dir.join("keys");
        let key_file = std::path::Path::new(&path);
        if key_file.starts_with(&keys_dir) {
            let _ = std::fs::remove_file(key_file);
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn credentials_get_hosts_using(
    db: tauri::State<'_, HostsDb>,
    id: String,
) -> Result<Vec<HostRef>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, name FROM hosts WHERE credential_id=?1 ORDER BY name")
        .map_err(|e| e.to_string())?;
    let refs = stmt
        .query_map(rusqlite::params![id], |row| {
            Ok(HostRef { id: row.get(0)?, name: row.get(1)? })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(refs)
}

#[tauri::command]
pub async fn credential_generate_keypair(
    app: tauri::AppHandle,
    db: tauri::State<'_, HostsDb>,
    secrets: tauri::State<'_, SecretsState>,
    cred_id: String,
    key_type: String,
    passphrase: Option<String>,
) -> Result<GenerateKeypairResult, String> {
    // Generate the key pair
    let pkey: openssl::pkey::PKey<openssl::pkey::Private> = match key_type.as_str() {
        "ed25519" => openssl::pkey::PKey::generate_ed25519().map_err(|e| e.to_string())?,
        "rsa-4096" => {
            let rsa = openssl::rsa::Rsa::generate(4096).map_err(|e| e.to_string())?;
            openssl::pkey::PKey::from_rsa(rsa).map_err(|e| e.to_string())?
        }
        _ => return Err(format!("Unknown key_type: {key_type}")),
    };

    // Encode private key as PEM (PKCS8)
    let pem_bytes = match passphrase.as_deref().filter(|s| !s.is_empty()) {
        Some(pw) => pkey
            .private_key_to_pem_pkcs8_passphrase(
                openssl::symm::Cipher::aes_256_cbc(),
                pw.as_bytes(),
            )
            .map_err(|e| e.to_string())?,
        None => pkey.private_key_to_pem_pkcs8().map_err(|e| e.to_string())?,
    };

    // Write private key to {data_dir}/keys/{cred_id} with restricted permissions
    let data_dir = crate::modules::fs::paths::data_dir();
    let keys_dir = data_dir.join("keys");
    std::fs::create_dir_all(&keys_dir).map_err(|e| e.to_string())?;
    let key_path = keys_dir.join(&cred_id);
    std::fs::write(&key_path, &pem_bytes).map_err(|e| e.to_string())?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&key_path, std::fs::Permissions::from_mode(0o600))
            .map_err(|e| e.to_string())?;
    }

    let key_path_str = key_path.to_string_lossy().to_string();

    // Encode public key in OpenSSH authorized_keys format
    let public_key_str = pkey_to_openssh_pubkey(&pkey, &key_type)?;

    // Persist key_path, key_type, public_key to DB
    {
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "UPDATE credentials SET key_path=?1, key_type=?2, public_key=?3 WHERE id=?4",
            rusqlite::params![key_path_str, key_type, public_key_str, cred_id],
        )
        .map_err(|e| e.to_string())?;
    }

    // Store passphrase in secrets if provided
    if let Some(pw) = passphrase.as_deref().filter(|s| !s.is_empty()) {
        store_password(&app, &secrets, CRED_SERVICE, &cred_id, pw)?;
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        let _ = conn.execute("UPDATE credentials SET has_secret=1 WHERE id=?1", rusqlite::params![cred_id]);
    }

    Ok(GenerateKeypairResult { key_path: key_path_str, public_key: public_key_str })
}

#[cfg(test)]
mod russh_key_compat_tests {
    //! Workstream 8 of the SSH-library migration (to russh): confirms that PKCS8 PEM
    //! keys produced by `credential_generate_keypair`'s openssl-based
    //! generation (unchanged by the migration) still load via
    //! `russh::keys::decode_secret_key`, so existing users' already-generated
    //! keys on disk keep working after upgrading. Exercises the exact same
    //! openssl calls as the real command rather than invoking the full Tauri
    //! command (which needs an AppHandle/DB/SecretsState) — the PEM encoding
    //! is the only part whose cross-library compatibility is in question.

    fn pem_for(key_type: &str, passphrase: Option<&str>) -> String {
        let pkey: openssl::pkey::PKey<openssl::pkey::Private> = match key_type {
            "ed25519" => openssl::pkey::PKey::generate_ed25519().unwrap(),
            "rsa-4096" => {
                let rsa = openssl::rsa::Rsa::generate(4096).unwrap();
                openssl::pkey::PKey::from_rsa(rsa).unwrap()
            }
            _ => panic!("unknown key_type: {key_type}"),
        };
        let pem_bytes = match passphrase {
            Some(pw) => pkey
                .private_key_to_pem_pkcs8_passphrase(openssl::symm::Cipher::aes_256_cbc(), pw.as_bytes())
                .unwrap(),
            None => pkey.private_key_to_pem_pkcs8().unwrap(),
        };
        String::from_utf8(pem_bytes).unwrap()
    }

    #[test]
    fn ed25519_no_passphrase_round_trips_through_decode_secret_key() {
        let pem = pem_for("ed25519", None);
        russh::keys::decode_secret_key(&pem, None)
            .expect("ed25519 PKCS8 PEM (no passphrase) must decode via russh::keys");
    }

    #[test]
    fn rsa4096_no_passphrase_round_trips_through_decode_secret_key() {
        let pem = pem_for("rsa-4096", None);
        russh::keys::decode_secret_key(&pem, None)
            .expect("RSA-4096 PKCS8 PEM (no passphrase) must decode via russh::keys");
    }

    #[test]
    fn ed25519_with_passphrase_round_trips_through_decode_secret_key() {
        let pem = pem_for("ed25519", Some("correct horse battery staple"));
        russh::keys::decode_secret_key(&pem, Some("correct horse battery staple"))
            .expect("ed25519 encrypted PKCS8 PEM must decode with the correct passphrase");
    }

    #[test]
    fn rsa4096_with_passphrase_round_trips_through_decode_secret_key() {
        let pem = pem_for("rsa-4096", Some("correct horse battery staple"));
        russh::keys::decode_secret_key(&pem, Some("correct horse battery staple"))
            .expect("RSA-4096 encrypted PKCS8 PEM must decode with the correct passphrase");
    }

    #[test]
    fn wrong_passphrase_fails_distinctly_rather_than_silently_succeeding() {
        let pem = pem_for("ed25519", Some("correct horse battery staple"));
        let result = russh::keys::decode_secret_key(&pem, Some("wrong password"));
        assert!(result.is_err(), "decoding with a wrong passphrase must fail");
    }

    #[test]
    fn missing_passphrase_on_encrypted_key_fails_rather_than_silently_succeeding() {
        let pem = pem_for("rsa-4096", Some("correct horse battery staple"));
        let result = russh::keys::decode_secret_key(&pem, None);
        assert!(result.is_err(), "decoding an encrypted key with no passphrase must fail");
    }
}
