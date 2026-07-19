use std::collections::{HashMap, HashSet};
use std::process::Stdio;
use std::sync::{Arc, RwLock};
use tauri::Emitter;
use tokio::io::{AsyncBufReadExt, BufReader};

/// Tracks in-flight snippet runs so `snippet_run_cancel` can reach back into
/// them — local runs by PID (see the doc comment on `snippet_run_cancel` for
/// why this signals by PID rather than locking a shared `Child` handle), SSH
/// runs by the split-off write half of their exec channel (same
/// `Arc<ChannelWriteHalf<..>>`, no-lock-needed shape as `ssh::PtyChannelState`,
/// since all of its methods take `&self`). `cancelled` records which
/// `run_id`s were cancelled so the owning task can report a distinct
/// "cancelled" outcome instead of treating the resulting kill/close as a
/// plain failure — only ever inserted *after* a cancel attempt is confirmed
/// to have actually reached a still-running process/channel, so a cancel
/// racing a process's own natural exit can't mislabel a successful run.
#[derive(Default)]
pub struct SnippetRunState {
    local_pids: RwLock<HashMap<String, u32>>,
    ssh: RwLock<HashMap<String, Arc<russh::ChannelWriteHalf<russh::client::Msg>>>>,
    cancelled: RwLock<HashSet<String>>,
}

/// Cancels a running snippet started via `snippet_run_local` or
/// `snippet_run_ssh`. Kills the local child process or closes the SSH exec
/// channel, whichever is registered under `run_id`. The owning command
/// notices the resulting exit/close and emits `snippet_run_done` with
/// `cancelled: true` so the frontend can show a distinct "Cancelled" status.
///
/// The local case signals the process directly by PID rather than going
/// through `Child::kill()`/`start_kill()`, which needs `&mut Child` — and
/// `snippet_run_local`'s owning task holds `wait()` open on that same child
/// for as long as the process runs. Requiring a lock here would mean cancel
/// can't act until the process exits on its own, which is exactly what
/// cancel is trying to make happen (the identical deadlock class already
/// documented and fixed in `shell/background.rs`'s `BackgroundProc::kill`).
#[tauri::command]
pub async fn snippet_run_cancel(
    run_id: String,
    state: tauri::State<'_, SnippetRunState>,
) -> Result<(), String> {
    let local_pid = state.local_pids.read().unwrap().get(&run_id).copied();
    if let Some(pid) = local_pid {
        // SAFETY: `pid` came from `Child::id()` at spawn time; `kill(2)` with
        // a stale/reused pid is a normal, safe (if rare) race — checked via
        // the return value below rather than assumed away.
        let killed = unsafe { libc::kill(pid as libc::pid_t, libc::SIGKILL) };
        if killed == 0 {
            // Signal actually reached a live process — genuinely our cancel,
            // not a race against a natural exit that already happened.
            state.cancelled.write().unwrap().insert(run_id);
            return Ok(());
        }
        // ESRCH (no such process) means it already exited naturally before
        // the signal was sent — let the real exit code stand, don't mark
        // this a cancellation.
        return Ok(());
    }

    let ssh_write_half = state.ssh.read().unwrap().get(&run_id).cloned();
    if let Some(write_half) = ssh_write_half {
        // Same natural-completion race as the local path: only mark
        // cancelled if this call is the one that actually closed the
        // channel, not one that raced a channel already closed by the
        // command finishing on its own.
        write_half.close().await.map_err(|e| e.to_string())?;
        state.cancelled.write().unwrap().insert(run_id);
        return Ok(());
    }

    Err("no running snippet with this run id".to_string())
}

