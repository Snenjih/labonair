use std::io::{Read, Write};
use tauri::Emitter;

#[tauri::command]
pub fn ssh_pty_write(
    tab_id: String,
    data: String,
    state: tauri::State<'_, super::SshState>,
) -> Result<(), String> {
    let mut map = state.0.lock().map_err(|e| e.to_string())?;
    let session = map.get_mut(&tab_id).ok_or("no session for tab")?;
    let channel = session.channel.as_mut().ok_or("no channel open")?;
    channel.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
    channel.flush().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn ssh_pty_resize(
    tab_id: String,
    cols: u32,
    rows: u32,
    state: tauri::State<'_, super::SshState>,
) -> Result<(), String> {
    let mut map = state.0.lock().map_err(|e| e.to_string())?;
    let session = map.get_mut(&tab_id).ok_or("no session for tab")?;
    let channel = session.channel.as_mut().ok_or("no channel open")?;
    channel
        .request_pty_size(cols, rows, None, None)
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Opens a PTY shell channel on an authenticated session and spawns a
/// background reader thread that streams output via the `ssh_pty_output` event.
/// Must be called before inserting the session into SshState.
pub fn open_shell_channel(
    session: &mut ssh2::Session,
    tab_id: &str,
    app: &tauri::AppHandle,
    state: super::SshState,
) -> Result<ssh2::Channel, String> {
    let mut channel = session.channel_session().map_err(|e| e.to_string())?;
    channel
        .request_pty("xterm-256color", None, Some((80, 24, 0, 0)))
        .map_err(|e| e.to_string())?;
    channel.shell().map_err(|e| e.to_string())?;

    // Non-blocking so the reader never holds the mutex indefinitely.
    session.set_blocking(false);

    let app_clone = app.clone();
    let tab_id_clone = tab_id.to_string();

    std::thread::spawn(move || loop {
        let data = {
            let mut map = match state.0.lock() {
                Ok(m) => m,
                Err(_) => break,
            };
            let Some(sess) = map.get_mut(&tab_id_clone) else {
                break;
            };
            let Some(ch) = sess.channel.as_mut() else { break };

            if ch.eof() {
                break;
            }

            let mut buf = [0u8; 4096];
            match ch.read(&mut buf) {
                Ok(0) => None,
                Ok(n) => Some(String::from_utf8_lossy(&buf[..n]).to_string()),
                Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => None,
                Err(_) => break,
            }
        };

        if let Some(output) = data {
            let _ = app_clone.emit(
                "ssh_pty_output",
                serde_json::json!({
                    "tab_id": tab_id_clone,
                    "data": output
                }),
            );
        } else {
            std::thread::sleep(std::time::Duration::from_millis(5));
        }
    });

    Ok(channel)
}
