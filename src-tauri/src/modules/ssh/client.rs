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

#[tauri::command]
pub fn ssh_connect(
    tab_id: String,
    host_id: String,
    passphrase: Option<String>,
    state: tauri::State<'_, super::SshState>,
    hosts_db: tauri::State<'_, crate::modules::hosts::HostsDb>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    // Step 1: Fetch host from SQLite
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

    // Step 2: Fetch password from keychain
    let password: Option<String> = if auth_method == "password" {
        log_step!(app, tab_id, "Retrieving credentials from keychain…");
        keyring::Entry::new("nexum-app", &host_id)
            .ok()
            .and_then(|e| e.get_password().ok())
    } else {
        None
    };

    // Step 3: TCP connect (DNS resolution + connect, with a 15-second total timeout)
    log_step!(
        app,
        tab_id,
        format!("TCP connecting to {}:{}…", host_address, port)
    );
    let tcp = {
        let addr = format!("{}:{}", host_address, port);
        let (tx, rx) = std::sync::mpsc::channel::<Result<std::net::TcpStream, String>>();
        std::thread::spawn(move || {
            let result = (|| {
                use std::net::ToSocketAddrs;
                let addrs: Vec<std::net::SocketAddr> = addr
                    .parse::<std::net::SocketAddr>()
                    .map(|a| vec![a])
                    .unwrap_or_else(|_| {
                        addr.to_socket_addrs()
                            .map(|it| it.collect())
                            .unwrap_or_default()
                    });
                if addrs.is_empty() {
                    return Err("could not resolve host".to_string());
                }
                // Try each resolved address (IPv4 + IPv6), return first that connects.
                let mut last_err = String::new();
                for socket_addr in &addrs {
                    match std::net::TcpStream::connect_timeout(
                        socket_addr,
                        std::time::Duration::from_secs(10),
                    ) {
                        Ok(stream) => return Ok(stream),
                        Err(e) => last_err = e.to_string(),
                    }
                }
                Err(last_err)
            })();
            let _ = tx.send(result);
        });
        rx.recv_timeout(std::time::Duration::from_secs(15))
            .map_err(|_| format!("TCP connect to {}:{} timed out after 15s", host_address, port))?
            .map_err(|e| e)?
    };
    log_step!(app, tab_id, "TCP connection established.");

    // Step 4: SSH handshake (15 s timeout covers handshake + auth)
    log_step!(app, tab_id, "Starting SSH handshake…");
    let mut session = ssh2::Session::new().map_err(|e| e.to_string())?;
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
    let (host_key, _key_type) = session.host_key().ok_or("no host key")?;
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

    let known_host_status = if let Some(ref path) = known_hosts_path {
        let mut kh = session.known_hosts().map_err(|e| e.to_string())?;
        if path.exists() {
            let _ = kh.read_file(path, ssh2::KnownHostFileKind::OpenSSH);
        }
        kh.check(&host_address, host_key)
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
            return Err("known_hosts mismatch".to_string());
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

    // Step 7: Open PTY shell channel
    log_step!(app, tab_id, "Opening PTY shell channel…");
    let channel = super::pty::open_shell_channel(
        &mut session,
        &tab_id,
        &app,
        state.inner().clone(),
    )?;
    log_step!(app, tab_id, "Shell channel open ✓");

    // Step 8: Store session and emit session_established
    {
        let mut map = state.0.lock().map_err(|e| e.to_string())?;
        map.insert(
            tab_id.clone(),
            super::SshSession {
                session,
                channel: Some(channel),
            },
        );
    }

    {
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

    log_step!(app, tab_id, "Session established ✓");
    app.emit(
        "session_established",
        serde_json::json!({ "tab_id": tab_id, "default_path_ssh": default_path_ssh }),
    )
    .map_err(|e| e.to_string())?;

    Ok(())
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

#[tauri::command]
pub fn ssh_disconnect(
    tab_id: String,
    state: tauri::State<'_, super::SshState>,
) -> Result<(), String> {
    let mut map = state.0.lock().map_err(|e| e.to_string())?;
    if let Some(mut sess) = map.remove(&tab_id) {
        if let Some(mut ch) = sess.channel.take() {
            let _ = ch.close();
        }
        let _ = sess.session.disconnect(None, "User disconnected", None);
    }
    Ok(())
}
