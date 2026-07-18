use serde::Serialize;

#[derive(Debug, Clone, Serialize, serde::Deserialize)]
pub struct SshConfigEntry {
    pub alias: String,
    pub host_address: String,
    pub port: i64,
    pub username: Option<String>,
    pub auth_method: String,
    pub private_key_path: Option<String>,
    pub proxy_jump: Option<String>,
}

fn flush_entry(
    alias: String,
    map: &std::collections::HashMap<String, String>,
) -> Option<SshConfigEntry> {
    if alias.contains('*') || alias.contains('?') {
        return None;
    }
    let host_address = map.get("hostname").cloned().unwrap_or_else(|| alias.clone());
    let port: i64 = map
        .get("port")
        .and_then(|p| p.parse().ok())
        .filter(|&p: &i64| p > 0 && p < 65536)
        .unwrap_or(22);
    let username = map.get("user").cloned();
    let (auth_method, private_key_path) = if let Some(key) = map.get("identityfile") {
        let expanded = if key.starts_with("~/") {
            dirs::home_dir()
                .map(|h| h.join(&key[2..]).to_string_lossy().to_string())
                .unwrap_or_else(|| key.clone())
        } else {
            key.clone()
        };
        ("key".to_string(), Some(expanded))
    } else {
        ("password".to_string(), None)
    };
    let proxy_jump = map.get("proxyjump").cloned().and_then(|pj| {
        let pj = pj.trim().to_string();
        if pj.eq_ignore_ascii_case("none") {
            None
        } else {
            Some(pj)
        }
    });
    Some(SshConfigEntry {
        alias,
        host_address,
        port,
        username,
        auth_method,
        private_key_path,
        proxy_jump,
    })
}

pub fn parse_ssh_config(content: &str) -> Vec<SshConfigEntry> {
    let mut entries: Vec<SshConfigEntry> = Vec::new();
    let mut current_alias: Option<String> = None;
    let mut current: std::collections::HashMap<String, String> = std::collections::HashMap::new();

    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }

        let sep = match trimmed.find(|c: char| c.is_whitespace() || c == '=') {
            Some(p) => p,
            None => continue,
        };
        let key = trimmed[..sep].to_lowercase();
        let value = trimmed[sep..]
            .trim_start_matches(|c: char| c.is_whitespace() || c == '=')
            .trim()
            .to_string();
        if value.is_empty() {
            continue;
        }

        if key == "host" {
            if let Some(alias) = current_alias.take() {
                if let Some(entry) = flush_entry(alias, &current) {
                    entries.push(entry);
                }
            }
            current.clear();
            current_alias = Some(value);
        } else if current_alias.is_some() {
            // Only store first occurrence of each key (SSH config precedence)
            current.entry(key).or_insert(value);
        }
    }
    if let Some(alias) = current_alias {
        if let Some(entry) = flush_entry(alias, &current) {
            entries.push(entry);
        }
    }
    entries
}

#[tauri::command]
pub async fn parse_ssh_config_cmd() -> Result<Vec<SshConfigEntry>, String> {
    let path = dirs::home_dir()
        .map(|h| h.join(".ssh").join("config"))
        .ok_or("Could not determine home directory")?;
    if !path.exists() {
        return Ok(vec![]);
    }
    let content = std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read ~/.ssh/config: {}", e))?;
    Ok(parse_ssh_config(&content))
}

#[tauri::command]
pub async fn import_ssh_config_entries(
    entries: Vec<SshConfigEntry>,
    hosts_db: tauri::State<'_, crate::modules::hosts::HostsDb>,
) -> Result<Vec<String>, String> {
    use uuid::Uuid;
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64;

    // First pass: insert all hosts, collect alias→id mapping
    let mut alias_to_id: std::collections::HashMap<String, String> = std::collections::HashMap::new();
    let mut created_ids: Vec<String> = Vec::new();

    for entry in &entries {
        let id = Uuid::new_v4().to_string();
        let conn = hosts_db.0.lock().map_err(|e| e.to_string())?;
        // Get current max sort_order
        let sort_order: i64 = conn
            .query_row(
                "SELECT COALESCE(MAX(sort_order), 0) + 1 FROM hosts",
                [],
                |r| r.get(0),
            )
            .unwrap_or(0);
        conn.execute(
            "INSERT INTO hosts (id, name, host_address, port, username, auth_method, private_key_path, created_at, sort_order) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            rusqlite::params![
                id,
                entry.alias,
                entry.host_address,
                entry.port,
                entry.username.as_deref().unwrap_or(""),
                entry.auth_method,
                entry.private_key_path,
                now,
                sort_order,
            ],
        )
        .map_err(|e| e.to_string())?;
        alias_to_id.insert(entry.alias.clone(), id.clone());
        created_ids.push(id);
    }

    // Second pass: resolve proxy_jump aliases to host_ids
    for (entry, host_id) in entries.iter().zip(created_ids.iter()) {
        if let Some(ref pj_alias) = entry.proxy_jump {
            // Extract just the host part from "user@host:port" format
            let pj_host = pj_alias
                .split('@')
                .next_back()
                .unwrap_or(pj_alias)
                .split(':')
                .next()
                .unwrap_or(pj_alias)
                .trim();
            if let Some(jump_id) = alias_to_id.get(pj_host) {
                let conn = hosts_db.0.lock().map_err(|e| e.to_string())?;
                let _ = conn.execute(
                    "UPDATE hosts SET jump_host_id = ?1 WHERE id = ?2",
                    rusqlite::params![jump_id, host_id],
                );
            }
        }
    }

    Ok(created_ids)
}

