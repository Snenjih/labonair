use std::collections::{HashMap, HashSet};
use std::process::Stdio;
use std::sync::{Arc, RwLock};
use tauri::Emitter;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::sync::Mutex as AsyncMutex;

/// Tracks in-flight snippet runs so `snippet_run_cancel` can reach back into
/// them — local runs by their `tokio::process::Child` handle, SSH runs by the
/// split-off write half of their exec channel (same `Arc<ChannelWriteHalf<..>>`,
/// no-lock-needed shape as `ssh::PtyChannelState`, since all of its methods
/// take `&self`). `cancelled` records which `run_id`s were cancelled so the
/// owning task can report a distinct "cancelled" outcome instead of treating
/// the resulting kill/close as a plain failure.
#[derive(Default)]
pub struct SnippetRunState {
    local: RwLock<HashMap<String, Arc<AsyncMutex<tokio::process::Child>>>>,
    ssh: RwLock<HashMap<String, Arc<russh::ChannelWriteHalf<russh::client::Msg>>>>,
    cancelled: RwLock<HashSet<String>>,
}

/// Cancels a running snippet started via `snippet_run_local` or
/// `snippet_run_ssh`. Kills the local child process or closes the SSH exec
/// channel, whichever is registered under `run_id`. The owning command
/// notices the resulting exit/close and emits `snippet_run_done` with
/// `cancelled: true` so the frontend can show a distinct "Cancelled" status.
#[tauri::command]
pub async fn snippet_run_cancel(
    run_id: String,
    state: tauri::State<'_, SnippetRunState>,
) -> Result<(), String> {
    let local_child = state.local.read().unwrap().get(&run_id).cloned();
    if let Some(child) = local_child {
        state.cancelled.write().unwrap().insert(run_id);
        child.lock().await.start_kill().map_err(|e| e.to_string())?;
        return Ok(());
    }

    let ssh_write_half = state.ssh.read().unwrap().get(&run_id).cloned();
    if let Some(write_half) = ssh_write_half {
        state.cancelled.write().unwrap().insert(run_id);
        write_half.close().await.map_err(|e| e.to_string())?;
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

    let child = Arc::new(AsyncMutex::new(child));
    state.local.write().unwrap().insert(run_id.clone(), child.clone());

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

    let exit_code = child
        .lock()
        .await
        .wait()
        .await
        .map(|s| s.code().unwrap_or(-1))
        .unwrap_or(-1);

    state.local.write().unwrap().remove(&run_id);
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
