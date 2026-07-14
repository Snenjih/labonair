use super::*;
use super::net_error::is_network_error;
use crate::modules::ssh::{RushSession, SshState};
use russh_sftp::protocol::OpenFlags;
use std::io::Read;
use std::sync::Arc;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio_util::sync::CancellationToken;

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

/// Runs the (blocking, local-disk-only) MD5 hash on a dedicated blocking
/// thread — `compute_local_md5` itself stays untouched sync code, this just
/// gives it an async-friendly calling convention now that the rest of the
/// worker is async (per project rule: no blocking I/O on an async task).
async fn compute_local_md5_async(path: std::path::PathBuf) -> Result<String, String> {
    tokio::task::spawn_blocking(move || compute_local_md5(&path))
        .await
        .map_err(|e| e.to_string())?
}

/// Same `.wait()`-loop concurrent-drain fix `ssh/exec.rs` established —
/// replaces the old single blocking `read_to_string` on stdout only.
async fn compute_remote_md5(session: &RushSession, remote_path: &str) -> Option<String> {
    let mut channel = session.handle.channel_open_session().await.ok()?;
    let escaped = remote_path.replace('\'', "'\\''");
    channel.exec(true, format!("md5sum '{}'", escaped)).await.ok()?;

    let mut stdout_bytes: Vec<u8> = Vec::new();
    let mut exit_code: i32 = -1;
    while let Some(msg) = channel.wait().await {
        match msg {
            russh::ChannelMsg::Data { data } => stdout_bytes.extend_from_slice(&data),
            russh::ChannelMsg::ExtendedData { .. } => {}
            // `ExitStatus` arrives *after* `Eof` (and before `Close`), so
            // breaking on Eof/Close here would discard it and leave
            // `exit_code` stuck at -1 forever, making this function always
            // return `None` — matches russh's own client_exec_simple.rs
            // example, which explicitly warns against leaving the loop
            // early. `channel.wait()` returns `None` on its own once the
            // channel is fully closed, ending the loop naturally.
            russh::ChannelMsg::ExitStatus { exit_status } => exit_code = exit_status as i32,
            _ => {}
        }
    }
    if exit_code != 0 {
        return None;
    }
    let out = String::from_utf8_lossy(&stdout_bytes);
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
    ssh_state: SshState,
    app: tauri::AppHandle,
    conflicts: ConflictMap,
) {
    let mut queue: std::collections::VecDeque<TransferJob> = std::collections::VecDeque::new();
    // Per-job cancellation, replacing the old plain `HashSet<String>` that was
    // only checked once per CHUNK_SIZE iteration. A `CancellationToken` lets an
    // in-flight, genuinely-stalled chunk read/write be abandoned immediately
    // via `tokio::select!` instead of only being noticed in the gap between
    // chunks.
    let mut cancel_tokens: std::collections::HashMap<String, CancellationToken> =
        std::collections::HashMap::new();

    loop {
        // Drain pending messages without blocking
        loop {
            match rx.try_recv() {
                Ok(WorkerMessage::Enqueue(job)) => {
                    cancel_tokens.entry(job.id.clone()).or_default();
                    emit_progress(&app, &job);
                    queue.push_back(job);
                }
                Ok(WorkerMessage::Cancel(id)) => {
                    cancel_tokens.entry(id.clone()).or_default().cancel();
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
            let token = cancel_tokens
                .entry(job.id.clone())
                .or_default()
                .clone();
            if token.is_cancelled() {
                cancel_tokens.remove(&job.id);
                continue;
            }
            job.status = TransferStatus::Running;
            emit_progress(&app, &job);

            let result = process_job(&mut job, &ssh_state, &app, &conflicts, &token).await;
            cancel_tokens.remove(&job.id);

            match result {
                Ok(()) => {
                    job.status = TransferStatus::Completed;
                    emit_progress(&app, &job);
                }
                Err(e) => {
                    // Detect network-level failures and notify the frontend so
                    // it can show the reconnect overlay (same event as pty.rs).
                    let was_cancelled = token.is_cancelled();
                    if !was_cancelled && is_network_error(&e) {
                        if let Ok(mut map) = ssh_state.0.lock() {
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
                    job.status = if was_cancelled {
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
                    cancel_tokens.entry(job.id.clone()).or_default();
                    emit_progress(&app, &job);
                    queue.push_back(job);
                }
                Some(WorkerMessage::Cancel(id)) => {
                    cancel_tokens.entry(id).or_default().cancel();
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
    ssh_state: &SshState,
    app: &tauri::AppHandle,
    conflicts: &ConflictMap,
    cancel_token: &CancellationToken,
) -> Result<(), String> {
    log::info!(
        "[sftp] starting {:?} | id={} tab={} src={} dest={}",
        job.direction, job.id, job.session_id, job.src_path, job.dest_path
    );
    let result = match job.direction {
        TransferDirection::Download => download_file(job, ssh_state, app, conflicts, cancel_token).await,
        TransferDirection::Upload => upload_file(job, ssh_state, app, conflicts, cancel_token).await,
    };
    match &result {
        Ok(()) => log::info!("[sftp] completed id={}", job.id),
        Err(e) => log::error!("[sftp] failed id={} tab={} src={} dest={} — {}", job.id, job.session_id, job.src_path, job.dest_path, e),
    }
    result
}

/// Looks up the unified session and its lazily-opened SFTP subsystem for a
/// transfer job. Mirrors `ssh/sftp.rs`'s `get_sftp_session_arc`, but also
/// hands back the session itself (needed for `compute_remote_md5`'s exec
/// channel) rather than just the SFTP handle.
fn get_session_and_sftp(
    ssh_state: &SshState,
    session_id: &str,
) -> Result<(Arc<RushSession>, Arc<russh_sftp::client::SftpSession>), String> {
    let session = crate::get_session_arc!(ssh_state, session_id);
    let sftp = session
        .sftp
        .get()
        .cloned()
        .ok_or_else(|| "no SFTP session for tab".to_string())?;
    Ok((session, sftp))
}

async fn download_file(
    job: &mut TransferJob,
    ssh_state: &SshState,
    app: &tauri::AppHandle,
    conflicts: &ConflictMap,
    cancel_token: &CancellationToken,
) -> Result<(), String> {
    job.src_path = expand_home(&job.src_path);
    job.dest_path = expand_home(&job.dest_path);

    // Atomic local-filesystem create — closes the TOCTOU window between the
    // old `dest.exists()` check and the later unconditional `File::create`,
    // where a file created concurrently in between would be silently
    // overwritten. `create_new` is atomic on macOS/Windows/Linux alike.
    log::debug!("[sftp/download] attempting atomic local create: {}", job.dest_path);
    let mut local_file = match tokio::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&job.dest_path)
        .await
    {
        Ok(f) => f,
        Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => {
            log::debug!("[sftp/download] conflict detected, waiting for resolution");
            let resolution = ask_conflict(job, app, conflicts).await?;
            match resolution.resolution.as_str() {
                "skip" => { log::debug!("[sftp/download] skipped by user"); return Ok(()); }
                "rename" => {
                    let new_name = resolution.new_name.ok_or("rename requires new_name")?;
                    let dest = std::path::Path::new(&job.dest_path);
                    let new_dest = dest.parent().unwrap_or(dest).join(new_name);
                    job.dest_path = new_dest.to_string_lossy().to_string();
                    log::debug!("[sftp/download] renamed dest to: {}", job.dest_path);
                    tokio::fs::OpenOptions::new()
                        .write(true)
                        .create_new(true)
                        .open(&job.dest_path)
                        .await
                        .map_err(|e| format!("create({}) failed: {e}", job.dest_path))?
                }
                _ => {
                    // "overwrite" (or any other resolution) — matches the old
                    // code's unconditional overwrite-create fallthrough.
                    tokio::fs::OpenOptions::new()
                        .write(true)
                        .create(true)
                        .truncate(true)
                        .open(&job.dest_path)
                        .await
                        .map_err(|e| format!("create({}) failed: {e}", job.dest_path))?
                }
            }
        }
        Err(e) => return Err(format!("create({}) failed: {e}", job.dest_path)),
    };

    log::debug!("[sftp/download] looking up SFTP session for session_id={}", job.session_id);
    let (session, sftp) = get_session_and_sftp(ssh_state, &job.session_id)?;

    log::debug!("[sftp/download] opening remote file: {}", job.src_path);
    let meta = sftp
        .metadata(job.src_path.clone())
        .await
        .map_err(|e| format!("stat({}) failed: {e}", job.src_path))?;
    let file_size = meta.size.unwrap_or(0);
    log::debug!("[sftp/download] remote file size={} bytes", file_size);
    let mut remote_file = sftp
        .open(job.src_path.clone())
        .await
        .map_err(|e| format!("open({}) failed: {e}", job.src_path))?;
    job.bytes_total = file_size;

    let mut written = 0usize;
    let mut last_emit = std::time::Instant::now();
    let mut last_bytes = 0u64;
    let mut chunk_buf = [0u8; CHUNK_SIZE];

    // Streams remote -> local in CHUNK_SIZE pieces so a multi-GB download
    // doesn't spike memory usage. Each chunk's read/write is raced against
    // the cancellation token so an in-flight, stalled network read can be
    // abandoned immediately instead of only being checked between chunks.
    loop {
        let n = tokio::select! {
            _ = cancel_token.cancelled() => return Err("cancelled".to_string()),
            result = remote_file.read(&mut chunk_buf) => {
                result.map_err(|e| format!("read({}) failed: {e}", job.src_path))?
            }
        };
        if n == 0 {
            break;
        }
        tokio::select! {
            _ = cancel_token.cancelled() => return Err("cancelled".to_string()),
            result = local_file.write_all(&chunk_buf[..n]) => {
                result.map_err(|e| e.to_string())?;
            }
        }
        written += n;
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
    log::debug!("[sftp/download] read {} bytes from remote", written);

    // --- Post-transfer verification ---
    log::debug!("[sftp/download] verifying transfer id={}", job.id);
    let local_size = tokio::fs::metadata(&job.dest_path)
        .await
        .map_err(|e| format!("verify metadata({}) failed: {e}", job.dest_path))?
        .len();
    if local_size != file_size {
        return Err(format!(
            "Transfer failed: Size mismatch (remote={file_size}, local={local_size})."
        ));
    }

    let local_hash = compute_local_md5_async(std::path::PathBuf::from(&job.dest_path)).await?;
    match compute_remote_md5(&session, &job.src_path).await {
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

    Ok(())
}

async fn upload_file(
    job: &mut TransferJob,
    ssh_state: &SshState,
    app: &tauri::AppHandle,
    conflicts: &ConflictMap,
    cancel_token: &CancellationToken,
) -> Result<(), String> {
    job.src_path = expand_home(&job.src_path);
    job.dest_path = expand_home(&job.dest_path);

    log::debug!("[sftp/upload] opening local file: {}", job.src_path);
    let mut local_file = tokio::fs::File::open(&job.src_path)
        .await
        .map_err(|e| format!("read local file({}) failed: {e}", job.src_path))?;
    let file_size = local_file
        .metadata()
        .await
        .map_err(|e| format!("metadata local file({}) failed: {e}", job.src_path))?
        .len();
    job.bytes_total = file_size;
    log::debug!("[sftp/upload] local file size={} bytes", file_size);

    log::debug!("[sftp/upload] looking up SFTP session for session_id={}", job.session_id);
    let (session, sftp) = get_session_and_sftp(ssh_state, &job.session_id)?;

    // Single atomic exclusive-create attempt — no prior `stat()` check —
    // closes the stat-then-create TOCTOU window the old code had. Any
    // failure here is treated as "destination already exists", matching the
    // same ambiguity `ssh/sftp.rs`'s `sftp_create_file` already accepts for
    // this exact ATOMIC CREATE|EXCLUDE mechanism.
    log::debug!("[sftp/upload] attempting atomic remote create: {}", job.dest_path);
    let mut remote_file = match sftp
        .open_with_flags(job.dest_path.clone(), OpenFlags::CREATE | OpenFlags::EXCLUDE | OpenFlags::WRITE)
        .await
    {
        Ok(f) => f,
        Err(_) => {
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
                    sftp.open_with_flags(
                        job.dest_path.clone(),
                        OpenFlags::CREATE | OpenFlags::EXCLUDE | OpenFlags::WRITE,
                    )
                    .await
                    .map_err(|e| format!("create remote({}) failed: {e}", job.dest_path))?
                }
                _ => {
                    // "overwrite" (or any other resolution) — intentional
                    // overwrite, so EXCLUDE is dropped in favor of TRUNCATE.
                    sftp.open_with_flags(
                        job.dest_path.clone(),
                        OpenFlags::CREATE | OpenFlags::TRUNCATE | OpenFlags::WRITE,
                    )
                    .await
                    .map_err(|e| format!("create remote({}) failed: {e}", job.dest_path))?
                }
            }
        }
    };

    let mut written = 0usize;
    let mut last_emit = std::time::Instant::now();
    let mut last_bytes = 0u64;
    let mut chunk_buf = [0u8; CHUNK_SIZE];

    // Streams local -> remote in CHUNK_SIZE pieces instead of loading the
    // whole local file into a `Vec<u8>` up front — keeps memory flat for
    // multi-GB uploads. Each chunk's read/write is raced against the
    // cancellation token, same as the download side.
    loop {
        let n = tokio::select! {
            _ = cancel_token.cancelled() => return Err("cancelled".to_string()),
            result = local_file.read(&mut chunk_buf) => {
                result.map_err(|e| format!("read local file({}) failed: {e}", job.src_path))?
            }
        };
        if n == 0 {
            break;
        }
        tokio::select! {
            _ = cancel_token.cancelled() => return Err("cancelled".to_string()),
            result = remote_file.write_all(&chunk_buf[..n]) => {
                result.map_err(|e| e.to_string())?;
            }
        }
        written += n;
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
    // Drains pending write acks and closes the handle — without this, a
    // mid-write server error (disk full, permission denied) on the tail end
    // of the upload could go unnoticed.
    remote_file.shutdown().await.map_err(|e| e.to_string())?;
    log::debug!("[sftp/upload] wrote {} bytes to remote", written);

    // --- Post-transfer verification ---
    log::debug!("[sftp/upload] verifying transfer id={}", job.id);
    let remote_size = sftp
        .metadata(job.dest_path.clone())
        .await
        .map_err(|e| format!("verify stat({}) failed: {e}", job.dest_path))?
        .size
        .unwrap_or(0);
    if remote_size != file_size {
        return Err(format!(
            "Transfer failed: Size mismatch (local={file_size}, remote={remote_size})."
        ));
    }

    let local_hash = compute_local_md5_async(std::path::PathBuf::from(&job.src_path)).await?;
    match compute_remote_md5(&session, &job.dest_path).await {
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
