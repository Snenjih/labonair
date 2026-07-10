use tauri::Emitter;
use crate::modules::errors::LabonairError;
use crate::modules::ssh::TrustState;
use super::state::{SftpSession, SftpSessionInner, SftpState};

/// Establishes a dedicated SSH + SFTP connection for SFTP operations.
/// Stored in `SftpState` (separate from `SshState`) so SFTP I/O never
/// blocks the PTY terminal mutex.
#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn sftp_connect(
    session_id: String,
    host_id: String,
    passphrase: Option<String>,
    password_override: Option<String>,
    state: tauri::State<'_, SftpState>,
    trust_state: tauri::State<'_, TrustState>,
    hosts_db: tauri::State<'_, crate::modules::hosts::HostsDb>,
    secrets: tauri::State<'_, crate::modules::secrets::SecretsState>,
    app: tauri::AppHandle,
) -> Result<(), LabonairError> {
    // Idempotent: a session already live under this session_id is left alone
    // instead of opening a second TCP/SSH connection. Needed for React
    // StrictMode's double-invoke of effects and for lazy sidebar-tree
    // sessions that may be requested more than once in quick succession.
    {
        let map = state.0.lock().map_err(|e| LabonairError::Internal(e.to_string()))?;
        if map.contains_key(&session_id) {
            return Ok(());
        }
    }

    // Fetch host from DB (fast, sync).
    let (host_address, port, username, auth_method, private_key_path, keep_alive_interval,
         keep_alive_tries, default_path_sftp, credential_id) = {
        let conn = hosts_db.0.lock().map_err(|e| LabonairError::Internal(e.to_string()))?;
        let mut stmt = conn.prepare(
            "SELECT host_address, port, username, auth_method, private_key_path, \
             keep_alive_interval, keep_alive_tries, default_path_sftp, credential_id \
             FROM hosts WHERE id = ?1",
        )?;
        stmt.query_row(rusqlite::params![host_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, i64>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, Option<String>>(4)?,
                row.get::<_, Option<i64>>(5)?,
                row.get::<_, Option<i64>>(6)?,
                row.get::<_, Option<String>>(7)?,
                row.get::<_, Option<String>>(8)?,
            ))
        })?
    };

    // Resolve credential overrides.
    let (auth_method, private_key_path) = if let Some(ref cid) = credential_id {
        let conn = hosts_db.0.lock().map_err(|e| LabonairError::Internal(e.to_string()))?;
        let (cred_type, cred_key_path): (String, Option<String>) = conn.query_row(
            "SELECT cred_type, key_path FROM credentials WHERE id=?1",
            rusqlite::params![cid],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .map_err(|_| LabonairError::Internal(format!(
            "Credential '{}' not found — it may have been deleted.", cid
        )))?;
        (cred_type, cred_key_path)
    } else {
        (auth_method, private_key_path)
    };

    // Fetch password from keychain.
    let password: Option<String> = if auth_method == "password" {
        if password_override.is_some() {
            password_override.clone()
        } else {
            if let Some(ref cid) = credential_id {
                crate::modules::secrets::get_password(&app, &secrets, "labonair-cred", cid).ok().flatten()
            } else {
                crate::modules::secrets::get_password(&app, &secrets, "labonair-app", &host_id).ok().flatten()
            }
        }
    } else {
        None
    };

    // Passphrase from credential secret for key auth.
    let passphrase = if credential_id.is_some() && auth_method == "key" && passphrase.is_none() {
        if let Some(ref cid) = credential_id {
            crate::modules::secrets::get_password(&app, &secrets, "labonair-cred", cid).ok().flatten()
        } else {
            passphrase
        }
    } else {
        passphrase
    };

    let state_inner = state.inner().clone();
    let trust_inner = trust_state.inner().clone();
    let app_clone = app.clone();
    let session_id_clone = session_id.clone();
    let host_id_clone = host_id.clone();

    let result = tokio::task::spawn_blocking(move || {
        sftp_connect_blocking(
            session_id_clone, host_id_clone, passphrase,
            host_address, port, username, auth_method,
            private_key_path, keep_alive_interval, keep_alive_tries,
            default_path_sftp, password, state_inner, trust_inner, app_clone,
        )
    })
    .await
    .map_err(|e| LabonairError::Internal(e.to_string()))?;

    if result.is_ok() {
        let conn = hosts_db.0.lock().map_err(|e| LabonairError::Internal(e.to_string()))?;
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as i64;
        let _ = conn.execute(
            "UPDATE hosts SET last_connected_at = ?1 WHERE id = ?2",
            rusqlite::params![now, host_id],
        );
    }

    result.map_err(|s| {
        let lower = s.to_lowercase();
        if lower.contains("authentication failed") || lower.contains("not authenticated") || s == "passphrase_required" {
            LabonairError::AuthFailed(s)
        } else if lower.contains("tcp connect") || lower.contains("network") || lower.contains("broken pipe") {
            LabonairError::NetworkError(s)
        } else if lower.contains("host key") {
            LabonairError::HostKeyMismatch(s)
        } else {
            LabonairError::Internal(s)
        }
    })
}

