use tauri::Emitter;
use tauri::ipc::Channel;
use crate::modules::errors::LabonairError;

macro_rules! log_step {
    ($app:expr, $session_id:expr, $msg:expr) => {
        let _ = $app.emit(
            "ssh_connect_log",
            serde_json::json!({ "session_id": $session_id, "message": $msg }),
        );
    };
}

/// Returns true if the ssh2 error message indicates the private key is
/// passphrase-protected and we attempted to load it without one.
/// Note: "unable to open private key file" is a file-not-found error, NOT a
/// passphrase error — exclude it so we don't show a passphrase dialog for
/// a missing/inaccessible key file.
fn is_passphrase_error(msg: &str) -> bool {
    let lower = msg.to_lowercase();
    if lower.contains("unable to open") || lower.contains("no such file") {
        return false;
    }
    lower.contains("passphrase")
        || lower.contains("bad passphrase")
        || lower.contains("failed getting public key")
        || lower.contains("unable to extract public key")
        || lower.contains("wrong passphrase")
}

#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn ssh_connect(
    session_id: String,
    host_id: String,
    passphrase: Option<String>,
    password_override: Option<String>,
    initial_cols: Option<u32>,
    initial_rows: Option<u32>,
    on_event: Channel<super::pty::SshPtyEvent>,
    state: tauri::State<'_, super::SshState>,
    trust_state: tauri::State<'_, super::TrustState>,
    hosts_db: tauri::State<'_, crate::modules::hosts::HostsDb>,
    secrets: tauri::State<'_, crate::modules::secrets::SecretsState>,
    app: tauri::AppHandle,
) -> Result<(), LabonairError> {
    // Step 1: Fetch host from SQLite (fast, sync — do before spawn_blocking)
    log_step!(app, session_id, "Reading host configuration…");
    let (host_address, port, username, auth_method, private_key_path, keep_alive_interval, keep_alive_tries, default_path_ssh, credential_id, jump_host_id) = {
        let conn = hosts_db.0.lock().map_err(|e| LabonairError::Internal(e.to_string()))?;
        let mut stmt = conn
            .prepare(
                "SELECT host_address, port, username, auth_method, private_key_path, \
                 keep_alive_interval, keep_alive_tries, default_path_ssh, credential_id, jump_host_id \
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
                row.get::<_, Option<String>>(9)?,
            ))
        })?
    };

    // Step 1b: Resolve credential — if the host references a credential, override auth fields.
    let (auth_method, private_key_path) = if let Some(cid) = &credential_id {
        log_step!(app, session_id, "Resolving credential…");
        let (cred_type, cred_key_path, cred_has_secret): (String, Option<String>, bool) = {
            let conn = hosts_db.0.lock().map_err(|e| LabonairError::Internal(e.to_string()))?;
            conn.query_row(
                "SELECT cred_type, key_path, has_secret FROM credentials WHERE id=?1",
                rusqlite::params![cid],
                |r| Ok((r.get(0)?, r.get(1)?, r.get::<_, i64>(2).map(|v| v != 0).unwrap_or(false))),
            )
            .map_err(|_| LabonairError::Internal(format!("Credential '{}' not found — it may have been deleted. Please update the host's auth settings.", cid)))?
        };
        let _ = cred_has_secret; // used below for password fetch
        (cred_type, cred_key_path)
    } else {
        (auth_method, private_key_path)
    };

    // Step 2: Fetch password — use override if provided, else local store.
    // When using a credential, fetch the credential's secret instead of the host's.
    let password: Option<String> = if auth_method == "password" {
        if password_override.is_some() {
            password_override.clone()
        } else {
            log_step!(app, session_id, "Retrieving credentials from local store…");
            if let Some(cid) = &credential_id {
                crate::modules::secrets::get_password(&app, &secrets, "labonair-cred", cid).ok().flatten()
            } else {
                crate::modules::secrets::get_password(&app, &secrets, "labonair-app", &host_id).ok().flatten()
            }
        }
    } else {
        None
    };

    // For key auth via credential, the passphrase may be stored in the credential's secret.
    let passphrase = if credential_id.is_some() && auth_method == "key" && passphrase.is_none() {
        if let Some(cid) = &credential_id {
            crate::modules::secrets::get_password(&app, &secrets, "labonair-cred", cid).ok().flatten()
        } else {
            passphrase
        }
    } else {
        passphrase
    };

    // Step 3: Resolve jump host fields (if any).
    let (
        jump_host_address,
        jump_port,
        jump_username,
        jump_auth_method,
        jump_private_key_path,
        jump_password,
        jump_keep_alive_interval,
    ) = if let Some(ref jid) = jump_host_id {
        log_step!(app, session_id, "Resolving jump host…");
        let (jh_addr, jh_port, jh_user, jh_auth, jh_key, jh_kai, jh_cred_id): (
            String, i64, String, String, Option<String>, Option<i64>, Option<String>,
        ) = {
            let conn = hosts_db.0.lock().map_err(|e| LabonairError::Internal(e.to_string()))?;
            conn.query_row(
                "SELECT host_address, port, username, auth_method, private_key_path, \
                 keep_alive_interval, credential_id FROM hosts WHERE id = ?1",
                rusqlite::params![jid],
                |row| {
                    Ok((
                        row.get(0)?,
                        row.get(1)?,
                        row.get(2)?,
                        row.get(3)?,
                        row.get(4)?,
                        row.get(5)?,
                        row.get(6)?,
                    ))
                },
            )
            .map_err(|_| LabonairError::Internal(format!("Jump host '{}' not found", jid)))?
        };

        // Resolve credential for jump host if needed
        let (jh_auth, jh_key) = if let Some(ref jcid) = jh_cred_id {
            let (cred_type, cred_key_path): (String, Option<String>) = {
                let conn = hosts_db.0.lock().map_err(|e| LabonairError::Internal(e.to_string()))?;
                conn.query_row(
                    "SELECT cred_type, key_path FROM credentials WHERE id=?1",
                    rusqlite::params![jcid],
                    |r| Ok((r.get(0)?, r.get(1)?)),
                )
                .map_err(|_| LabonairError::Internal(format!("Jump host credential '{}' not found", jcid)))?
            };
            (cred_type, cred_key_path)
        } else {
            (jh_auth, jh_key)
        };

        // Fetch jump host password from keyring
        let jh_pw: Option<String> = if jh_auth == "password" {
            if let Some(ref jcid) = jh_cred_id {
                crate::modules::secrets::get_password(&app, &secrets, "labonair-cred", jcid)
                    .ok()
                    .flatten()
            } else {
                crate::modules::secrets::get_password(&app, &secrets, "labonair-app", jid)
                    .ok()
                    .flatten()
            }
        } else {
            None
        };

        (
            Some(jh_addr),
            Some(jh_port),
            Some(jh_user),
            Some(jh_auth),
            jh_key,
            jh_pw,
            jh_kai,
        )
    } else {
        (None, None, None, None, None, None, None)
    };

    // All blocking I/O (TCP, SSH, SFTP) runs on a dedicated thread so the
    // Tokio runtime and the UI stay responsive during the connection.
    let state_inner = state.inner().clone();
    let trust_inner = trust_state.inner().clone();
    let app_clone = app.clone();
    let session_id_clone = session_id.clone();
    let host_id_clone = host_id.clone();
    let cols = initial_cols.unwrap_or(220);
    let rows = initial_rows.unwrap_or(50);
    let result = tokio::task::spawn_blocking(move || {
        ssh_connect_blocking(
            session_id_clone, host_id_clone.clone(), passphrase,
            host_address, port, username, auth_method,
            private_key_path, keep_alive_interval, keep_alive_tries,
            default_path_ssh, password, cols, rows,
            jump_host_address, jump_port, jump_username, jump_auth_method,
            jump_private_key_path, jump_password, jump_keep_alive_interval,
            state_inner, trust_inner, app_clone, on_event,
        )
    })
    .await
    .map_err(|e| LabonairError::Internal(e.to_string()))?;

    if result.is_ok() {
        // Update last_connected_at on the DB thread after successful connect.
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

    result.map_err(classify_ssh_error)
}

