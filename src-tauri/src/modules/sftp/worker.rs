use super::*;
use std::io::{Read, Write};
use std::sync::Arc;

const CHUNK_SIZE: usize = 65536;
const PROGRESS_EMIT_INTERVAL_MS: u128 = 100;

pub async fn run_worker(
    mut rx: mpsc::Receiver<WorkerMessage>,
    ssh_state: Arc<crate::modules::ssh::SshState>,
    app: tauri::AppHandle,
    conflicts: ConflictMap,
) {
    let mut queue: std::collections::VecDeque<TransferJob> = std::collections::VecDeque::new();
    let mut cancelled: std::collections::HashSet<String> = std::collections::HashSet::new();

    loop {
        // Drain pending messages without blocking
        loop {
            match rx.try_recv() {
                Ok(WorkerMessage::Enqueue(job)) => {
                    emit_progress(&app, &job);
                    queue.push_back(job);
                }
                Ok(WorkerMessage::Cancel(id)) => {
                    cancelled.insert(id.clone());
                    queue.retain(|j| j.id != id);
                }
                Ok(WorkerMessage::ResolveConflict { job_id, resolution, new_name }) => {
                    let mut map = conflicts.lock().await;
                    if let Some(tx) = map.remove(&job_id) {
                        let _ = tx.send(ConflictResolution { resolution, new_name });
                    }
                }
                Err(tokio::sync::mpsc::error::TryRecvError::Empty) => break,
                Err(tokio::sync::mpsc::error::TryRecvError::Disconnected) => return,
            }
        }

        if let Some(mut job) = queue.pop_front() {
            if cancelled.contains(&job.id) {
                continue;
            }
            job.status = TransferStatus::Running;
            emit_progress(&app, &job);

            let result = process_job(&mut job, &ssh_state, &app, &conflicts, &cancelled).await;

            match result {
                Ok(()) => {
                    job.status = TransferStatus::Completed;
                    emit_progress(&app, &job);
                }
                Err(e) => {
                    job.status = if cancelled.contains(&job.id) {
                        TransferStatus::Cancelled
                    } else {
                        TransferStatus::Failed(e)
                    };
                    emit_progress(&app, &job);
                }
            }
        } else {
            // Queue empty — block until next message
            match rx.recv().await {
                Some(WorkerMessage::Enqueue(job)) => {
                    emit_progress(&app, &job);
                    queue.push_back(job);
                }
                Some(WorkerMessage::Cancel(id)) => {
                    cancelled.insert(id);
                }
                Some(WorkerMessage::ResolveConflict { job_id, resolution, new_name }) => {
                    let mut map = conflicts.lock().await;
                    if let Some(tx) = map.remove(&job_id) {
                        let _ = tx.send(ConflictResolution { resolution, new_name });
                    }
                }
                None => return,
            }
        }
    }
}

fn emit_progress(app: &tauri::AppHandle, job: &TransferJob) {
    use tauri::Emitter;
    let _ = app.emit("transfer_progress", job);
}

async fn process_job(
    job: &mut TransferJob,
    ssh_state: &Arc<crate::modules::ssh::SshState>,
    app: &tauri::AppHandle,
    conflicts: &ConflictMap,
    cancelled: &std::collections::HashSet<String>,
) -> Result<(), String> {
    match job.direction {
        TransferDirection::Download => download_file(job, ssh_state, app, conflicts, cancelled).await,
        TransferDirection::Upload => upload_file(job, ssh_state, app, conflicts, cancelled).await,
    }
}