#[allow(clippy::too_many_arguments)]
fn sftp_connect_blocking(
    session_id: String,
    _host_id: String,
    passphrase: Option<String>,
    host_address: String,
    port: i64,
    username: String,
    auth_method: String,
    private_key_path: Option<String>,
    keep_alive_interval: Option<i64>,
    keep_alive_tries: Option<i64>,
    default_path_sftp: Option<String>,
    password: Option<String>,
    state: SftpState,
    trust_state: TrustState,
    app: tauri::AppHandle,
) -> Result<(), String> {
    // Step 1-6: shared TCP + SSH + auth flow.
    let session = crate::modules::ssh::client::establish_authenticated_session(
        &session_id,
        &host_address,
        port,
        &username,
        &auth_method,
        private_key_path.as_deref(),
        keep_alive_interval,
        keep_alive_tries,
        password.as_deref(),
        passphrase.as_deref(),
        &trust_state,
        &app,
        true, // fail fast — the sidebar Explorer has no trust-prompt UI of its own
    )?;

    // Step 7: Open SFTP subsystem. Use 60s timeout for slow hosts (RPi, etc.)
    let app_handle = app.clone();
    let _ = app_handle.emit("ssh_connect_log", serde_json::json!({
        "session_id": session_id, "message": "Initialising SFTP subsystem…"
    }));
    session.set_timeout(60_000);
    log::debug!("[SFTP-CONNECT] calling session.sftp() in blocking mode…");
    let sftp = match session.sftp() {
        Ok(s) => {
            log::debug!("[SFTP-CONNECT] SFTP subsystem open ✓");
            let _ = app_handle.emit("ssh_connect_log", serde_json::json!({
                "session_id": session_id, "message": "SFTP ready ✓"
            }));
            s
        }
        Err(e) => {
            log::warn!("[SFTP-CONNECT] SFTP subsystem failed: {}", e);
            return Err(format!("SFTP subsystem unavailable: {}", e));
        }
    };

    // Step 8: Store dedicated SftpSession in SftpState. Session + SFTP handle
    // share one lock (SftpSessionInner) — see its doc comment for why.
    let inner_arc = std::sync::Arc::new(std::sync::Mutex::new(SftpSessionInner { session, sftp }));
    {
        let mut map = state.0.lock().map_err(|e| e.to_string())?;
        map.insert(session_id.clone(), SftpSession { inner: inner_arc });
    }

    log::debug!("[SFTP-CONNECT] session_established emitting for {}", session_id);
    app.emit(
        "session_established",
        serde_json::json!({ "session_id": session_id, "default_path_sftp": default_path_sftp }),
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

/// Removes the SFTP session from `SftpState` and closes the connection.
#[tauri::command]
pub fn sftp_disconnect(
    session_id: String,
    state: tauri::State<'_, SftpState>,
) -> Result<(), LabonairError> {
    let mut map = state.0.lock().map_err(|e| LabonairError::Internal(e.to_string()))?;
    map.remove(&session_id);
    Ok(())
}
