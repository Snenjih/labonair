use tauri::Emitter;

macro_rules! log_step {
    ($app:expr, $tab_id:expr, $msg:expr) => {
        let _ = $app.emit(
            "ssh_connect_log",
            serde_json::json!({ "tab_id": $tab_id, "message": $msg }),
        );
    };
}

/// Returns true if the ssh2 error message indicates the private key is
/// passphrase-protected and we attempted to load it without one.
fn is_passphrase_error(msg: &str) -> bool {
    let lower = msg.to_lowercase();
    lower.contains("passphrase")
        || lower.contains("bad passphrase")
        || lower.contains("failed getting public key")
        || lower.contains("unable to extract public key")
        || lower.contains("wrong passphrase")
}

#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn ssh_connect(
    tab_id: String,
    host_id: String,
    passphrase: Option<String>,
    password_override: Option<String>,
    init_sftp: bool,
    initial_cols: Option<u32>,
    initial_rows: Option<u32>,
    state: tauri::State<'_, super::SshState>,
    trust_state: tauri::State<'_, super::TrustState>,
    hosts_db: tauri::State<'_, crate::modules::hosts::HostsDb>,
    secrets: tauri::State<'_, crate::modules::secrets::SecretsState>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    // Step 1: Fetch host from SQLite (fast, sync — do before spawn_blocking)
    log_step!(app, tab_id, "Reading host configuration…");
    let (host_address, port, username, auth_method, private_key_path, keep_alive_interval, keep_alive_tries, default_path_ssh) = {
        let conn = hosts_db.0.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare(
                "SELECT host_address, port, username, auth_method, private_key_path, \
                 keep_alive_interval, keep_alive_tries, default_path_ssh \
                 FROM hosts WHERE id = ?1",
            )
            .map_err(|e| e.to_string())?;
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
            ))
        })
        .map_err(|e| e.to_string())?
    };

    // Step 2: Fetch password — use override if provided, else local store.
    let password: Option<String> = if auth_method == "password" {
        if password_override.is_some() {
            password_override.clone()
        } else {
            log_step!(app, tab_id, "Retrieving credentials from local store…");
            crate::modules::secrets::get_password(&app, &secrets, "nexum-app", &host_id).ok().flatten()
        }
    } else {
        None
    };

    // All blocking I/O (TCP, SSH, SFTP) runs on a dedicated thread so the
    // Tokio runtime and the UI stay responsive during the connection.
    let state_inner = state.inner().clone();
    let trust_inner = trust_state.inner().clone();
    let app_clone = app.clone();
    let tab_id_clone = tab_id.clone();
    let host_id_clone = host_id.clone();
    let cols = initial_cols.unwrap_or(220);
    let rows = initial_rows.unwrap_or(50);
    let result = tokio::task::spawn_blocking(move || {
        ssh_connect_blocking(
            tab_id_clone, host_id_clone.clone(), passphrase,
            host_address, port, username, auth_method,
            private_key_path, keep_alive_interval, keep_alive_tries,
            default_path_ssh, password, init_sftp, cols, rows,
            state_inner, trust_inner, app_clone,
        )
    })
    .await
    .map_err(|e| e.to_string())?;

    if result.is_ok() {
        // Update last_connected_at on the DB thread after successful connect.
        let conn = hosts_db.0.lock().map_err(|e| e.to_string())?;
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as i64;
        let _ = conn.execute(
            "UPDATE hosts SET last_connected_at = ?1 WHERE id = ?2",
            rusqlite::params![now, host_id],
        );
    }

    result
}

