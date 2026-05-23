use super::*;
use std::io::{Read, Write};
use std::sync::Arc;

const CHUNK_SIZE: usize = 65536;

fn compute_local_md5(path: &std::path::Path) -> Result<String, String> {
    let mut file = std::fs::File::open(path).map_err(|e| e.to_string())?;
    let mut ctx = md5::Context::new();
    let mut buf = vec![0u8; CHUNK_SIZE];
    loop {
        let n = file.read(&mut buf).map_err(|e| e.to_string())?;
        if n == 0 { break; }
        ctx.consume(&buf[..n]);
    }
    Ok(format!("{:x}", ctx.compute()))
}

fn compute_remote_md5(session: &ssh2::Session, remote_path: &str) -> Option<String> {
    let mut ch = session.channel_session().ok()?;
    let escaped = remote_path.replace('\'', "'\\''");
    ch.exec(&format!("md5sum '{}'", escaped)).ok()?;
    let mut out = String::new();
    ch.read_to_string(&mut out).ok()?;
    ch.wait_close().ok()?;
    if ch.exit_status().ok()? != 0 { return None; }
    out.split_whitespace().next().map(|s| s.to_string())
}
const PROGRESS_EMIT_INTERVAL_MS: u128 = 100;

fn expand_home(path: &str) -> String {
    if path == "~" {
        dirs::home_dir()
            .map(|h| h.to_string_lossy().to_string())
            .unwrap_or_else(|| path.to_string())
    } else if path.starts_with("~/") {
        dirs::home_dir()
            .map(|mut h| { h.push(&path[2..]); h.to_string_lossy().to_string() })
            .unwrap_or_else(|| path.to_string())
    } else {
        path.to_string()
    }
}