/// `(cred_type, key_path)` per credential id, used by `export_ssh_config` to
/// decide whether a `"credential"`-auth host's `IdentityFile` is safe to
/// emit (only for file-based, `cred_type == "key"` credentials).
type CredentialExportMap = std::collections::HashMap<String, (String, Option<String>)>;

/// A host row's fields relevant to SSH config export, keyed by host id in
/// `export_ssh_config` so a jump host's name can be resolved even when the
/// jump host itself isn't part of the requested `host_ids` batch.
struct ExportHostRow {
    name: String,
    host_address: String,
    port: i64,
    username: String,
    auth_method: String,
    private_key_path: Option<String>,
    credential_id: Option<String>,
    jump_host_id: Option<String>,
}

/// Generates an `~/.ssh/config`-format text block for the given hosts — the
/// exact reverse of `flush_entry`'s field mapping: `Host` <- name,
/// `HostName` <- host_address, `Port` <- port (omitted when 22, the
/// default), `User` <- username, `IdentityFile` <- private_key_path (only
/// for `auth_method == "key"`, or a `"credential"`-auth host whose
/// credential is itself file-based), `ProxyJump` <- the jump host's name.
///
/// `ProxyJump` resolution is best-effort against the *entire* hosts table,
/// not just `host_ids` — a jump host outside the exported batch still gets
/// a `ProxyJump <name>` line, it just won't be self-contained as a file on
/// its own. Never writes a secret: password-auth hosts and password-type
/// credentials always omit `IdentityFile`, since no plaintext value is ever
/// safe to embed in a `~/.ssh/config`-style file.
#[tauri::command]
pub async fn export_ssh_config(
    host_ids: Vec<String>,
    hosts_db: tauri::State<'_, crate::modules::hosts::HostsDb>,
) -> Result<String, String> {
    let (all_hosts, credentials): (std::collections::HashMap<String, ExportHostRow>, CredentialExportMap) = {
        let conn = hosts_db.0.lock().map_err(|e| e.to_string())?;

        let mut host_stmt = conn
            .prepare(
                "SELECT id, name, host_address, port, username, auth_method, \
                 private_key_path, credential_id, jump_host_id FROM hosts",
            )
            .map_err(|e| e.to_string())?;
        let hosts = host_stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    ExportHostRow {
                        name: row.get(1)?,
                        host_address: row.get(2)?,
                        port: row.get(3)?,
                        username: row.get(4)?,
                        auth_method: row.get(5)?,
                        private_key_path: row.get(6)?,
                        credential_id: row.get(7)?,
                        jump_host_id: row.get(8)?,
                    },
                ))
            })
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect::<std::collections::HashMap<_, _>>();

        let mut cred_stmt = conn
            .prepare("SELECT id, cred_type, key_path FROM credentials")
            .map_err(|e| e.to_string())?;
        let creds = cred_stmt
            .query_map([], |row| {
                Ok((row.get::<_, String>(0)?, (row.get::<_, String>(1)?, row.get::<_, Option<String>>(2)?)))
            })
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect::<std::collections::HashMap<_, _>>();

        (hosts, creds)
    };

    let mut out = String::new();
    for id in &host_ids {
        let Some(host) = all_hosts.get(id) else { continue };

        // IdentityFile: direct key auth, or a file-based ("key"-type)
        // credential. Everything else (password auth, password-type
        // credential, "none") omits the line entirely.
        let identity_file = match host.auth_method.as_str() {
            "key" => host.private_key_path.clone(),
            "credential" => host
                .credential_id
                .as_ref()
                .and_then(|cid| credentials.get(cid))
                .filter(|(cred_type, _)| cred_type.as_str() == "key")
                .and_then(|(_, key_path)| key_path.clone()),
            _ => None,
        };

        let proxy_jump = host
            .jump_host_id
            .as_ref()
            .and_then(|jid| all_hosts.get(jid))
            .map(|jh| jh.name.clone());

        out.push_str(&format!("Host {}\n", host.name));
        out.push_str(&format!("    HostName {}\n", host.host_address));
        if host.port != 22 {
            out.push_str(&format!("    Port {}\n", host.port));
        }
        if !host.username.is_empty() {
            out.push_str(&format!("    User {}\n", host.username));
        }
        if let Some(key) = identity_file {
            out.push_str(&format!("    IdentityFile {}\n", key));
        }
        if let Some(pj) = proxy_jump {
            out.push_str(&format!("    ProxyJump {}\n", pj));
        }
        out.push('\n');
    }

    Ok(out)
}
