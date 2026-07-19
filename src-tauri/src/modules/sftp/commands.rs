use super::*;

#[tauri::command]
pub async fn enqueue_transfer(
    session_id: String,
    src_path: String,
    dest_path: String,
    direction: String,
    worker: tauri::State<'_, TransferWorkerState>,
) -> Result<String, String> {
    log::info!("[sftp] enqueue_transfer tab={} direction={} src={} dest={}", session_id, direction, src_path, dest_path);
    let id = uuid::Uuid::new_v4().to_string();
    let job = TransferJob {
        id: id.clone(),
        session_id,
        src_path,
        dest_path,
        direction: if direction == "upload" {
            TransferDirection::Upload
        } else {
            TransferDirection::Download
        },
        status: TransferStatus::Queued,
        bytes_total: 0,
        bytes_transferred: 0,
        speed_bps: 0.0,
        skipped_count: 0,
    };
    worker.sender.send(WorkerMessage::Enqueue(job))
        .await
        .map_err(|e| e.to_string())?;
    Ok(id)
}

#[tauri::command]
pub async fn cancel_transfer(
    job_id: String,
    worker: tauri::State<'_, TransferWorkerState>,
) -> Result<(), String> {
    worker.sender.send(WorkerMessage::Cancel(job_id))
        .await
        .map_err(|e| e.to_string())
}

/// Called after a dual-pane SFTP tab reconnects, so any transfer job still
/// running against the old (now-replaced) session gets cancelled and
/// re-enqueued against the fresh one instead of silently limping along
/// against a dead connection. No-op if nothing is currently running for
/// this session.
#[tauri::command]
pub async fn sftp_session_reconnected(
    session_id: String,
    worker: tauri::State<'_, TransferWorkerState>,
) -> Result<(), String> {
    worker.sender.send(WorkerMessage::SessionReconnected(session_id))
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn resolve_conflict(
    job_id: String,
    resolution: String,
    new_name: Option<String>,
    worker: tauri::State<'_, TransferWorkerState>,
) -> Result<(), String> {
    let mut map = worker.conflicts.lock().await;
    if let Some(tx) = map.remove(&job_id) {
        let _ = tx.send(ConflictResolution { resolution, new_name });
    }
    Ok(())
}

/// Pushes the frontend's `sftpMaxConcurrentTransfers`/`sftpChunkSizeKb`/
/// `sftpDefaultConflictResolution` settings into the running worker. Clamped
/// server-side independent of whatever range the Settings UI enforces — IPC
/// args are raw JSON, not a trusted boundary.
#[tauri::command]
pub async fn sftp_update_transfer_settings(
    max_concurrent: Option<usize>,
    chunk_size_bytes: Option<usize>,
    default_conflict_resolution: Option<String>,
    on_folder_file_error: Option<String>,
    worker: tauri::State<'_, TransferWorkerState>,
) -> Result<(), String> {
    use std::sync::atomic::Ordering;
    if let Some(v) = max_concurrent {
        worker.settings.max_concurrent.store(v.clamp(1, 16), Ordering::Relaxed);
    }
    if let Some(v) = chunk_size_bytes {
        worker.settings.chunk_size.store(v.clamp(4096, 8 * 1024 * 1024), Ordering::Relaxed);
    }
    if let Some(v) = default_conflict_resolution {
        if matches!(v.as_str(), "ask" | "overwrite" | "skip") {
            *worker.settings.default_conflict_resolution.lock().unwrap() = v;
        }
    }
    if let Some(v) = on_folder_file_error {
        if matches!(v.as_str(), "ask" | "skip" | "abort") {
            *worker.settings.on_folder_file_error.lock().unwrap() = v;
        }
    }
    Ok(())
}