/// Quick-connect: initiate an SSH connection without a saved host record.
/// Password is provided directly; no keyring lookup.
#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn ssh_connect_quick(
    tab_id: String,
    username: String,
    host_address: String,
    port: u16,
    password: String,
    passphrase: Option<String>,
    initial_cols: Option<u32>,
    initial_rows: Option<u32>,
    state: tauri::State<'_, super::SshState>,
    trust_state: tauri::State<'_, super::TrustState>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let state_inner = state.inner().clone();
    let trust_inner = trust_state.inner().clone();
    let app_clone = app.clone();
    let tab_id_clone = tab_id.clone();
    let cols = initial_cols.unwrap_or(220);
    let rows = initial_rows.unwrap_or(50);
    tokio::task::spawn_blocking(move || {
        ssh_connect_blocking(
            tab_id_clone,
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
            false, // quick connect is always a terminal session
            cols,
            rows,
            state_inner,
            trust_inner,
            app_clone,
        )
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Signal the backend to accept or reject a host's fingerprint.
/// Called by the frontend after the user acts on the trust dialog.
#[tauri::command]
pub async fn ssh_trust_host(
    tab_id: String,
    accepted: bool,
    trust_state: tauri::State<'_, super::TrustState>,
) -> Result<(), String> {
    let map = trust_state.0.lock().map_err(|e| e.to_string())?;
    if let Some(pair) = map.get(&tab_id) {
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
fn wait_for_trust(tab_id: &str, trust_state: &super::TrustState) -> Result<bool, String> {
    let pair = std::sync::Arc::new((
        std::sync::Mutex::new(None::<bool>),
        std::sync::Condvar::new(),
    ));
    {
        let mut map = trust_state.0.lock().map_err(|e| e.to_string())?;
        map.insert(tab_id.to_string(), pair.clone());
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
        .map(|mut m| m.remove(tab_id));

    Ok(trusted)
}

#[allow(clippy::too_many_arguments)]
fn ssh_connect_blocking(
    tab_id: String,
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
    init_sftp: bool,
    initial_cols: u32,
    initial_rows: u32,
    state: super::SshState,
    trust_state: super::TrustState,
    app: tauri::AppHandle,
) -> Result<(), String> {
    // (password already fetched by the async wrapper above)
    let _ = keep_alive_tries; // suppress unused warning

    // Step 3: TCP connect (DNS resolution + connect, with a 15-second total timeout)
    log_step!(
        app,
        tab_id,
        format!("TCP connecting to {}:{}…", host_address, port)
    );
    let tcp = tcp_connect(&host_address, port)
        .map_err(|e| format!("TCP connect to {}:{} failed: {}", host_address, port, e))?;
    log_step!(app, tab_id, "TCP connection established.");

    // Step 4: SSH handshake
    log_step!(app, tab_id, "Starting SSH handshake…");
    let mut session = ssh2::Session::new().map_err(|e| e.to_string())?;
    session.set_blocking(true);
    session.set_timeout(15_000);
    session.set_tcp_stream(tcp);
    session.handshake().map_err(|e| e.to_string())?;
    log_step!(app, tab_id, "SSH handshake complete.");

    // Configure keepalive if set
    if let Some(interval) = keep_alive_interval {
        let tries = keep_alive_tries.unwrap_or(3) as u32;
        session.set_keepalive(true, interval as u32);
        let _ = tries;
    }

    // Step 5: known_hosts check
    log_step!(app, tab_id, "Verifying host fingerprint…");
    let (host_key, key_type) = session.host_key().ok_or("no host key")?;
    let fingerprint = session
        .host_key_hash(ssh2::HashType::Md5)
        .map(|h| {
            h.iter()
                .map(|b| format!("{:02x}", b))
                .collect::<Vec<_>>()
                .join(":")
        })
        .unwrap_or_else(|| "unknown".to_string());

    let known_hosts_path = dirs::home_dir().map(|h| h.join(".ssh").join("known_hosts"));

    // For non-standard ports, OpenSSH known_hosts uses the "[host]:port" format.
    // We must check both the bracketed form and the plain hostname so that keys
    // stored by either `ssh-keyscan -p <port>` or a previous plain-host accept
    // are correctly recognised.
    let known_host_check_name = if port == 22 {
        host_address.clone()
    } else {
        format!("[{}]:{}", host_address, port)
    };
    let known_host_status = if let Some(ref path) = known_hosts_path {
        let mut kh = session.known_hosts().map_err(|e| e.to_string())?;
        if path.exists() {
            let _ = kh.read_file(path, ssh2::KnownHostFileKind::OpenSSH);
        }
        let result = kh.check(&known_host_check_name, host_key);
        // Fall back to plain hostname check (covers keys stored without port).
        if matches!(result, ssh2::CheckResult::NotFound) && port != 22 {
            kh.check(&host_address, host_key)
        } else {
            result
        }
    } else {
        ssh2::CheckResult::NotFound
    };

    match known_host_status {
        ssh2::CheckResult::Match => {
            log_step!(app, tab_id, "Host fingerprint verified ✓");
        }
        ssh2::CheckResult::Mismatch => {
            log_step!(
                app,
                tab_id,
                format!("Host key mismatch! Fingerprint: {}", fingerprint)
            );
            app.emit(
                "known_hosts_warning",
                serde_json::json!({
                    "tab_id": tab_id,
                    "fingerprint": fingerprint,
                    "host": host_address,
                    "is_mismatch": true
                }),
            )
            .map_err(|e| e.to_string())?;

            if !wait_for_trust(&tab_id, &trust_state)? {
                return Err("User rejected host".to_string());
            }

            // Remove old entry and add updated host key to known_hosts.
            if let Some(ref path) = known_hosts_path {
                drop_known_host_entry(path, &known_host_check_name);
                drop_known_host_entry(path, &host_address);
                let mut kh = session.known_hosts().map_err(|e| e.to_string())?;
                if path.exists() {
                    let _ = kh.read_file(path, ssh2::KnownHostFileKind::OpenSSH);
                }
                let _ = kh.add(&known_host_check_name, host_key, "", ssh2::KnownHostKeyFormat::from(key_type));
                let _ = kh.write_file(path, ssh2::KnownHostFileKind::OpenSSH);
            }
            log_step!(app, tab_id, "Host key accepted and updated in known_hosts ✓");
        }
        ssh2::CheckResult::NotFound | ssh2::CheckResult::Failure => {
            log_step!(
                app,
                tab_id,
                format!("Unknown host — fingerprint: {}", fingerprint)
            );
            app.emit(
                "known_hosts_warning",
                serde_json::json!({
                    "tab_id": tab_id,
                    "fingerprint": fingerprint,
                    "host": host_address,
                    "is_mismatch": false
                }),
            )
            .map_err(|e| e.to_string())?;

            if !wait_for_trust(&tab_id, &trust_state)? {
                return Err("User rejected host".to_string());
            }

            // Write the host key to known_hosts so future connections match.
            if let Some(ref path) = known_hosts_path {
                let mut kh = session.known_hosts().map_err(|e| e.to_string())?;
                if path.exists() {
                    let _ = kh.read_file(path, ssh2::KnownHostFileKind::OpenSSH);
                }
                let _ = kh.add(&known_host_check_name, host_key, "", ssh2::KnownHostKeyFormat::from(key_type));
                let _ = kh.write_file(path, ssh2::KnownHostFileKind::OpenSSH);
            }
            log_step!(app, tab_id, "Host trusted and added to known_hosts ✓");
        }
    }

    // Step 6: Authentication
    log_step!(app, tab_id, "Authenticating…");

    let authenticated = if auth_method == "key" {
        let key_path = private_key_path
            .as_deref()
            .map(std::path::Path::new)
            .ok_or("private_key_path not set for key auth")?;

        // 6a. Try ssh-agent first (works for keys loaded via `ssh-add`).
        let agent_ok = try_agent_auth(&session, &username, &tab_id, &app);
        if agent_ok {
            true
        } else {
            // 6b. Direct key file auth — use provided passphrase if any.
            log_step!(app, tab_id, "Authenticating with public key file…");
            match session.userauth_pubkey_file(
                &username,
                None,
                key_path,
                passphrase.as_deref(),
            ) {
                Ok(_) => true,
                Err(e) => {
                    let msg = e.to_string();
                    if passphrase.is_none() && is_passphrase_error(&msg) {
                        // Key is encrypted — ask frontend for passphrase.
                        log_step!(app, tab_id, "Key is passphrase-protected, prompting…");
                        app.emit(
                            "passphrase_required",
                            serde_json::json!({ "tab_id": tab_id }),
                        )
                        .map_err(|e| e.to_string())?;
                        return Err("passphrase_required".to_string());
                    }
                    log_step!(app, tab_id, format!("Key auth failed: {}", msg));
                    app.emit(
                        "auth_required",
                        serde_json::json!({
                            "tab_id": tab_id,
                            "prompt_message": msg,
                            "is_2fa": false
                        }),
                    )
                    .map_err(|e| e.to_string())?;
                    return Err(format!("authentication failed: {}", msg));
                }
            }
        }
    } else {
        let pw = password.as_deref().unwrap_or("");
        match session.userauth_password(&username, pw) {
            Ok(_) => true,
            Err(e) => {
                let msg = e.to_string();
                log_step!(app, tab_id, format!("Password auth failed: {}", msg));
                app.emit(
                    "auth_required",
                    serde_json::json!({
                        "tab_id": tab_id,
                        "prompt_message": msg,
                        "is_2fa": false
                    }),
                )
                .map_err(|e| e.to_string())?;
                return Err(format!("authentication failed: {}", msg));
            }
        }
    };

    if !authenticated || !session.authenticated() {
        log_step!(app, tab_id, "Authentication failed.");
        app.emit(
            "auth_required",
            serde_json::json!({
                "tab_id": tab_id,
                "prompt_message": "Authentication failed",
                "is_2fa": false
            }),
        )
        .map_err(|e| e.to_string())?;
        return Err("not authenticated".to_string());
    }

    log_step!(app, tab_id, "Authenticated ✓");

    // Step 7 (SFTP only): Open SFTP subsystem while still in blocking mode.
    // Must happen BEFORE open_shell_channel, which switches to non-blocking.
    // Skipped for SSH terminal connections — they never need the SFTP handle.
    let sftp = if init_sftp {
        log_step!(app, tab_id, "Initialising SFTP subsystem…");
        // The 15s handshake timeout is too short for SFTP subsystem negotiation
        // on slower hosts (RPi, etc.). Use a 60s timeout for this phase only.
        session.set_timeout(60_000);
        log::debug!("[SFTP-CONNECT] calling session.sftp() in blocking mode…");
        match session.sftp() {
            Ok(s) => {
                log::debug!("[SFTP-CONNECT] SFTP subsystem open ✓");
                log_step!(app, tab_id, "SFTP ready ✓");
                Some(s)
            }
            Err(e) => {
                log::warn!("[SFTP-CONNECT] SFTP subsystem failed: {}", e);
                return Err(format!("SFTP subsystem unavailable: {}", e));
            }
        }
    } else {
        None
    };

    // Step 8 (SSH terminal only): Open PTY shell channel.
    // Switches session to non-blocking mode for the output reader thread.
    // Skipped for SFTP connections — SFTP operations require blocking mode.
    // Wrap the session now so open_shell_channel can receive it via Arc.
    let session_for_pty = std::sync::Arc::new(std::sync::Mutex::new(super::SessionHandle(session)));

    let (channel, ready_tx, shutdown) = if !init_sftp {
        log_step!(app, tab_id, "Opening PTY shell channel…");
        let (ready_tx, ready_rx) = std::sync::mpsc::channel::<()>();
        let (ch, shutdown) = super::pty::open_shell_channel(
            session_for_pty.clone(),
            &tab_id,
            &app,
            state.clone(),
            ready_rx,
            initial_cols,
            initial_rows,
        )?;
        log_step!(app, tab_id, "Shell channel open ✓");
        (Some(ch), Some(ready_tx), shutdown)
    } else {
        (None, None, std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false)))
    };

    // Wrap the SFTP handle in its own lock so SFTP commands can release the
    // outer SshState mutex before performing blocking network I/O.
    let sftp_wrapped = sftp.map(|s| {
        std::sync::Arc::new(std::sync::Mutex::new(super::SftpHandle(s)))
    });

    // For SFTP-only connections (init_sftp=true), session_for_pty was never
    // used by open_shell_channel, so re-use it as the stored session_arc.
    // For PTY connections it was already cloned into open_shell_channel.
    let session_arc = session_for_pty;

    // Step 9: Store session and emit session_established.
    {
        let mut map = state.0.lock().map_err(|e| e.to_string())?;
        map.insert(
            tab_id.clone(),
            super::SshSession {
                session: session_arc,
                channel,
                sftp: sftp_wrapped,
                shutdown,
            },
        );
    }

    // Unblock the reader thread now that the session is in the map.
    if let Some(tx) = ready_tx {
        let _ = tx.send(());
    }

    log_step!(app, tab_id, "Session established ✓");
    app.emit(
        "session_established",
        serde_json::json!({ "tab_id": tab_id, "default_path_ssh": default_path_ssh }),
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

/// Opens a TCP connection to host:port with a 10-second timeout.
/// Uses socket2 for explicit OS-level socket control and IPv4-only filtering.
/// This fixes "No route to host" errors on macOS with local network addresses.
fn tcp_connect(host: &str, port: i64) -> Result<std::net::TcpStream, String> {
    use socket2::{Domain, Socket, Type};
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
    tab_id: &str,
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
            log_step!(app, tab_id, "Authenticated via ssh-agent ✓");
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
    tab_id: String,
    state: tauri::State<'_, super::SshState>,
) -> Result<(), String> {
    let mut map = state.0.lock().map_err(|e| e.to_string())?;
    if let Some(mut sess) = map.remove(&tab_id) {
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
