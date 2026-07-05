use std::io::Read;
use std::time::{Duration, Instant};
use serde::Serialize;

#[derive(Serialize)]
pub struct ExecResult {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: i32,
}

const EXEC_TIMEOUT: Duration = Duration::from_secs(15);
const RETRY_SLEEP: Duration = Duration::from_millis(5);

/// The session backing the interactive PTY is deliberately non-blocking
/// (see pty.rs's `sess.0.set_blocking(false)`, needed so the reader thread
/// can poll without hanging) — `ssh_exec_command` shares that same session
/// Arc, so every libssh2 call here can spuriously return
/// LIBSSH2_ERROR_EAGAIN ("would block") even though the operation is
/// perfectly valid, it just isn't ready yet. Same retry idea already used
/// for keepalive_send in pty.rs's reader loop, just spun into a tight loop
/// here since this is a one-shot blocking command rather than an idle poll.
fn retry_ssh2<T>(mut f: impl FnMut() -> Result<T, ssh2::Error>) -> Result<T, ssh2::Error> {
    let start = Instant::now();
    loop {
        match f() {
            Ok(v) => return Ok(v),
            Err(e) if matches!(e.code(), ssh2::ErrorCode::Session(-37)) => {
                if start.elapsed() > EXEC_TIMEOUT {
                    return Err(e);
                }
                std::thread::sleep(RETRY_SLEEP);
            }
            Err(e) => return Err(e),
        }
    }
}

/// Same idea as `retry_ssh2` but for `Read` calls (`channel.read_to_end`),
/// which surface the same underlying non-blocking condition as
/// `io::ErrorKind::WouldBlock` instead of a raw `ssh2::Error` — matches the
/// convention already used for channel reads in tunnels.rs. Safe to retry
/// in place: `read_to_end` appends to the existing buffer rather than
/// truncating it, so a retry after a partial read resumes correctly.
fn retry_io<T>(mut f: impl FnMut() -> std::io::Result<T>) -> std::io::Result<T> {
    let start = Instant::now();
    loop {
        match f() {
            Ok(v) => return Ok(v),
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                if start.elapsed() > EXEC_TIMEOUT {
                    return Err(e);
                }
                std::thread::sleep(RETRY_SLEEP);
            }
            Err(e) => return Err(e),
        }
    }
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

    let mut channel = retry_ssh2(|| sess.0.channel_session()).map_err(|e| e.to_string())?;
    retry_ssh2(|| channel.exec(&command)).map_err(|e| e.to_string())?;

    // read_to_end + lossy UTF-8 rather than read_to_string (which requires
    // strictly valid UTF-8 and errors out the whole call otherwise) — remote
    // command output can legitimately contain non-UTF8 bytes (e.g. `cat`ing
    // a shell history file with meta-quoted special characters), and failing
    // the entire exec over a few bad bytes in otherwise-useful output is
    // worse than showing it with U+FFFD replacements.
    let mut stdout_bytes = Vec::new();
    retry_io(|| channel.read_to_end(&mut stdout_bytes)).map_err(|e| e.to_string())?;
    let stdout = String::from_utf8_lossy(&stdout_bytes).into_owned();

    let mut stderr_bytes = Vec::new();
    retry_io(|| channel.stderr().read_to_end(&mut stderr_bytes)).map_err(|e| e.to_string())?;
    let stderr_buf = String::from_utf8_lossy(&stderr_bytes).into_owned();

    retry_ssh2(|| channel.wait_close()).map_err(|e| e.to_string())?;
    let exit_code = channel.exit_status().unwrap_or(-1);

    Ok(ExecResult {
        stdout,
        stderr: stderr_buf,
        exit_code,
    })
}
