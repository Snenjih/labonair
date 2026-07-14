use std::process::Stdio;
use tauri::Emitter;
use tokio::io::{AsyncBufReadExt, BufReader};

/// Runs a command locally and streams stdout/stderr back as Tauri events.
/// Emits `snippet_run_output` while running and `snippet_run_done` on exit.
#[tauri::command]
pub async fn snippet_run_local(
    app: tauri::AppHandle,
    run_id: String,
    command: String,
    working_dir: Option<String>,
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

    let _ = app.emit(
        "snippet_run_done",
        serde_json::json!({ "runId": run_id, "exitCode": exit_code }),
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
    state: tauri::State<'_, crate::modules::ssh::SshState>,
) -> Result<(), String> {
    let session = crate::get_session_arc!(state, &session_id);

    let mut channel = session
        .handle
        .channel_open_session()
        .await
        .map_err(|e| e.to_string())?;
    channel.exec(true, command).await.map_err(|e| e.to_string())?;

    // One loop interleaves stdout/stderr as they arrive off the same message
    // stream, streaming BOTH live via `snippet_run_output` as each message
    // comes in — unlike the old sequential `read()`-loop-then-full-stderr-dump
    // pattern, which only streamed stdout live and buffered stderr until the
    // stdout side had fully closed.
    let mut exit_code: i32 = -1;
    while let Some(msg) = channel.wait().await {
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
            russh::ChannelMsg::ExitStatus { exit_status } => exit_code = exit_status as i32,
            russh::ChannelMsg::Eof | russh::ChannelMsg::Close => break,
            _ => {}
        }
    }

    let _ = app.emit(
        "snippet_run_done",
        serde_json::json!({ "runId": run_id, "exitCode": exit_code }),
    );

    Ok(())
}
