use tauri::Emitter;
use crate::modules::errors::LabonairError;
use crate::modules::ssh::{RushSession, SshState, TrustState};
use std::sync::Arc;

/// Establishes (or reuses) the unified per-`session_id` SSH session and
/// lazily opens its SFTP subsystem. Session storage moved from the old
/// dedicated `SftpState` into `SshState` (the same registry the terminal path
/// uses) per the russh migration's session-model decision — no code path
/// today looks up the same `session_id` from both a terminal tab and a
/// dedicated SFTP tab, so this is a pure simplification with no behavior
/// change for any existing tab.
#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn sftp_connect(
    session_id: String,
    host_id: String,
    passphrase: Option<String>,
    password_override: Option<String>,
    state: tauri::State<'_, SshState>,
    trust_state: tauri::State<'_, TrustState>,
    hosts_db: tauri::State<'_, crate::modules::hosts::HostsDb>,
    secrets: tauri::State<'_, crate::modules::secrets::SecretsState>,
    app: tauri::AppHandle,
) -> Result<(), LabonairError> {
    // Idempotent: a session already live under this session_id whose SFTP
    // subsystem is already open is left alone instead of dialing a second
    // TCP/SSH connection or reopening the subsystem. Needed for React
    // StrictMode's double-invoke of effects and for lazy sidebar-tree
    // sessions that may be requested more than once in quick succession.
    let existing = {
        let map = state.0.lock().map_err(|e| LabonairError::Internal(e.to_string()))?;
        map.get(&session_id).cloned()
    };
    if let Some(ref session) = existing {
        if session.sftp.get().is_some() {
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
        } else if let Some(ref cid) = credential_id {
            crate::modules::secrets::get_password(&app, &secrets, "labonair-cred", cid).ok().flatten()
        } else {
            crate::modules::secrets::get_password(&app, &secrets, "labonair-app", &host_id).ok().flatten()
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

    let result = sftp_connect_inner(
        session_id.clone(), passphrase, host_address, port, username, auth_method,
        private_key_path, keep_alive_interval, keep_alive_tries, default_path_sftp,
        password, existing, state.inner().clone(), trust_state.inner().clone(), app.clone(),
    ).await;

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
async fn sftp_connect_inner(
    session_id: String,
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
    existing: Option<Arc<RushSession>>,
    state: SshState,
    trust_state: TrustState,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let session = match existing {
        Some(session) => session,
        None => {
            // Steps 1-6: shared TCP + SSH + auth flow — the exact same helper
            // the terminal path (`ssh_connect_async`) uses.
            let handle = crate::modules::ssh::client::establish_authenticated_session(
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
            )
            .await?;

            let session = Arc::new(RushSession {
                handle,
                pty: tokio::sync::Mutex::new(None),
                sftp: tokio::sync::OnceCell::new(),
                shutdown: Arc::new(std::sync::atomic::AtomicBool::new(false)),
                disconnect_reason: Arc::new(std::sync::Mutex::new(None)),
            });
            {
                let mut map = state.0.lock().map_err(|e| e.to_string())?;
                map.insert(session_id.clone(), session.clone());
            }
            session
        }
    };

    // Step 7: lazily open the SFTP subsystem on this session's `OnceCell`.
    // Idempotent even if called again concurrently (a racing caller just sees
    // the already-populated cell). If opening the subsystem fails, the cell
    // is left uninitialized so a later `sftp_connect` retries just this step
    // against the already-authenticated handle instead of reconnecting from
    // scratch.
    let app_handle = app.clone();
    let _ = app_handle.emit("ssh_connect_log", serde_json::json!({
        "session_id": session_id, "message": "Initialising SFTP subsystem…"
    }));
    session
        .sftp
        .get_or_try_init(|| async {
            let channel = session
                .handle
                .channel_open_session()
                .await
                .map_err(|e| e.to_string())?;
            channel
                .request_subsystem(true, "sftp")
                .await
                .map_err(|e| e.to_string())?;
            let sftp = russh_sftp::client::SftpSession::new(channel.into_stream())
                .await
                .map_err(|e| e.to_string())?;
            Ok::<_, String>(Arc::new(sftp))
        })
        .await?;
    let _ = app_handle.emit("ssh_connect_log", serde_json::json!({
        "session_id": session_id, "message": "SFTP ready ✓"
    }));

    app.emit(
        "session_established",
        serde_json::json!({ "session_id": session_id, "default_path_sftp": default_path_sftp }),
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

/// Removes the unified session from `SshState` and closes the connection. A
/// dedicated SFTP tab's `session_id` is never shared with a terminal or
/// lazy-explorer session today (see the russh migration's session-model
/// decision), so removing the whole entry here is exactly equivalent to the
/// old `SftpState`-only removal from the frontend's perspective.
#[tauri::command]
pub fn sftp_disconnect(
    session_id: String,
    state: tauri::State<'_, SshState>,
) -> Result<(), LabonairError> {
    let mut map = state.0.lock().map_err(|e| LabonairError::Internal(e.to_string()))?;
    map.remove(&session_id);
    Ok(())
}
