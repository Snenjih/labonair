use super::*;

#[tauri::command]
pub async fn enqueue_transfer(
    tab_id: String,
    src_path: String,
    dest_path: String,
    direction: String,
    worker: tauri::State<'_, TransferWorkerState>,
) -> Result<String, String> {
    log::info!("[sftp] enqueue_transfer tab={} direction={} src={} dest={}", tab_id, direction, src_path, dest_path);
    let id = uuid::Uuid::new_v4().to_string();
    let job = TransferJob {
        id: id.clone(),
        tab_id,
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
