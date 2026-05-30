use std::io::{Read, Write};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};
use tauri::Emitter;

#[tauri::command]
pub fn ssh_pty_write(
    session_id: String,
    data: String,
    state: tauri::State<'_, super::SshState>,
) -> Result<(), String> {
    let mut map = state.0.lock().map_err(|e| e.to_string())?;
    let session = map.get_mut(&session_id).ok_or("no session for tab")?;
    let channel = session.channel.as_mut().ok_or("no channel open")?;
    channel.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
    channel.flush().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn ssh_pty_resize(
    session_id: String,
    cols: u32,
    rows: u32,
    state: tauri::State<'_, super::SshState>,
) -> Result<(), String> {
    let mut map = state.0.lock().map_err(|e| e.to_string())?;
    let session = map.get_mut(&session_id).ok_or("no session for tab")?;
    let channel = session.channel.as_mut().ok_or("no channel open")?;
    channel
        .request_pty_size(cols, rows, None, None)
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Opens a PTY shell channel on an authenticated session and spawns a
/// background reader thread that streams output via the `ssh_pty_output` event.
///
/// Returns `(channel, shutdown_flag)`. The caller must:
/// 1. Store both in `SshSession` and insert it into `SshState`.
/// 2. Send `()` on `ready_tx` to unblock the reader thread.
///
/// `cols`/`rows` set the initial terminal size to avoid a jarring resize on connect.
#[allow(clippy::too_many_arguments)]
pub fn open_shell_channel(
    session_arc: std::sync::Arc<std::sync::Mutex<super::SessionHandle>>,
    session_id: &str,
    app: &tauri::AppHandle,
    state: super::SshState,
    ready_rx: std::sync::mpsc::Receiver<()>,
    cols: u32,
    rows: u32,
    keep_alive_interval: Option<u32>,
    keep_alive_tries: Option<u32>,
) -> Result<(ssh2::Channel, Arc<AtomicBool>), String> {
    let sess = session_arc.lock().map_err(|e| e.to_string())?;
    let mut channel = sess.0.channel_session().map_err(|e| e.to_string())?;
    channel
        .request_pty("xterm-256color", None, Some((cols, rows, 0, 0)))
        .map_err(|e| e.to_string())?;
    channel.shell().map_err(|e| e.to_string())?;

    // Non-blocking so the reader never holds the session lock indefinitely.
    sess.0.set_blocking(false);
    drop(sess);

    let app_clone = app.clone();
    let session_id_clone = session_id.to_string();
    let shutdown = Arc::new(AtomicBool::new(false));
    let shutdown_clone = shutdown.clone();

    std::thread::spawn(move || {
        // Block until the session has been inserted into SshState so we never
        // miss a single byte of output (replaces the old 200×10ms retry loop).
        let _ = ready_rx.recv();

        let ka_interval = Duration::from_secs(keep_alive_interval.unwrap_or(25) as u64);
        let ka_max_fails = keep_alive_tries.unwrap_or(3);
        let mut last_keepalive = Instant::now();
        let mut ka_consecutive_fails: u32 = 0;

        // Tracks the reason for an unexpected exit so we can notify the frontend.
        // None means the loop ended normally (ssh_disconnect set the shutdown flag).
        let mut disconnect_reason: Option<String> = None;

        // Carry buffer for incomplete multi-byte UTF-8 sequences. When a read ends
        // in the middle of a multi-byte character (e.g. a 3-byte box-drawing glyph
        // split across a 4096-byte boundary), we keep the trailing bytes here and
        // prepend them to the next read so the full character is emitted intact
        // rather than replaced with U+FFFD by from_utf8_lossy.
        let mut carry: Vec<u8> = Vec::new();

        loop {
            if shutdown_clone.load(Ordering::Relaxed) {
                break; // clean shutdown via ssh_disconnect
            }

            let data = {
                let mut map = match state.0.lock() {
                    Ok(m) => m,
                    Err(_) => {
                        disconnect_reason = Some("Internal lock error".to_string());
                        break;
                    }
                };
                let Some(sess) = map.get_mut(&session_id_clone) else {
                    // Session was removed by ssh_disconnect — normal exit, no event.
                    break;
                };
                let Some(ch) = sess.channel.as_mut() else { break };

                if ch.eof() {
                    disconnect_reason = Some("Connection closed by remote host".to_string());
                    break;
                }

                let mut buf = [0u8; 4096];
                match ch.read(&mut buf) {
                    Ok(0) => None,
                    Ok(n) => {
                        ka_consecutive_fails = 0; // live data proves connection is alive
                        carry.extend_from_slice(&buf[..n]);
                        // Find the longest valid UTF-8 prefix. Utf8Error::valid_up_to()
                        // points to the byte just past the last complete character.
                        let valid_end = match std::str::from_utf8(&carry) {
                            Ok(_) => carry.len(),
                            Err(e) => e.valid_up_to(),
                        };
                        if valid_end == 0 {
                            // All accumulated bytes are the start of an incomplete
                            // sequence — wait for the next read chunk.
                            None
                        } else {
                            // SAFETY: verified as valid UTF-8 above.
                            let s = unsafe {
                                String::from_utf8_unchecked(carry[..valid_end].to_vec())
                            };
                            carry.drain(..valid_end);
                            Some(s)
                        }
                    }
                    Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => None,
                    Err(e) => {
                        disconnect_reason = Some(humanize_disconnect_reason(&e.to_string()));
                        break;
                    }
                }
            };

            if let Some(output) = data {
                let _ = app_clone.emit(
                    "ssh_pty_output",
                    serde_json::json!({
                        "session_id": session_id_clone,
                        "data": output
                    }),
                );
            } else {
                if last_keepalive.elapsed() >= ka_interval {
                    let session_arc_opt = {
                        match state.0.lock() {
                            Ok(map) => map.get(&session_id_clone).map(|s| s.session.clone()),
                            Err(_) => None,
                        }
                    };
                    if let Some(arc) = session_arc_opt {
                        if let Ok(sess) = arc.lock() {
                            match sess.0.keepalive_send() {
                                Ok(_) => {
                                    last_keepalive = Instant::now();
                                    ka_consecutive_fails = 0;
                                }
                                Err(ref e) if matches!(e.code(), ssh2::ErrorCode::Session(-37)) => {
                                    // LIBSSH2_ERROR_EAGAIN: non-blocking would block.
                                    // Don't reset last_keepalive — retry next idle iteration.
                                }
                                Err(e) => {
                                    ka_consecutive_fails += 1;
                                    if ka_consecutive_fails >= ka_max_fails {
                                        disconnect_reason =
                                            Some(humanize_disconnect_reason(&e.to_string()));
                                        break;
                                    }
                                    last_keepalive = Instant::now();
                                }
                            }
                        }
                    }
                }
                std::thread::sleep(Duration::from_millis(5));
            }
        }

        // Emit disconnect event only for unexpected exits.
        if let Some(reason) = disconnect_reason {
            // Clean up the dead session so reconnect can create a fresh one.
            if let Ok(mut map) = state.0.lock() {
                map.remove(&session_id_clone);
            }
            let _ = app_clone.emit(
                "ssh_connection_lost",
                serde_json::json!({
                    "session_id": session_id_clone,
                    "reason": reason
                }),
            );
        }
    });

    Ok((channel, shutdown))
}

fn humanize_disconnect_reason(raw: &str) -> String {
    let lower = raw.to_lowercase();
    if lower.contains("transport read") || lower.contains("transport write") {
        format!("Network transport failure — the connection was dropped by the server or network [{raw}]")
    } else if lower.contains("connection reset") {
        "Connection reset by the server".to_string()
    } else if lower.contains("broken pipe") {
        "Connection interrupted — the pipe to the server was broken".to_string()
    } else if lower.contains("timed out") {
        "Connection timed out".to_string()
    } else if lower.contains("network is unreachable") || lower.contains("no route to host") {
        "Network unreachable — no route to host".to_string()
    } else if lower.contains("connection refused") {
        "Connection refused by the server".to_string()
    } else if lower.contains("eof") || lower.contains("end of file") {
        "Connection closed by the remote host (EOF)".to_string()
    } else {
        // Capitalize and keep original for unknown errors
        let mut chars = raw.chars();
        match chars.next() {
            None => String::new(),
            Some(c) => c.to_uppercase().to_string() + chars.as_str(),
        }
    }
}