/// Runs a command locally and streams stdout/stderr back as Tauri events.
/// Emits `snippet_run_output` while running and `snippet_run_done` on exit.
#[tauri::command]
pub async fn snippet_run_local(
    app: tauri::AppHandle,
    run_id: String,
    command: String,
    working_dir: Option<String>,
    state: tauri::State<'_, SnippetRunState>,
) -> Result<(), String> {
    let trimmed = command.trim().to_string();
    if trimmed.is_empty() {
        return Err("empty command".into());
    }

    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".to_string());

    let mut cmd = tokio::process::Command::new(&shell);
    cmd.args(["-c", &trimmed])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    if let Some(dir) = working_dir.as_deref().filter(|s| !s.is_empty()) {
        cmd.current_dir(dir);
    }

    let mut child = cmd.spawn().map_err(|e| e.to_string())?;
    let stdout = child.stdout.take().map(BufReader::new);
    let stderr = child.stderr.take().map(BufReader::new);

    // Registered by PID only (see `snippet_run_cancel`'s doc comment) — this
    // task keeps sole, unshared ownership of `child` for its `wait()` below,
    // so no lock is needed here at all, and none is available for cancel to
    // contend with.
    if let Some(pid) = child.id() {
        state.local_pids.write().unwrap().insert(run_id.clone(), pid);
    }

    let app_out = app.clone();
    let run_id_out = run_id.clone();
    let out_task = if let Some(reader) = stdout {
        let mut lines = reader.lines();
        tokio::spawn(async move {
            while let Ok(Some(line)) = lines.next_line().await {
                let _ = app_out.emit(
                    "snippet_run_output",
                    serde_json::json!({ "runId": run_id_out, "data": line + "\n", "stream": "stdout" }),
                );
            }
        })
    } else {
        tokio::spawn(async {})
    };

    let app_err = app.clone();
    let run_id_err = run_id.clone();
    let err_task = if let Some(reader) = stderr {
        let mut lines = reader.lines();
        tokio::spawn(async move {
            while let Ok(Some(line)) = lines.next_line().await {
                let _ = app_err.emit(
                    "snippet_run_output",
                    serde_json::json!({ "runId": run_id_err, "data": line + "\n", "stream": "stderr" }),
                );
            }
        })
    } else {
        tokio::spawn(async {})
    };

    let _ = tokio::join!(out_task, err_task);

    let exit_code = child.wait().await.map(|s| s.code().unwrap_or(-1)).unwrap_or(-1);

    state.local_pids.write().unwrap().remove(&run_id);
    let cancelled = state.cancelled.write().unwrap().remove(&run_id);

    let _ = app.emit(
        "snippet_run_done",
        serde_json::json!({ "runId": run_id, "exitCode": exit_code, "cancelled": cancelled }),
    );

    Ok(())
}

/// Runs a command on an existing SSH session and streams output as Tauri events.
/// Requires an active SSH session (opened via ssh_connect). Uses a fresh exec
/// channel so it does not disturb the interactive PTY.
#[tauri::command]
pub async fn snippet_run_ssh(
    app: tauri::AppHandle,
    run_id: String,
    session_id: String,
    command: String,
    ssh_state: tauri::State<'_, crate::modules::ssh::SshState>,
    run_state: tauri::State<'_, SnippetRunState>,
) -> Result<(), String> {
    let session = crate::get_session_arc!(ssh_state, &session_id);

    let channel = session
        .handle
        .channel_open_session()
        .await
        .map_err(|e| e.to_string())?;
    channel.exec(true, command).await.map_err(|e| e.to_string())?;

    // Split so the write half (needed by `snippet_run_cancel` to close the
    // channel from another task) can be registered while this task keeps
    // exclusive ownership of the read half's message loop below.
    let (mut read_half, write_half) = channel.split();
    let write_half = Arc::new(write_half);
    run_state.ssh.write().unwrap().insert(run_id.clone(), write_half);

    // One loop interleaves stdout/stderr as they arrive off the same message
    // stream, streaming BOTH live via `snippet_run_output` as each message
    // comes in — unlike the old sequential `read()`-loop-then-full-stderr-dump
    // pattern, which only streamed stdout live and buffered stderr until the
    // stdout side had fully closed.
    let mut exit_code: i32 = -1;
    while let Some(msg) = read_half.wait().await {
        match msg {
            russh::ChannelMsg::Data { data } => {
                let chunk = String::from_utf8_lossy(&data).into_owned();
                let _ = app.emit(
                    "snippet_run_output",
                    serde_json::json!({ "runId": run_id, "data": chunk, "stream": "stdout" }),
                );
            }
            russh::ChannelMsg::ExtendedData { data, ext: 1 } => {
                let chunk = String::from_utf8_lossy(&data).into_owned();
                let _ = app.emit(
                    "snippet_run_output",
                    serde_json::json!({ "runId": run_id, "data": chunk, "stream": "stderr" }),
                );
            }
            russh::ChannelMsg::ExtendedData { .. } => {}
            // `ExitStatus` arrives *after* `Eof` (and before `Close`), so
            // breaking on Eof/Close here would discard it and leave
            // `exit_code` stuck at -1 forever — matches russh's own
            // client_exec_simple.rs example, which explicitly warns against
            // leaving the loop early. `read_half.wait()` returns `None` on its
            // own once the channel is fully closed, ending the loop naturally
            // (including when `snippet_run_cancel` force-closes it).
            russh::ChannelMsg::ExitStatus { exit_status } => exit_code = exit_status as i32,
            _ => {}
        }
    }

    run_state.ssh.write().unwrap().remove(&run_id);
    let cancelled = run_state.cancelled.write().unwrap().remove(&run_id);

    let _ = app.emit(
        "snippet_run_done",
        serde_json::json!({ "runId": run_id, "exitCode": exit_code, "cancelled": cancelled }),
    );

    Ok(())
}