pub async fn run_worker(
    mut rx: mpsc::Receiver<WorkerMessage>,
    sftp_state: Arc<crate::modules::sftp::SftpState>,
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

            let result = process_job(&mut job, &sftp_state, &app, &conflicts, &cancelled).await;

            match result {
                Ok(()) => {
                    job.status = TransferStatus::Completed;
                    emit_progress(&app, &job);
                }
                Err(e) => {
                    // Detect network-level failures and notify the frontend so
                    // it can show the reconnect overlay (same event as pty.rs).
                    if !cancelled.contains(&job.id) && is_network_error(&e) {
                        if let Ok(mut map) = sftp_state.0.lock() {
                            map.remove(&job.session_id);
                        }
                        use tauri::Emitter;
                        let _ = app.emit(
                            "ssh_connection_lost",
                            serde_json::json!({
                                "session_id": job.session_id,
                                "reason": e,
                            }),
                        );
                    }
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

fn is_network_error(e: &str) -> bool {
    let lower = e.to_lowercase();
    lower.contains("broken pipe")
        || lower.contains("connection reset")
        || lower.contains("connection refused")
        || lower.contains("no route to host")
        || lower.contains("network")
        || lower.contains("no sftp session")
        || lower.contains("sftp_state lock")
}

async fn process_job(
    job: &mut TransferJob,
    sftp_state: &Arc<crate::modules::sftp::SftpState>,
    app: &tauri::AppHandle,
    conflicts: &ConflictMap,
    cancelled: &std::collections::HashSet<String>,
) -> Result<(), String> {
    log::info!(
        "[sftp] starting {:?} | id={} tab={} src={} dest={}",
        job.direction, job.id, job.session_id, job.src_path, job.dest_path
    );
    let result = match job.direction {
        TransferDirection::Download => download_file(job, sftp_state, app, conflicts, cancelled).await,
        TransferDirection::Upload => upload_file(job, sftp_state, app, conflicts, cancelled).await,
    };
    match &result {
        Ok(()) => log::info!("[sftp] completed id={}", job.id),
        Err(e) => log::error!("[sftp] failed id={} tab={} src={} dest={} — {}", job.id, job.session_id, job.src_path, job.dest_path, e),
    }
    result
}

async fn download_file(
    job: &mut TransferJob,
    sftp_state: &Arc<crate::modules::sftp::SftpState>,
    app: &tauri::AppHandle,
    conflicts: &ConflictMap,
    cancelled: &std::collections::HashSet<String>,
) -> Result<(), String> {
    job.src_path = expand_home(&job.src_path);
    job.dest_path = expand_home(&job.dest_path);
    log::debug!("[sftp/download] checking dest exists: {}", job.dest_path);
    let dest = std::path::Path::new(&job.dest_path);
    if dest.exists() {
        log::debug!("[sftp/download] conflict detected, waiting for resolution");
        let resolution = ask_conflict(job, app, conflicts).await?;
        match resolution.resolution.as_str() {
            "skip" => { log::debug!("[sftp/download] skipped by user"); return Ok(()); }
            "rename" => {
                let new_name = resolution.new_name.ok_or("rename requires new_name")?;
                let new_dest = dest.parent().unwrap_or(dest).join(new_name);
                job.dest_path = new_dest.to_string_lossy().to_string();
                log::debug!("[sftp/download] renamed dest to: {}", job.dest_path);
            }
            _ => {}
        }
    }

    log::debug!("[sftp/download] looking up SFTP session for session_id={}", job.session_id);
    let (file_size, data) = {
        let sftp_arc = {
            let map = sftp_state.0.lock().map_err(|e| format!("sftp_state lock: {e}"))?;
            let entry = map.get(&job.session_id)
                .ok_or_else(|| format!("no SFTP session for session_id={} (active tabs: {:?})", job.session_id, map.keys().collect::<Vec<_>>()))?;
            entry.sftp.clone()
        };
        log::debug!("[sftp/download] opening remote file: {}", job.src_path);
        let sftp = sftp_arc.lock().map_err(|e| format!("sftp lock: {e}"))?;
        let stat = sftp.0.stat(std::path::Path::new(&job.src_path))
            .map_err(|e| format!("stat({}) failed: {e}", job.src_path))?;
        let size = stat.size.unwrap_or(0);
        log::debug!("[sftp/download] remote file size={} bytes", size);
        let mut remote_file = sftp.0.open(std::path::Path::new(&job.src_path))
            .map_err(|e| format!("open({}) failed: {e}", job.src_path))?;
        let mut buf = Vec::with_capacity(size as usize);
        remote_file.read_to_end(&mut buf).map_err(|e| format!("read({}) failed: {e}", job.src_path))?;
        log::debug!("[sftp/download] read {} bytes from remote", buf.len());
        (size, buf)
    };

    job.bytes_total = file_size;

    log::debug!("[sftp/download] creating local file: {}", job.dest_path);
    let mut local_file = std::fs::File::create(&job.dest_path)
        .map_err(|e| format!("create({}) failed: {e}", job.dest_path))?;
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
    drop(local_file);

    // --- Post-transfer verification ---
    log::debug!("[sftp/download] verifying transfer id={}", job.id);
    let local_size = std::fs::metadata(&job.dest_path)
        .map_err(|e| format!("verify metadata({}) failed: {e}", job.dest_path))?
        .len();
    if local_size != file_size {
        return Err(format!(
            "Transfer failed: Size mismatch (remote={file_size}, local={local_size})."
        ));
    }

    let session_arc = {
        let map = sftp_state.0.lock().map_err(|e| format!("sftp_state lock: {e}"))?;
        map.get(&job.session_id)
            .ok_or_else(|| format!("no SFTP session for session_id={}", job.session_id))?
            .session.clone()
    };
    let local_hash = compute_local_md5(std::path::Path::new(&job.dest_path))?;
    {
        let session = session_arc.lock().map_err(|e| format!("session lock: {e}"))?;
        match compute_remote_md5(&session.0, &job.src_path) {
            Some(remote_hash) => {
                if local_hash != remote_hash {
                    return Err(format!(
                        "Transfer failed: MD5 checksum mismatch (remote={remote_hash}, local={local_hash}). File is corrupted."
                    ));
                }
                log::debug!("[sftp/download] md5 verified ok id={}", job.id);
            }
            None => {
                log::warn!("[sftp/download] md5sum unavailable on remote, relying on size check id={}", job.id);
            }
        }
    }

    Ok(())
}

async fn upload_file(
    job: &mut TransferJob,
    sftp_state: &Arc<crate::modules::sftp::SftpState>,
    app: &tauri::AppHandle,
    conflicts: &ConflictMap,
    cancelled: &std::collections::HashSet<String>,
) -> Result<(), String> {
    job.src_path = expand_home(&job.src_path);
    job.dest_path = expand_home(&job.dest_path);
    log::debug!("[sftp/upload] reading local file: {}", job.src_path);
    let data = std::fs::read(&job.src_path)
        .map_err(|e| format!("read local file({}) failed: {e}", job.src_path))?;
    job.bytes_total = data.len() as u64;
    log::debug!("[sftp/upload] local file size={} bytes", data.len());

    log::debug!("[sftp/upload] looking up SFTP session for session_id={}", job.session_id);
    let conflict_exists = {
        let sftp_arc = {
            let map = sftp_state.0.lock().map_err(|e| format!("sftp_state lock: {e}"))?;
            let entry = map.get(&job.session_id)
                .ok_or_else(|| format!("no SFTP session for session_id={} (active tabs: {:?})", job.session_id, map.keys().collect::<Vec<_>>()))?;
            entry.sftp.clone()
        };
        let sftp = sftp_arc.lock().map_err(|e| format!("sftp lock: {e}"))?;
        sftp.0.stat(std::path::Path::new(&job.dest_path)).is_ok()
    };

    if conflict_exists {
        log::debug!("[sftp/upload] conflict at dest: {}", job.dest_path);
        let resolution = ask_conflict(job, app, conflicts).await?;
        match resolution.resolution.as_str() {
            "skip" => { log::debug!("[sftp/upload] skipped by user"); return Ok(()); }
            "rename" => {
                let new_name = resolution.new_name.ok_or("rename requires new_name")?;
                let dest = std::path::Path::new(&job.dest_path);
                let new_dest = dest.parent().unwrap_or(dest).join(new_name);
                job.dest_path = new_dest.to_string_lossy().to_string();
                log::debug!("[sftp/upload] renamed dest to: {}", job.dest_path);
            }
            _ => {}
        }
    }

    let mut last_emit = std::time::Instant::now();
    let mut last_bytes = 0u64;

    log::debug!("[sftp/upload] creating remote file: {}", job.dest_path);
    let sftp_arc = {
        let map = sftp_state.0.lock().map_err(|e| format!("sftp_state lock: {e}"))?;
        let entry = map.get(&job.session_id)
            .ok_or_else(|| format!("no SFTP session for session_id={}", job.session_id))?;
        entry.sftp.clone()
    };
    let sftp = sftp_arc.lock().map_err(|e| format!("sftp lock: {e}"))?;
    let mut remote_file = sftp.0.create(std::path::Path::new(&job.dest_path))
        .map_err(|e| format!("create remote({}) failed: {e}", job.dest_path))?;

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
    drop(remote_file);

    // --- Post-transfer verification ---
    log::debug!("[sftp/upload] verifying transfer id={}", job.id);
    {
        let remote_size = sftp.0.stat(std::path::Path::new(&job.dest_path))
            .map_err(|e| format!("verify stat({}) failed: {e}", job.dest_path))?
            .size.unwrap_or(0);
        if remote_size != data.len() as u64 {
            return Err(format!(
                "Transfer failed: Size mismatch (local={}, remote={}).",
                data.len(), remote_size
            ));
        }
    }
    drop(sftp);

    let session_arc = {
        let map = sftp_state.0.lock().map_err(|e| format!("sftp_state lock: {e}"))?;
        map.get(&job.session_id)
            .ok_or_else(|| format!("no SFTP session for session_id={}", job.session_id))?
            .session.clone()
    };
    let local_hash = compute_local_md5(std::path::Path::new(&job.src_path))?;
    {
        let session = session_arc.lock().map_err(|e| format!("session lock: {e}"))?;
        match compute_remote_md5(&session.0, &job.dest_path) {
            Some(remote_hash) => {
                if local_hash != remote_hash {
                    return Err(format!(
                        "Transfer failed: MD5 checksum mismatch (local={local_hash}, remote={remote_hash}). File is corrupted."
                    ));
                }
                log::debug!("[sftp/upload] md5 verified ok id={}", job.id);
            }
            None => {
                log::warn!("[sftp/upload] md5sum unavailable on remote, relying on size check id={}", job.id);
            }
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
