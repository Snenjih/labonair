use tauri::Emitter;

#[tauri::command]
pub fn ssh_connect(
    tab_id: String,
    host_id: String,
    state: tauri::State<'_, super::SshState>,
    hosts_db: tauri::State<'_, crate::modules::hosts::HostsDb>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    // Step 1: Fetch host from SQLite
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
        keyring::Entry::new("nexum-app", &host_id)
            .ok()
            .and_then(|e| e.get_password().ok())
    } else {
        None
    };

    // Step 3: TCP connect
    let tcp = {
        let addr = format!("{}:{}", host_address, port);
        std::net::TcpStream::connect(&addr).map_err(|e| e.to_string())?
    };

    // Step 4: SSH handshake
    let mut session = ssh2::Session::new().map_err(|e| e.to_string())?;
    session.set_tcp_stream(tcp);
    session.handshake().map_err(|e| e.to_string())?;

    // Configure keepalive if set
    if let Some(interval) = keep_alive_interval {
        let tries = keep_alive_tries.unwrap_or(3) as u32;
        session.set_keepalive(true, interval as u32);
        let _ = tries; // tries not directly settable via ssh2 API — used in monitoring
    }

    // Step 5: known_hosts check
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
        ssh2::CheckResult::Match => {}
        ssh2::CheckResult::Mismatch => {
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
            // MVP: proceed without user confirmation for unknown hosts
        }
    }

    // Step 6: Authentication
    let auth_result = if auth_method == "key" {
        let key_path = private_key_path
            .as_deref()
            .map(std::path::Path::new)
            .ok_or("private_key_path not set for key auth")?;
        session
            .userauth_pubkey_file(&username, None, key_path, None)
            .map_err(|e| e.to_string())
    } else {
        let pw = password.as_deref().unwrap_or("");
        session
            .userauth_password(&username, pw)
            .map_err(|e| e.to_string())
    };

    if let Err(err) = auth_result {
        app.emit(
            "auth_required",
            serde_json::json!({
                "tab_id": tab_id,
                "prompt_message": err,
                "is_2fa": false
            }),
        )
        .map_err(|e| e.to_string())?;
        return Err(format!("authentication failed: {}", err));
    }

    if !session.authenticated() {
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

    // Step 7: Open PTY shell channel
    let channel = super::pty::open_shell_channel(
        &mut session,
        &tab_id,
        &app,
        state.inner().clone(),
    )?;

    // Step 8: Store session (with channel) and emit session_established
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

    app.emit("session_established", serde_json::json!({ "tab_id": tab_id, "default_path_ssh": default_path_ssh }))
        .map_err(|e| e.to_string())?;

    Ok(())
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
