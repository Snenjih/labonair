mod session;
pub(crate) mod shell_init;

use std::collections::HashMap;
use std::io::Write;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, RwLock};

use portable_pty::PtySize;
use tauri::ipc::Channel;

pub use session::PtyEvent;
use session::Session;

pub struct PtyState {
    sessions: RwLock<HashMap<u32, Arc<Session>>>,
    // Starts at 1 so freshly-handed-out ids are never 0, which the frontend
    // sometimes treats as "unset". Increments monotonically; never reused.
    next_id: AtomicU32,
}

impl Default for PtyState {
    fn default() -> Self {
        Self {
            sessions: RwLock::new(HashMap::new()),
            next_id: AtomicU32::new(1),
        }
    }
}

#[tauri::command]
pub fn pty_open(
    state: tauri::State<PtyState>,
    cols: u16,
    rows: u16,
    cwd: Option<String>,
    shell: Option<String>,
    blocks: bool,
    on_event: Channel<PtyEvent>,
) -> Result<u32, String> {
    let (session, _) = session::spawn(cols, rows, cwd, shell, blocks, on_event).map_err(|e| {
        log::error!("pty_open failed: {e}");
        e
    })?;
    let id = state.next_id.fetch_add(1, Ordering::Relaxed);
    state.sessions.write().unwrap().insert(id, session);
    log::info!("pty opened id={id} cols={cols} rows={rows}");
    Ok(id)
}

#[tauri::command]
pub fn pty_write(state: tauri::State<PtyState>, id: u32, data: String) -> Result<(), String> {
    let session = state
        .sessions
        .read()
        .unwrap()
        .get(&id)
        .cloned()
        .ok_or_else(|| {
            log::warn!("pty_write: unknown id={id}");
            "no session".to_string()
        })?;
    // Bind to a local so the MutexGuard temporary drops before `session` —
    // see rustc note on tail-expression temporary drop order.
    let result = session
        .writer
        .lock()
        .unwrap()
        .write_all(data.as_bytes())
        .map_err(|e| {
            // EPIPE is expected if the child already exited.
            log::debug!("pty_write id={id} failed: {e}");
            e.to_string()
        });
    result
}

#[tauri::command]
pub fn pty_resize(
    state: tauri::State<PtyState>,
    id: u32,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let session = state
        .sessions
        .read()
        .unwrap()
        .get(&id)
        .cloned()
        .ok_or_else(|| {
            log::warn!("pty_resize: unknown id={id}");
            "no session".to_string()
        })?;
    let result = session
        .master
        .lock()
        .unwrap()
        .resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| {
            log::warn!("pty_resize id={id} failed: {e}");
            e.to_string()
        });
    result
}

/// Renderer-pool hidden-release gate: true while a foreground job (not the
/// shell itself) owns the tty, i.e. the shell handed off its process group
/// to a running command. Stricter/cheaper than counting all children (which
/// would also count background jobs) — compares the tty's foreground process
/// group leader to the shell's own pid.
///
/// Unix-only (`#[cfg(unix)]`): Labonair's release CI only builds macOS and
/// Linux (no Windows target) — a Windows port would need the ConPTY/
/// Toolhelp32-snapshot approach instead of `tcgetpgrp`.
#[cfg(unix)]
#[tauri::command]
pub fn pty_has_foreground_job(state: tauri::State<PtyState>, id: u32) -> Result<bool, String> {
    let sessions = state.sessions.read().unwrap();
    let session = sessions.get(&id).ok_or_else(|| {
        log::warn!("pty_has_foreground_job: unknown session id={id}");
        "no session".to_string()
    })?;
    if session.shell_pid == 0 {
        return Ok(false);
    }
    let leader = session.master.lock().unwrap().process_group_leader();
    Ok(matches!(leader, Some(pid) if pid > 0 && pid as u32 != session.shell_pid))
}

/// Writes raw bytes into a local PTY by numeric id, byte-for-byte the same
/// code path `pty_write` uses — called by the MCP bridge (`modules::mcp`),
/// which only ever sees `PtyState` through `tauri::AppHandle::state()`, never
/// as a Tauri-command invocation, so this can't just reuse `pty_write`
/// directly (that's a `#[tauri::command]`, not a plain callable fn taking a
/// bare `&PtyState`). `Session`'s fields stay private to this module either
/// way — this and `subscribe_agent_tap` are the only two seams exposed.
pub(crate) fn write_raw(state: &PtyState, id: u32, data: &str) -> Result<(), String> {
    let session = state.sessions.read().unwrap().get(&id).cloned().ok_or_else(|| "no session".to_string())?;
    // Bind to a local so the MutexGuard temporary drops before `session` —
    // see rustc note on tail-expression temporary drop order (same fix as
    // `pty_write` above).
    let result = session.writer.lock().unwrap().write_all(data.as_bytes()).map_err(|e| e.to_string());
    result
}

/// Subscribes to a local PTY session's raw-output tap (see
/// `Session::agent_tap`) — used by the MCP bridge's `run_command`/
/// `read_output` to capture a local terminal's output without touching the
/// visible pane's own `Channel<PtyEvent>`.
pub(crate) fn subscribe_agent_tap(
    state: &PtyState,
    id: u32,
) -> Result<tokio::sync::broadcast::Receiver<Vec<u8>>, String> {
    let session = state.sessions.read().unwrap().get(&id).cloned().ok_or_else(|| "no session".to_string())?;
    Ok(session.agent_tap.subscribe())
}

#[tauri::command]
pub fn pty_close(state: tauri::State<PtyState>, id: u32) -> Result<(), String> {
    let session = state.sessions.write().unwrap().remove(&id);
    if let Some(s) = session {
        if let Err(e) = s.killer.lock().unwrap().kill() {
            // Non-fatal: the child may already have exited on its own (e.g. the
            // user ran `exit`). Log so this isn't invisible during debugging.
            log::debug!("pty_close: kill id={id} returned {e}");
        }
        log::info!("pty closed id={id}");
    } else {
        log::debug!("pty_close: unknown id={id}");
    }
    Ok(())
}