/// Maps a string error from ssh_connect_blocking to a structured LabonairError variant.
fn classify_ssh_error(s: String) -> LabonairError {
    let lower = s.to_lowercase();
    if lower.contains("authentication failed")
        || lower.contains("not authenticated")
        || s == "passphrase_required"
    {
        LabonairError::AuthFailed(s)
    } else if lower.contains("tcp connect")
        || lower.contains("network")
        || lower.contains("connection reset")
        || lower.contains("broken pipe")
        || lower.contains("no route to host")
    {
        LabonairError::NetworkError(s)
    } else if lower.contains("mismatch") || lower.contains("host key") || lower.contains("user rejected host") {
        LabonairError::HostKeyMismatch(s)
    } else {
        LabonairError::Internal(s)
    }
}

/// Quick-connect: initiate an SSH connection without a saved host record.
/// Password is provided directly; no keyring lookup.
#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn ssh_connect_quick(
    session_id: String,
    username: String,
    host_address: String,
    port: u16,
    password: String,
    passphrase: Option<String>,
    initial_cols: Option<u32>,
    initial_rows: Option<u32>,
    on_event: Channel<super::pty::SshPtyEvent>,
    state: tauri::State<'_, super::SshState>,
    trust_state: tauri::State<'_, super::TrustState>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let state_inner = state.inner().clone();
    let trust_inner = trust_state.inner().clone();
    let app_clone = app.clone();
    let session_id_clone = session_id.clone();
    let cols = initial_cols.unwrap_or(220);
    let rows = initial_rows.unwrap_or(50);
    tokio::task::spawn_blocking(move || {
        ssh_connect_blocking(
            session_id_clone,
            String::new(), // no host_id — quick connect has no DB record
            passphrase,
            host_address,
            port as i64,
            username,
            "password".to_string(),
            None,
            None,
            None,
            None,
            Some(password),
            cols,
            rows,
            // No jump host for quick connect
            None,
            None,
            None,
            None,
            None,
            None,
            None,
            state_inner,
            trust_inner,
            app_clone,
            on_event,
        )
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Signal the backend to accept or reject a host's fingerprint.
/// Called by the frontend after the user acts on the trust dialog.
#[tauri::command]
pub async fn ssh_trust_host(
    session_id: String,
    accepted: bool,
    trust_state: tauri::State<'_, super::TrustState>,
) -> Result<(), String> {
    let map = trust_state.0.lock().map_err(|e| e.to_string())?;
    if let Some(pair) = map.get(&session_id) {
        let (lock, cvar) = &**pair;
        *lock.lock().unwrap() = Some(accepted);
        cvar.notify_one();
    }
    Ok(())
}

/// Remove all known_hosts entries for a given host address.
/// Used when a host key mismatch is confirmed by the user.
#[tauri::command]
pub async fn ssh_remove_known_host(host_address: String) -> Result<(), String> {
    let path = dirs::home_dir()
        .map(|h| h.join(".ssh").join("known_hosts"))
        .ok_or_else(|| "Cannot determine home directory".to_string())?;

    if !path.exists() {
        return Ok(());
    }

    let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let filtered: Vec<&str> = content
        .lines()
        .filter(|line| {
            let trimmed = line.trim();
            if trimmed.starts_with('#') || trimmed.is_empty() {
                return true;
            }
            // Each line: "hostname[,hostname2] key-type base64-key [comment]"
            // Reject lines whose first field matches the host address.
            let first_field = trimmed.split_whitespace().next().unwrap_or("");
            !first_field.split(',').any(|h| h == host_address)
        })
        .collect();
    let new_content = filtered.join("\n") + "\n";
    std::fs::write(&path, new_content).map_err(|e| e.to_string())?;
    Ok(())
}

/// Block the calling thread until the user accepts or rejects the host key,
/// or until the 5-minute dialog timeout expires. Always removes the entry from
/// TrustState so the HashMap never leaks, even if the dialog is dismissed.
/// Returns `Ok(true)` = trusted, `Ok(false)` = rejected/timed-out.
fn wait_for_trust(session_id: &str, trust_state: &super::TrustState) -> Result<bool, String> {
    let pair = std::sync::Arc::new((
        std::sync::Mutex::new(None::<bool>),
        std::sync::Condvar::new(),
    ));
    {
        let mut map = trust_state.0.lock().map_err(|e| e.to_string())?;
        map.insert(session_id.to_string(), pair.clone());
    }

    let trusted = {
        let (lock, cvar) = &*pair;
        let mut guard = lock.lock().map_err(|e| e.to_string())?;
        let timeout = std::time::Duration::from_secs(300);
        loop {
            let (new_guard, result) = cvar
                .wait_timeout(guard, timeout)
                .map_err(|e| e.to_string())?;
            guard = new_guard;
            if result.timed_out() {
                // User dismissed the dialog — treat as rejection.
                break false;
            }
            if guard.is_some() {
                break guard.unwrap();
            }
        }
    };

    // Always clean up — no leaks regardless of how we exit.
    let _ = trust_state
        .0
        .lock()
        .map(|mut m| m.remove(session_id));

    Ok(trusted)
}

/// Like `establish_authenticated_session` but accepts an already-connected
/// TcpStream (e.g. the local end of a jump-host bridge).
#[allow(clippy::too_many_arguments)]
pub(crate) fn establish_authenticated_session_from_stream(
    session_id: &str,
    tcp: std::net::TcpStream,
    host_address: &str,
    port: i64,
    username: &str,
    auth_method: &str,
    private_key_path: Option<&str>,
    keep_alive_interval: Option<i64>,
    keep_alive_tries: Option<i64>,
    password: Option<&str>,
    passphrase: Option<&str>,
    trust_state: &super::TrustState,
    app: &tauri::AppHandle,
) -> Result<ssh2::Session, String> {
    let _ = keep_alive_tries;
    log_step!(app, session_id, "TCP connection established.");

    // SSH handshake
    log_step!(app, session_id, "Starting SSH handshake…");
    let mut session = ssh2::Session::new().map_err(|e| e.to_string())?;
    session.set_blocking(true);
    session.set_timeout(15_000);
    session.set_tcp_stream(tcp);
    session.handshake().map_err(|e| e.to_string())?;
    log_step!(app, session_id, "SSH handshake complete.");

    // want_reply=false uses SSH_MSG_IGNORE (no server reply expected),
    // avoiding libssh2 reply-wait state-machine conflicts with ch.read().
    let effective_interval = keep_alive_interval.unwrap_or(25i64);
    session.set_keepalive(false, effective_interval as u32);

    // Host-key verification
    log_step!(app, session_id, "Verifying host fingerprint…");
    let (host_key, key_type) = session.host_key().ok_or("no host key")?;
    let fingerprint = session
        .host_key_hash(ssh2::HashType::Md5)
        .map(|h| h.iter().map(|b| format!("{:02x}", b)).collect::<Vec<_>>().join(":"))
        .unwrap_or_else(|| "unknown".to_string());

    let known_hosts_path = dirs::home_dir().map(|h| h.join(".ssh").join("known_hosts"));
    let known_host_check_name = if port == 22 {
        host_address.to_string()
    } else {
        format!("[{}]:{}", host_address, port)
    };
    let known_host_status = if let Some(ref path) = known_hosts_path {
        let mut kh = session.known_hosts().map_err(|e| e.to_string())?;
        if path.exists() { let _ = kh.read_file(path, ssh2::KnownHostFileKind::OpenSSH); }
        let result = kh.check(&known_host_check_name, host_key);
        if matches!(result, ssh2::CheckResult::NotFound) && port != 22 {
            kh.check(host_address, host_key)
        } else { result }
    } else {
        ssh2::CheckResult::NotFound
    };

    match known_host_status {
        ssh2::CheckResult::Match => {
            log_step!(app, session_id, "Host fingerprint verified ✓");
        }
        ssh2::CheckResult::Mismatch => {
            log_step!(app, session_id, format!("Host key mismatch! Fingerprint: {}", fingerprint));
            app.emit("known_hosts_warning", serde_json::json!({
                "session_id": session_id, "fingerprint": fingerprint,
                "host": host_address, "is_mismatch": true
            })).map_err(|e| e.to_string())?;
            if !wait_for_trust(session_id, trust_state)? {
                return Err("User rejected host".to_string());
            }
            if let Some(ref path) = known_hosts_path {
                drop_known_host_entry(path, &known_host_check_name);
                drop_known_host_entry(path, host_address);
                let mut kh = session.known_hosts().map_err(|e| e.to_string())?;
                if path.exists() { let _ = kh.read_file(path, ssh2::KnownHostFileKind::OpenSSH); }
                let _ = kh.add(&known_host_check_name, host_key, "", ssh2::KnownHostKeyFormat::from(key_type));
                let _ = kh.write_file(path, ssh2::KnownHostFileKind::OpenSSH);
            }
            log_step!(app, session_id, "Host key accepted and updated in known_hosts ✓");
        }
        ssh2::CheckResult::NotFound | ssh2::CheckResult::Failure => {
            log_step!(app, session_id, format!("Unknown host — fingerprint: {}", fingerprint));
            app.emit("known_hosts_warning", serde_json::json!({
                "session_id": session_id, "fingerprint": fingerprint,
                "host": host_address, "is_mismatch": false
            })).map_err(|e| e.to_string())?;
            if !wait_for_trust(session_id, trust_state)? {
                return Err("User rejected host".to_string());
            }
            if let Some(ref path) = known_hosts_path {
                let mut kh = session.known_hosts().map_err(|e| e.to_string())?;
                if path.exists() { let _ = kh.read_file(path, ssh2::KnownHostFileKind::OpenSSH); }
                let _ = kh.add(&known_host_check_name, host_key, "", ssh2::KnownHostKeyFormat::from(key_type));
                let _ = kh.write_file(path, ssh2::KnownHostFileKind::OpenSSH);
            }
            log_step!(app, session_id, "Host trusted and added to known_hosts ✓");
        }
    }

    // Authentication
    log_step!(app, session_id, "Authenticating…");
    let authenticated = if auth_method == "key" {
        let key_path = private_key_path
            .map(std::path::Path::new)
            .ok_or("private_key_path not set for key auth")?;
        if !key_path.exists() {
            return Err(format!("Private key file not found: {}", key_path.display()));
        }
        let agent_ok = try_agent_auth(&session, username, session_id, app);
        if agent_ok {
            true
        } else {
            let passphrase_str = passphrase.unwrap_or("");
            log_step!(app, session_id, "Authenticating with public key file…");
            match session.userauth_pubkey_file(username, None, key_path, Some(passphrase_str)) {
                Ok(_) => true,
                Err(e) => {
                    let msg = e.to_string();
                    if passphrase.is_none() && is_passphrase_error(&msg) {
                        log_step!(app, session_id, "Key is passphrase-protected, prompting…");
                        app.emit("passphrase_required", serde_json::json!({ "session_id": session_id }))
                            .map_err(|e| e.to_string())?;
                        return Err("passphrase_required".to_string());
                    }
                    log_step!(app, session_id, format!("Key auth failed: {}", msg));
                    app.emit("auth_required", serde_json::json!({
                        "session_id": session_id, "prompt_message": msg, "is_2fa": false
                    })).map_err(|e| e.to_string())?;
                    return Err(format!("authentication failed: {}", msg));
                }
            }
        }
    } else {
        let pw = password.unwrap_or("");
        match session.userauth_password(username, pw) {
            Ok(_) => true,
            Err(e) => {
                let msg = e.to_string();
                log_step!(app, session_id, format!("Password auth failed: {}", msg));
                app.emit("auth_required", serde_json::json!({
                    "session_id": session_id, "prompt_message": msg, "is_2fa": false
                })).map_err(|e| e.to_string())?;
                return Err(format!("authentication failed: {}", msg));
            }
        }
    };

    if !authenticated || !session.authenticated() {
        log_step!(app, session_id, "Authentication failed.");
        app.emit("auth_required", serde_json::json!({
            "session_id": session_id, "prompt_message": "Authentication failed", "is_2fa": false
        })).map_err(|e| e.to_string())?;
        return Err("not authenticated".to_string());
    }

    log_step!(app, session_id, "Authenticated ✓");
    Ok(session)
}

/// Performs TCP connect → SSH handshake → host-key check → authentication.
/// Returns the fully authenticated, blocking-mode `ssh2::Session`.
/// Thin wrapper around `establish_authenticated_session_from_stream` that
/// first opens the TCP connection. Used by SFTP connect.
#[allow(clippy::too_many_arguments)]
pub(crate) fn establish_authenticated_session(
    session_id: &str,
    host_address: &str,
    port: i64,
    username: &str,
    auth_method: &str,
    private_key_path: Option<&str>,
    keep_alive_interval: Option<i64>,
    keep_alive_tries: Option<i64>,
    password: Option<&str>,
    passphrase: Option<&str>,
    trust_state: &super::TrustState,
    app: &tauri::AppHandle,
) -> Result<ssh2::Session, String> {
    log_step!(app, session_id, format!("TCP connecting to {}:{}…", host_address, port));
    let tcp = tcp_connect(host_address, port)
        .map_err(|e| format!("TCP connect to {}:{} failed: {}", host_address, port, e))?;
    establish_authenticated_session_from_stream(
        session_id, tcp, host_address, port, username, auth_method,
        private_key_path, keep_alive_interval, keep_alive_tries,
        password, passphrase, trust_state, app,
    )
}

#[allow(clippy::too_many_arguments)]
fn ssh_connect_blocking(
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
    default_path_ssh: Option<String>,
    password: Option<String>,
    initial_cols: u32,
    initial_rows: u32,
    // Jump host params (all None when no jump host is configured)
    jump_host_address: Option<String>,
    jump_port: Option<i64>,
    jump_username: Option<String>,
    jump_auth_method: Option<String>,
    jump_private_key_path: Option<String>,
    jump_password: Option<String>,
    jump_keep_alive_interval: Option<i64>,
    state: super::SshState,
    trust_state: super::TrustState,
    app: tauri::AppHandle,
    on_event: Channel<super::pty::SshPtyEvent>,
) -> Result<(), String> {
    // Establish TCP stream — either direct or via a jump host tunnel.
    let (tcp, jump_bridge) = if let (
        Some(ref jh_addr),
        Some(jh_port_val),
        Some(ref jh_user),
        Some(ref jh_auth),
    ) = (
        &jump_host_address,
        jump_port,
        &jump_username,
        &jump_auth_method,
    ) {
        // Circular reference guard
        if jh_addr.as_str() == host_address.as_str() && jh_port_val == port {
            return Err("Jump host cannot be the same as the target host".to_string());
        }
        let (stream, handle) = connect_via_jump(
            &session_id,
            jh_addr,
            jh_port_val,
            jh_user,
            jh_auth,
            jump_private_key_path.as_deref(),
            jump_password.as_deref(),
            jump_keep_alive_interval,
            &host_address,
            port,
            &trust_state,
            &app,
        )?;
        (stream, Some(handle))
    } else {
        (
            tcp_connect(&host_address, port)
                .map_err(|e| format!("TCP connect to {}:{} failed: {}", host_address, port, e))?,
            None,
        )
    };

    let session = establish_authenticated_session_from_stream(
        &session_id,
        tcp,
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
    )?;

    // Open PTY shell channel (switches session to non-blocking).
    let session_arc = std::sync::Arc::new(std::sync::Mutex::new(super::SessionHandle(session)));
    log_step!(app, session_id, "Opening PTY shell channel…");
    let (ready_tx, ready_rx) = std::sync::mpsc::channel::<()>();
    let (channel, shutdown) = super::pty::open_shell_channel(
        session_arc.clone(),
        &session_id,
        &app,
        state.clone(),
        ready_rx,
        initial_cols,
        initial_rows,
        keep_alive_interval.map(|v| v as u32),
        keep_alive_tries.map(|v| v as u32),
        on_event,
    )?;
    log_step!(app, session_id, "Shell channel open ✓");

    // Store session in SshState.
    {
        let mut map = state.0.lock().map_err(|e| e.to_string())?;
        map.insert(
            session_id.clone(),
            super::SshSession {
                session: session_arc,
                channel: Some(channel),
                shutdown,
                _jump_bridge: jump_bridge,
            },
        );
    }

    // Unblock the reader thread now that the session is in the map.
    let _ = ready_tx.send(());

    log_step!(app, session_id, "Session established ✓");
    app.emit(
        "session_established",
        serde_json::json!({ "session_id": session_id, "default_path_ssh": default_path_ssh }),
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

/// Bridges a local TCP socket to an ssh2::Channel (for jump-host tunnels).
/// Runs on a dedicated thread; exits when either side closes.
fn bridge_loop(
    bridge_stream: std::net::TcpStream,
    mut channel: ssh2::Channel,
    _jump_session: ssh2::Session,
) {
    use std::io::{ErrorKind, Read, Write};
    bridge_stream.set_nonblocking(true).ok();
    let mut buf_b2c = [0u8; 65536];
    let mut buf_c2b = [0u8; 65536];
    let mut bridge_r = match bridge_stream.try_clone() {
        Ok(s) => s,
        Err(_) => return,
    };
    let mut bridge_w = bridge_stream;
    loop {
        // bridge → channel
        match bridge_r.read(&mut buf_b2c) {
            Ok(0) => break,
            Ok(n) => {
                if channel.write_all(&buf_b2c[..n]).is_err() {
                    break;
                }
                let _ = channel.flush();
            }
            Err(e) if e.kind() == ErrorKind::WouldBlock => {}
            Err(_) => break,
        }
        // channel → bridge
        match channel.read(&mut buf_c2b) {
            Ok(0) if channel.eof() => break,
            Ok(n) => {
                if bridge_w.write_all(&buf_c2b[..n]).is_err() {
                    break;
                }
            }
            Err(e) if e.kind() == ErrorKind::WouldBlock => {}
            Err(_) => break,
        }
        std::thread::sleep(std::time::Duration::from_micros(50));
    }
}

/// Connects to a jump host, authenticates, opens a direct-tcpip channel to the
/// target, and starts a bridge thread. Returns a local TcpStream connected to
/// that bridge (which the main SSH session should use instead of a direct TCP
/// connection) plus the bridge thread handle.
#[allow(clippy::too_many_arguments)]
fn connect_via_jump(
    session_id: &str,
    jump_host_address: &str,
    jump_port: i64,
    jump_username: &str,
    jump_auth_method: &str,
    jump_private_key_path: Option<&str>,
    jump_password: Option<&str>,
    jump_keep_alive_interval: Option<i64>,
    target_host: &str,
    target_port: i64,
    trust_state: &super::TrustState,
    app: &tauri::AppHandle,
) -> Result<(std::net::TcpStream, std::thread::JoinHandle<()>), String> {
    log_step!(
        app,
        session_id,
        format!("Connecting to jump host {}:{}…", jump_host_address, jump_port)
    );
    let jump_tcp = tcp_connect(jump_host_address, jump_port)
        .map_err(|e| format!("Jump host TCP connect failed: {}", e))?;
    let mut jump_session = ssh2::Session::new().map_err(|e| e.to_string())?;
    jump_session.set_blocking(true);
    jump_session.set_timeout(15_000);
    let effective_interval = jump_keep_alive_interval.unwrap_or(25i64);
    jump_session.set_tcp_stream(jump_tcp);
    jump_session
        .handshake()
        .map_err(|e| format!("Jump host SSH handshake failed: {}", e))?;
    jump_session.set_keepalive(false, effective_interval as u32);

    // Host-key verification for jump host (use "{session_id}_jump" as the trust key)
    let jump_session_id = format!("{}_jump", session_id);
    let (host_key, key_type) = jump_session
        .host_key()
        .ok_or("jump host: no host key")?;
    let fingerprint = jump_session
        .host_key_hash(ssh2::HashType::Md5)
        .map(|h| {
            h.iter()
                .map(|b| format!("{:02x}", b))
                .collect::<Vec<_>>()
                .join(":")
        })
        .unwrap_or_else(|| "unknown".to_string());
    let known_hosts_path = dirs::home_dir().map(|h| h.join(".ssh").join("known_hosts"));
    let known_host_check_name = if jump_port == 22 {
        jump_host_address.to_string()
    } else {
        format!("[{}]:{}", jump_host_address, jump_port)
    };
    let known_host_status = if let Some(ref path) = known_hosts_path {
        let mut kh = jump_session.known_hosts().map_err(|e| e.to_string())?;
        if path.exists() {
            let _ = kh.read_file(path, ssh2::KnownHostFileKind::OpenSSH);
        }
        let result = kh.check(&known_host_check_name, host_key);
        if matches!(result, ssh2::CheckResult::NotFound) && jump_port != 22 {
            kh.check(jump_host_address, host_key)
        } else {
            result
        }
    } else {
        ssh2::CheckResult::NotFound
    };
    match known_host_status {
        ssh2::CheckResult::Match => {
            log_step!(app, session_id, "Jump host fingerprint verified ✓");
        }
        _ => {
            let is_mismatch = matches!(known_host_status, ssh2::CheckResult::Mismatch);
            app.emit(
                "known_hosts_warning",
                serde_json::json!({
                    "session_id": jump_session_id,
                    "fingerprint": fingerprint,
                    "host": jump_host_address,
                    "is_mismatch": is_mismatch,
                }),
            )
            .map_err(|e| e.to_string())?;
            if !wait_for_trust(&jump_session_id, trust_state)? {
                return Err("Jump host: user rejected host".to_string());
            }
            if let Some(ref path) = known_hosts_path {
                if is_mismatch {
                    drop_known_host_entry(path, &known_host_check_name);
                    drop_known_host_entry(path, jump_host_address);
                }
                let mut kh = jump_session.known_hosts().map_err(|e| e.to_string())?;
                if path.exists() {
                    let _ = kh.read_file(path, ssh2::KnownHostFileKind::OpenSSH);
                }
                let _ = kh.add(
                    &known_host_check_name,
                    host_key,
                    "",
                    ssh2::KnownHostKeyFormat::from(key_type),
                );
                let _ = kh.write_file(path, ssh2::KnownHostFileKind::OpenSSH);
            }
        }
    }

    // Authenticate jump host
    log_step!(app, session_id, "Authenticating jump host…");
    let jump_authed = if jump_auth_method == "key" {
        let key_path = jump_private_key_path
            .map(std::path::Path::new)
            .ok_or("jump host: private_key_path not set for key auth")?;
        let agent_ok = try_agent_auth(&jump_session, jump_username, &jump_session_id, app);
        if agent_ok {
            true
        } else {
            jump_session
                .userauth_pubkey_file(jump_username, None, key_path, None)
                .map(|_| true)
                .unwrap_or(false)
        }
    } else {
        let pw = jump_password.unwrap_or("");
        jump_session.userauth_password(jump_username, pw).is_ok()
    };
    if !jump_authed || !jump_session.authenticated() {
        return Err(format!(
            "Jump host authentication failed for {}@{}:{}",
            jump_username, jump_host_address, jump_port
        ));
    }
    log_step!(
        app,
        session_id,
        format!(
            "Jump host authenticated. Opening tunnel to {}:{}…",
            target_host, target_port
        )
    );

    // Open direct-tcpip channel to target through jump
    let channel = jump_session
        .channel_direct_tcpip(target_host, target_port as u16, None)
        .map_err(|e| {
            format!(
                "Jump host: failed to open tunnel to {}:{}: {}",
                target_host, target_port, e
            )
        })?;

    // Switch to non-blocking for bridge loop
    jump_session.set_blocking(false);

    // Create local loopback bridge
    let listener = std::net::TcpListener::bind("127.0.0.1:0")
        .map_err(|e| format!("Jump bridge: failed to bind: {}", e))?;
    let local_port = listener
        .local_addr()
        .map_err(|e| e.to_string())?
        .port();
    let local_stream = std::net::TcpStream::connect(("127.0.0.1", local_port))
        .map_err(|e| format!("Jump bridge: connect failed: {}", e))?;
    let (bridge_stream, _) = listener.accept().map_err(|e| e.to_string())?;

    log_step!(app, session_id, "Jump tunnel established ✓");

    let handle = std::thread::spawn(move || {
        bridge_loop(bridge_stream, channel, jump_session);
    });

    Ok((local_stream, handle))
}

/// Opens a TCP connection to host:port with a 10-second timeout.
/// Uses socket2 for explicit OS-level socket control and IPv4-only filtering.
/// This fixes "No route to host" errors on macOS with local network addresses.
fn tcp_connect(host: &str, port: i64) -> Result<std::net::TcpStream, String> {
    use socket2::{Domain, Socket, TcpKeepalive, Type};
    use std::net::{IpAddr, ToSocketAddrs};
    use std::time::Duration;

    let addr_str = format!("{}:{}", host, port);
    let addrs: Vec<std::net::SocketAddr> = addr_str
        .to_socket_addrs()
        .map_err(|e| format!("Failed to resolve {}: {}", addr_str, e))?
        .filter(|addr| matches!(addr.ip(), IpAddr::V4(_)))
        .collect();

    if addrs.is_empty() {
        return Err(format!("No IPv4 addresses resolved for {}", addr_str));
    }

    let mut last_err = String::new();
    for addr in &addrs {
        match Socket::new(Domain::IPV4, Type::STREAM, None) {
            Ok(socket) => {
                let _ = socket.set_nonblocking(false);
                let sock_addr: socket2::SockAddr = (*addr).into();
                match socket.connect_timeout(&sock_addr, Duration::from_secs(10)) {
                    Ok(_) => {
                        let ka = TcpKeepalive::new()
                            .with_time(Duration::from_secs(60))
                            .with_interval(Duration::from_secs(15));
                        socket.set_tcp_keepalive(&ka).ok();
                        let tcp: std::net::TcpStream = socket.into();
                        tcp.set_nodelay(true).ok();
                        return Ok(tcp);
                    }
                    Err(e) => last_err = e.to_string(),
                }
            }
            Err(e) => last_err = e.to_string(),
        }
    }
    Err(last_err)
}


/// Tries to authenticate via the running ssh-agent (SSH_AUTH_SOCK).
/// Returns true if authentication succeeded, false if agent unavailable or all
/// identities were rejected — never panics.
fn try_agent_auth(
    session: &ssh2::Session,
    username: &str,
    session_id: &str,
    app: &tauri::AppHandle,
) -> bool {
    if std::env::var("SSH_AUTH_SOCK").is_err() {
        return false;
    }
    let mut agent = match session.agent() {
        Ok(a) => a,
        Err(_) => return false,
    };
    if agent.connect().is_err() {
        return false;
    }
    if agent.list_identities().is_err() {
        return false;
    }
    let identities = match agent.identities() {
        Ok(ids) => ids,
        Err(_) => return false,
    };
    for identity in identities {
        if agent.userauth(username, &identity).is_ok() {
            log_step!(app, session_id, "Authenticated via ssh-agent ✓");
            return true;
        }
    }
    false
}

/// Remove all known_hosts lines matching `host_address` via file rewrite.
pub fn drop_known_host_entry(path: &std::path::Path, host_address: &str) {
    if !path.exists() {
        return;
    }
    let Ok(content) = std::fs::read_to_string(path) else { return };
    let filtered: Vec<&str> = content
        .lines()
        .filter(|line| {
            let trimmed = line.trim();
            if trimmed.starts_with('#') || trimmed.is_empty() {
                return true;
            }
            let first_field = trimmed.split_whitespace().next().unwrap_or("");
            !first_field.split(',').any(|h| h == host_address)
        })
        .collect();
    let new_content = filtered.join("\n") + "\n";
    let _ = std::fs::write(path, new_content);
}

#[tauri::command]
pub fn ssh_disconnect(
    session_id: String,
    state: tauri::State<'_, super::SshState>,
) -> Result<(), String> {
    let mut map = state.0.lock().map_err(|e| e.to_string())?;
    if let Some(mut sess) = map.remove(&session_id) {
        // Signal the reader thread to exit before closing the channel.
        sess.shutdown.store(true, std::sync::atomic::Ordering::Relaxed);
        if let Some(mut ch) = sess.channel.take() {
            let _ = ch.close();
        }
        if let Ok(s) = sess.session.lock() {
            let _ = s.0.disconnect(None, "User disconnected", None);
        }
    }
    Ok(())
}
