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
pub async fn ssh_exec_command(
    session_id: String,
    command: String,
    state: tauri::State<'_, super::SshState>,
) -> Result<ExecResult, String> {
    let session = crate::get_session_arc!(state, &session_id);

    let mut channel = session
        .handle
        .channel_open_session()
        .await
        .map_err(|e| e.to_string())?;
    channel.exec(true, command).await.map_err(|e| e.to_string())?;

    let mut stdout_bytes: Vec<u8> = Vec::new();
    let mut stderr_bytes: Vec<u8> = Vec::new();
    let mut exit_code: i32 = -1;

    // One loop interleaves stdout/stderr as they arrive off the same message
    // stream, rather than fully draining stdout before even starting to read
    // stderr — the old sequential `read_to_end(stdout)` then
    // `stderr().read_to_end()` pattern risked stalling if the remote process
    // filled its stderr flow-control window while stdout was still draining.
    while let Some(msg) = channel.wait().await {
        match msg {
            russh::ChannelMsg::Data { data } => stdout_bytes.extend_from_slice(&data),
            russh::ChannelMsg::ExtendedData { data, ext: 1 } => stderr_bytes.extend_from_slice(&data),
            russh::ChannelMsg::ExtendedData { .. } => {}
            russh::ChannelMsg::ExitStatus { exit_status } => exit_code = exit_status as i32,
            russh::ChannelMsg::Eof | russh::ChannelMsg::Close => break,
            _ => {}
        }
    }

    // Lossy UTF-8 decoding rather than strict `String::from_utf8` — remote
    // command output can legitimately contain non-UTF8 bytes (e.g. `cat`ing
    // a file with binary/Latin-1 content), and failing the entire exec over
    // a few bad bytes in otherwise-useful output is worse than showing it
    // with U+FFFD replacements.
    let stdout = String::from_utf8_lossy(&stdout_bytes).into_owned();
    let stderr = String::from_utf8_lossy(&stderr_bytes).into_owned();

    Ok(ExecResult {
        stdout,
        stderr,
        exit_code,
    })
}