async fn download_file(
    job: &mut TransferJob,
    ssh_state: &Arc<crate::modules::ssh::SshState>,
    app: &tauri::AppHandle,
    conflicts: &ConflictMap,
    cancelled: &std::collections::HashSet<String>,
) -> Result<(), String> {
    let dest = std::path::Path::new(&job.dest_path);
    if dest.exists() {
        let resolution = ask_conflict(job, app, conflicts).await?;
        match resolution.resolution.as_str() {
            "skip" => return Ok(()),
            "rename" => {
                let new_name = resolution.new_name.ok_or("rename requires new_name")?;
                let new_dest = dest.parent().unwrap_or(dest).join(new_name);
                job.dest_path = new_dest.to_string_lossy().to_string();
            }
            _ => {}
        }
    }

    let (file_size, data) = {
        let sftp_arc = {
            let map = ssh_state.0.lock().map_err(|e| e.to_string())?;
            let entry = map.get(&job.tab_id).ok_or("no SSH session for host")?;
            entry.sftp.as_ref().ok_or("no SFTP handle for host")?.clone()
        };
        let sftp = sftp_arc.lock().map_err(|e| e.to_string())?;
        let stat = sftp.0.stat(std::path::Path::new(&job.src_path)).map_err(|e| e.to_string())?;
        let size = stat.size.unwrap_or(0);
        let mut remote_file = sftp.0.open(std::path::Path::new(&job.src_path)).map_err(|e| e.to_string())?;
        let mut buf = Vec::with_capacity(size as usize);
        remote_file.read_to_end(&mut buf).map_err(|e| e.to_string())?;
        (size, buf)
    };

    job.bytes_total = file_size;

    let mut local_file = std::fs::File::create(&job.dest_path).map_err(|e| e.to_string())?;
    let mut written = 0usize;
    let mut last_emit = std::time::Instant::now();
    let mut last_bytes = 0u64;

    for chunk in data.chunks(CHUNK_SIZE) {
        if cancelled.contains(&job.id) {
            return Err("cancelled".to_string());
        }
        local_file.write_all(chunk).map_err(|e| e.to_string())?;
        written += chunk.len();
        job.bytes_transferred = written as u64;

        let elapsed = last_emit.elapsed().as_millis();
        if elapsed >= PROGRESS_EMIT_INTERVAL_MS {
            let bytes_delta = job.bytes_transferred - last_bytes;
            job.speed_bps = bytes_delta as f64 / (elapsed as f64 / 1000.0);
            last_bytes = job.bytes_transferred;
            last_emit = std::time::Instant::now();
            emit_progress(app, job);
        }
    }
    Ok(())
}

async fn upload_file(
    job: &mut TransferJob,
    ssh_state: &Arc<crate::modules::ssh::SshState>,
    app: &tauri::AppHandle,
    conflicts: &ConflictMap,
    cancelled: &std::collections::HashSet<String>,
) -> Result<(), String> {
    let data = std::fs::read(&job.src_path).map_err(|e| e.to_string())?;
    job.bytes_total = data.len() as u64;

    let conflict_exists = {
        let sftp_arc = {
            let map = ssh_state.0.lock().map_err(|e| e.to_string())?;
            let entry = map.get(&job.tab_id).ok_or("no SSH session for host")?;
            entry.sftp.as_ref().ok_or("no SFTP handle for host")?.clone()
        };
        let sftp = sftp_arc.lock().map_err(|e| e.to_string())?;
        sftp.0.stat(std::path::Path::new(&job.dest_path)).is_ok()
    };

    if conflict_exists {
        let resolution = ask_conflict(job, app, conflicts).await?;
        match resolution.resolution.as_str() {
            "skip" => return Ok(()),
            "rename" => {
                let new_name = resolution.new_name.ok_or("rename requires new_name")?;
                let dest = std::path::Path::new(&job.dest_path);
                let new_dest = dest.parent().unwrap_or(dest).join(new_name);
                job.dest_path = new_dest.to_string_lossy().to_string();
            }
            _ => {}
        }
    }

    let mut last_emit = std::time::Instant::now();
    let mut last_bytes = 0u64;

    let sftp_arc = {
        let map = ssh_state.0.lock().map_err(|e| e.to_string())?;
        let entry = map.get(&job.tab_id).ok_or("no SSH session for host")?;
        entry.sftp.as_ref().ok_or("no SFTP handle for host")?.clone()
    };
    let sftp = sftp_arc.lock().map_err(|e| e.to_string())?;
    let mut remote_file = sftp.0.create(std::path::Path::new(&job.dest_path)).map_err(|e| e.to_string())?;

    for (i, chunk) in data.chunks(CHUNK_SIZE).enumerate() {
        if cancelled.contains(&job.id) {
            return Err("cancelled".to_string());
        }
        remote_file.write_all(chunk).map_err(|e| e.to_string())?;
        job.bytes_transferred = ((i + 1) * CHUNK_SIZE).min(data.len()) as u64;

        let elapsed = last_emit.elapsed().as_millis();
        if elapsed >= PROGRESS_EMIT_INTERVAL_MS {
            let bytes_delta = job.bytes_transferred - last_bytes;
            job.speed_bps = bytes_delta as f64 / (elapsed as f64 / 1000.0);
            last_bytes = job.bytes_transferred;
            last_emit = std::time::Instant::now();
            emit_progress(app, job);
        }
    }
    Ok(())
}

async fn ask_conflict(
    job: &TransferJob,
    app: &tauri::AppHandle,
    conflicts: &ConflictMap,
) -> Result<ConflictResolution, String> {
    use tauri::Emitter;
    let (tx, rx) = tokio::sync::oneshot::channel::<ConflictResolution>();
    {
        let mut map = conflicts.lock().await;
        map.insert(job.id.clone(), tx);
    }
    app.emit("file_conflict", serde_json::json!({
        "job_id": job.id,
        "src_path": job.src_path,
        "dest_path": job.dest_path,
    })).map_err(|e| e.to_string())?;

    rx.await.map_err(|_| "conflict resolution channel closed".to_string())
}
