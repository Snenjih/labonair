use std::io::Read;
use serde::Serialize;

#[derive(Serialize)]
pub struct ExecResult {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: i32,
}

/// Runs a one-shot command on an existing SSH session and returns its output.
/// Opens a fresh exec channel each time — does not affect the interactive PTY.
#[tauri::command]
pub fn ssh_exec_command(
    session_id: String,
    command: String,
    state: tauri::State<'_, super::SshState>,
) -> Result<ExecResult, String> {
    // Clone the session Arc and release the outer lock before blocking I/O.
    let session_arc = crate::get_session_arc!(state, &session_id);
    let sess = session_arc.lock().map_err(|e| e.to_string())?;

    let mut channel = sess.0.channel_session().map_err(|e| e.to_string())?;
    channel.exec(&command).map_err(|e| e.to_string())?;

    // read_to_end + lossy UTF-8 rather than read_to_string (which requires
    // strictly valid UTF-8 and errors out the whole call otherwise) — remote
    // command output can legitimately contain non-UTF8 bytes (e.g. `cat`ing
    // a shell history file with meta-quoted special characters), and failing
    // the entire exec over a few bad bytes in otherwise-useful output is
    // worse than showing it with U+FFFD replacements.
    let mut stdout_bytes = Vec::new();
    channel
        .read_to_end(&mut stdout_bytes)
        .map_err(|e| e.to_string())?;
    let stdout = String::from_utf8_lossy(&stdout_bytes).into_owned();

    let mut stderr_bytes = Vec::new();
    channel
        .stderr()
        .read_to_end(&mut stderr_bytes)
        .map_err(|e| e.to_string())?;
    let stderr_buf = String::from_utf8_lossy(&stderr_bytes).into_owned();

    channel.wait_close().map_err(|e| e.to_string())?;
    let exit_code = channel.exit_status().unwrap_or(-1);

    Ok(ExecResult {
        stdout,
        stderr: stderr_buf,
        exit_code,
    })
}
