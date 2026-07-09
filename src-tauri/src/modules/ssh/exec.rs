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
/// (see pty.rs's `guard.session.set_blocking(false)`, needed so the reader
/// thread can poll without hanging) — `ssh_exec_command` shares that same
/// `Arc<Mutex<SshSessionInner>>`, so every libssh2 call here can spuriously
/// return LIBSSH2_ERROR_EAGAIN ("would block") even though the operation is
/// perfectly valid, it just isn't ready yet.
///
/// Holds `session_arc` for the entire retry loop, including the sleep
/// between attempts. libssh2 forbids touching a session (or any of its
/// channels/subsystems) with a different call between an EAGAIN and its
/// retry — releasing the lock mid-retry would let the PTY reader thread
/// (pty.rs) interleave a channel read or keepalive_send() on the same
/// session before this call's retry completes, which is the same class of
/// transport-desync bug the unified `SshSessionInner` lock exists to
/// eliminate. In practice EAGAIN clears within microseconds (kernel socket
/// buffer backpressure), so this only pauses the reader thread in the rare
/// case where the exec call is genuinely stalled — bounded by `EXEC_TIMEOUT`.
fn retry_ssh2<T>(
    session_arc: &std::sync::Mutex<super::SshSessionInner>,
    mut f: impl FnMut(&super::SshSessionInner) -> Result<T, ssh2::Error>,
) -> Result<T, String> {
    let start = Instant::now();
    let sess = session_arc.lock().map_err(|e| e.to_string())?;
    loop {
        match f(&sess) {
            Ok(v) => return Ok(v),
            Err(e) if matches!(e.code(), ssh2::ErrorCode::Session(-37)) => {
                if start.elapsed() > EXEC_TIMEOUT {
                    return Err(e.to_string());
                }
                std::thread::sleep(RETRY_SLEEP);
            }
            Err(e) => return Err(e.to_string()),
        }
    }
}

/// Same idea as `retry_ssh2` but for `Read` calls (`channel.read_to_end`),
/// which surface the same underlying non-blocking condition as
/// `io::ErrorKind::WouldBlock` instead of a raw `ssh2::Error` — matches the
/// convention already used for channel reads in tunnels.rs. Safe to retry
/// in place: `read_to_end` appends to the existing buffer rather than
/// truncating it, so a retry after a partial read resumes correctly.
///
/// Also re-locks per attempt, for the same reason as `retry_ssh2`.
fn retry_io<T>(
    session_arc: &std::sync::Mutex<super::SshSessionInner>,
    mut f: impl FnMut() -> std::io::Result<T>,
) -> Result<T, String> {
    let start = Instant::now();
    loop {
        let attempt = {
            let _sess = session_arc.lock().map_err(|e| e.to_string())?;
            f()
        };
        match attempt {
            Ok(v) => return Ok(v),
            Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                if start.elapsed() > EXEC_TIMEOUT {
                    return Err(e.to_string());
                }
                std::thread::sleep(RETRY_SLEEP);
            }
            Err(e) => return Err(e.to_string()),
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
    let session_arc = crate::get_session_arc!(state, &session_id);

    let mut channel = retry_ssh2(&session_arc, |sess| sess.session.channel_session())?;
    retry_ssh2(&session_arc, |_sess| channel.exec(&command))?;

    // read_to_end + lossy UTF-8 rather than read_to_string (which requires
    // strictly valid UTF-8 and errors out the whole call otherwise) — remote
    // command output can legitimately contain non-UTF8 bytes (e.g. `cat`ing
    // a shell history file with meta-quoted special characters), and failing
    // the entire exec over a few bad bytes in otherwise-useful output is
    // worse than showing it with U+FFFD replacements.
    let mut stdout_bytes = Vec::new();
    retry_io(&session_arc, || channel.read_to_end(&mut stdout_bytes))?;
    let stdout = String::from_utf8_lossy(&stdout_bytes).into_owned();

    let mut stderr_bytes = Vec::new();
    retry_io(&session_arc, || channel.stderr().read_to_end(&mut stderr_bytes))?;
    let stderr_buf = String::from_utf8_lossy(&stderr_bytes).into_owned();

    retry_ssh2(&session_arc, |_sess| channel.wait_close())?;
    let exit_code = channel.exit_status().unwrap_or(-1);

    Ok(ExecResult {
        stdout,
        stderr: stderr_buf,
        exit_code,
    })
}
