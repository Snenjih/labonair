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
    tab_id: String,
    command: String,
    state: tauri::State<'_, super::SshState>,
) -> Result<ExecResult, String> {
    // Clone the session Arc and release the outer lock before blocking I/O.
    let session_arc = crate::get_session_arc!(state, &tab_id);
    let sess = session_arc.lock().map_err(|e| e.to_string())?;

    let mut channel = sess.0.channel_session().map_err(|e| e.to_string())?;
    channel.exec(&command).map_err(|e| e.to_string())?;

    let mut stdout = String::new();
    channel
        .read_to_string(&mut stdout)
        .map_err(|e| e.to_string())?;

    let mut stderr_buf = String::new();
    channel
        .stderr()
        .read_to_string(&mut stderr_buf)
        .map_err(|e| e.to_string())?;

    channel.wait_close().map_err(|e| e.to_string())?;
    let exit_code = channel.exit_status().unwrap_or(-1);

    Ok(ExecResult {
        stdout,
        stderr: stderr_buf,
        exit_code,
    })
}
