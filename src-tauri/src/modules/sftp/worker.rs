use super::*;
use super::net_error::is_network_error;
use crate::modules::ssh::{RushSession, SshState};
use russh_sftp::protocol::OpenFlags;
use std::io::Read;
use std::sync::Arc;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio_util::sync::CancellationToken;

fn compute_local_md5(path: &std::path::Path, chunk_size: usize) -> Result<String, String> {
    let mut file = std::fs::File::open(path).map_err(|e| e.to_string())?;
    let mut ctx = md5::Context::new();
    let mut buf = vec![0u8; chunk_size];
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
async fn compute_local_md5_async(path: std::path::PathBuf, chunk_size: usize) -> Result<String, String> {
    tokio::task::spawn_blocking(move || compute_local_md5(&path, chunk_size))
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

/// One finished job's outcome: id (for `cancel_tokens` bookkeeping), the job
/// itself (mutated in place by `process_job`, carried back out since it was
/// moved into the spawned task), its result, and the cancellation token that
/// was raced against during the transfer (checked here to tell a real
/// failure apart from a user-initiated cancel).
type JoinedJob = (String, TransferJob, Result<(), String>, CancellationToken);

pub async fn run_worker(
    mut rx: mpsc::Receiver<WorkerMessage>,
    ssh_state: SshState,
    app: tauri::AppHandle,
    conflicts: ConflictMap,
    settings: Arc<TransferSettings>,
) {
    let mut queue: std::collections::VecDeque<TransferJob> = std::collections::VecDeque::new();
    // Per-job cancellation, replacing the old plain `HashSet<String>` that was
    // only checked once per CHUNK_SIZE iteration. A `CancellationToken` lets an
    // in-flight, genuinely-stalled chunk read/write be abandoned immediately
    // via `tokio::select!` instead of only being noticed in the gap between
    // chunks.
    let mut cancel_tokens: std::collections::HashMap<String, CancellationToken> =
        std::collections::HashMap::new();
    // Snapshot of each currently-running job (session_id/src/dest/direction),
    // keyed by job id — lets `SessionReconnected` find which in-flight jobs
    // belong to a given session without having to reach into `in_flight`
    // (whose `TransferJob`s are moved into their spawned tasks and only come
    // back out via `join_next()`). Populated right before spawn, removed in
    // `finish_job`.
    let mut running_snapshots: std::collections::HashMap<String, TransferJob> =
        std::collections::HashMap::new();
    // Job ids cancelled specifically because their session was reconnected
    // (as opposed to a genuine user-initiated cancel) — `finish_job` consults
    // this to know whether to re-enqueue a fresh equivalent job once the
    // cancelled one actually finishes.
    let mut reconnect_requeue: std::collections::HashSet<String> = std::collections::HashSet::new();
    // Jobs currently running as their own spawned tasks, up to
    // `settings.max_concurrent` at a time. Bounding this via `JoinSet` (rather
    // than awaiting `process_job` inline like before) is what actually enables
    // concurrent transfers — the SFTP layer itself already supports concurrent
    // operations on one session (russh-sftp multiplexes requests by id over a
    // single background I/O task), so no session-level locking is needed here.
    let mut in_flight: tokio::task::JoinSet<JoinedJob> = tokio::task::JoinSet::new();

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
                Ok(WorkerMessage::SessionReconnected(session_id)) => {
                    handle_session_reconnected(&session_id, &running_snapshots, &cancel_tokens, &mut reconnect_requeue);
                }
                Err(tokio::sync::mpsc::error::TryRecvError::Empty) => break,
                Err(tokio::sync::mpsc::error::TryRecvError::Disconnected) => return,
            }
        }

        // Top up in-flight jobs to the currently configured concurrency cap.
        // Non-preemptive by design: lowering the cap mid-session doesn't
        // cancel already-running jobs, it only throttles new ones once
        // `in_flight` naturally drops below the new limit.
        let cap = settings.max_concurrent.load(std::sync::atomic::Ordering::Relaxed).max(1);
        while in_flight.len() < cap {
            let Some(mut job) = queue.pop_front() else { break };
            let token = cancel_tokens.entry(job.id.clone()).or_default().clone();
            if token.is_cancelled() {
                cancel_tokens.remove(&job.id);
                continue;
            }
            job.status = TransferStatus::Running;
            emit_progress(&app, &job);

            running_snapshots.insert(job.id.clone(), job.clone());
            let job_id = job.id.clone();
            let ssh_state_c = ssh_state.clone();
            let app_c = app.clone();
            let conflicts_c = conflicts.clone();
            let settings_c = settings.clone();
            let token_c = token.clone();
            in_flight.spawn(async move {
                let result =
                    process_job(&mut job, &ssh_state_c, &app_c, &conflicts_c, &token_c, &settings_c).await;
                (job_id, job, result, token_c)
            });
        }

        if in_flight.is_empty() {
            // Nothing running (and therefore, since we always top up above,
            // the queue is empty too) — block until the next control message.
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
                Some(WorkerMessage::SessionReconnected(session_id)) => {
                    // Nothing can be running while `in_flight` is empty (we
                    // only reach this branch then), so this is always a no-op
                    // here — kept for exhaustiveness, not because it does
                    // anything in this branch.
                    handle_session_reconnected(&session_id, &running_snapshots, &cancel_tokens, &mut reconnect_requeue);
                }
                None => return,
            }
            continue;
        }

        tokio::select! {
            msg = rx.recv() => match msg {
                Some(WorkerMessage::Enqueue(job)) => {
                    cancel_tokens.entry(job.id.clone()).or_default();
                    emit_progress(&app, &job);
                    queue.push_back(job);
                }
                Some(WorkerMessage::Cancel(id)) => {
                    cancel_tokens.entry(id.clone()).or_default().cancel();
                    queue.retain(|j| j.id != id);
                }
                Some(WorkerMessage::ResolveConflict { job_id, resolution, new_name }) => {
                    let mut map = conflicts.lock().await;
                    if let Some(tx) = map.remove(&job_id) {
                        let _ = tx.send(ConflictResolution { resolution, new_name });
                    }
                }
                Some(WorkerMessage::SessionReconnected(session_id)) => {
                    handle_session_reconnected(&session_id, &running_snapshots, &cancel_tokens, &mut reconnect_requeue);
                }
                None => {
                    while let Some(joined) = in_flight.join_next().await {
                        finish_job(joined, &app, &ssh_state, &mut cancel_tokens, &mut running_snapshots, &mut reconnect_requeue, &mut queue);
                    }
                    return;
                }
            },
            Some(joined) = in_flight.join_next() => {
                finish_job(joined, &app, &ssh_state, &mut cancel_tokens, &mut running_snapshots, &mut reconnect_requeue, &mut queue);
            }
        }
    }
}

/// Cancels every currently-running job belonging to `session_id` (e.g. after
/// a dual-pane SFTP tab reconnects) and marks them in `reconnect_requeue` so
/// `finish_job` re-enqueues a fresh equivalent job once each one actually
/// finishes. No-op (and therefore safe to call repeatedly, including twice in
/// quick succession) if nothing is currently running for that session.
fn handle_session_reconnected(
    session_id: &str,
    running_snapshots: &std::collections::HashMap<String, TransferJob>,
    cancel_tokens: &std::collections::HashMap<String, CancellationToken>,
    reconnect_requeue: &mut std::collections::HashSet<String>,
) {
    for (job_id, snapshot) in running_snapshots {
        if snapshot.session_id != session_id {
            continue;
        }
        if let Some(token) = cancel_tokens.get(job_id) {
            reconnect_requeue.insert(job_id.clone());
            token.cancel();
        }
    }
}

fn finish_job(
    joined: Result<JoinedJob, tokio::task::JoinError>,
    app: &tauri::AppHandle,
    ssh_state: &SshState,
    cancel_tokens: &mut std::collections::HashMap<String, CancellationToken>,
    running_snapshots: &mut std::collections::HashMap<String, TransferJob>,
    reconnect_requeue: &mut std::collections::HashSet<String>,
    queue: &mut std::collections::VecDeque<TransferJob>,
) {
    match joined {
        Ok((job_id, mut job, result, token)) => {
            cancel_tokens.remove(&job_id);
            running_snapshots.remove(&job_id);
            let requeue_for_reconnect = reconnect_requeue.remove(&job_id);
            match result {
                Ok(()) => {
                    job.status = TransferStatus::Completed;
                    emit_progress(app, &job);
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
                    emit_progress(app, &job);
                }
            }
            if requeue_for_reconnect {
                let fresh = TransferJob {
                    id: uuid::Uuid::new_v4().to_string(),
                    session_id: job.session_id.clone(),
                    src_path: job.src_path.clone(),
                    dest_path: job.dest_path.clone(),
                    direction: job.direction.clone(),
                    status: TransferStatus::Queued,
                    bytes_total: 0,
                    bytes_transferred: 0,
                    speed_bps: 0.0,
                    skipped_count: 0,
                };
                cancel_tokens.entry(fresh.id.clone()).or_default();
                emit_progress(app, &fresh);
                queue.push_back(fresh);
            }
        }
        Err(join_err) => {
            // The task panicked — the `TransferJob` was moved into it and is
            // lost along with it, so there's no per-job UI state to reconcile
            // here. Every realistic SFTP failure mode already returns a
            // `Result` through the path above; a panic indicates a bug worth
            // surfacing loudly rather than a transfer outcome to handle.
            log::error!("[sftp] worker task panicked: {join_err}");
        }
    }
}

fn emit_progress(app: &tauri::AppHandle, job: &TransferJob) {
    use tauri::Emitter;
    let _ = app.emit("transfer_progress", job);
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// Emits a timestamped step for a transfer's per-job log (shown in the
/// transfer manager popup). Mirrors the existing `log::debug!` call sites at
/// the same granularity, just also surfaced to the frontend.
fn emit_step(app: &tauri::AppHandle, job_id: &str, message: impl Into<String>) {
    use tauri::Emitter;
    let _ = app.emit(
        "transfer_step",
        TransferStepPayload { job_id: job_id.to_string(), ts: now_ms(), message: message.into() },
    );
}

async fn process_job(
    job: &mut TransferJob,
    ssh_state: &SshState,
    app: &tauri::AppHandle,
    conflicts: &ConflictMap,
    cancel_token: &CancellationToken,
    settings: &TransferSettings,
) -> Result<(), String> {
    log::info!(
        "[sftp] starting {:?} | id={} tab={} src={} dest={}",
        job.direction, job.id, job.session_id, job.src_path, job.dest_path
    );
    emit_step(app, &job.id, format!("Transfer started: {} → {}", job.src_path, job.dest_path));
    let result = match job.direction {
        TransferDirection::Download => download_file(job, ssh_state, app, conflicts, cancel_token, settings).await,
        TransferDirection::Upload => upload_file(job, ssh_state, app, conflicts, cancel_token, settings).await,
    };
    match &result {
        Ok(()) => {
            log::info!("[sftp] completed id={}", job.id);
            emit_step(app, &job.id, "Transfer completed successfully");
        }
        Err(e) => {
            log::error!("[sftp] failed id={} tab={} src={} dest={} — {}", job.id, job.session_id, job.src_path, job.dest_path, e);
            emit_step(app, &job.id, format!("Transfer failed: {e}"));
        }
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

/// One entry discovered while recursively walking a directory tree for a
/// folder transfer — a relative path (forward-slash joined, relative to the
/// tree's root) plus whether it's itself a directory, and its size (0 for
/// directories). Parent directories always precede their children in the
/// `Vec` returned by `walk_local_tree`/`walk_remote_tree` (a stack-based walk
/// records an entry the moment it's discovered, before ever expanding it), so
/// callers can create directories/files in list order without extra sorting.
struct TreeEntry {
    rel_path: String,
    is_dir: bool,
    size: u64,
}

/// Recursively walks a local directory (used for folder uploads). Iterative
/// (stack-based) rather than a recursive async fn, since Rust async fns
/// can't recurse into themselves without boxing every call.
async fn walk_local_tree(root: &std::path::Path) -> Result<Vec<TreeEntry>, String> {
    let mut out = Vec::new();
    let mut stack: Vec<(String, std::path::PathBuf)> = vec![(String::new(), root.to_path_buf())];
    while let Some((rel_prefix, abs_path)) = stack.pop() {
        let mut rd = tokio::fs::read_dir(&abs_path)
            .await
            .map_err(|e| format!("read_dir({}) failed: {e}", abs_path.display()))?;
        while let Some(entry) = rd.next_entry().await.map_err(|e| e.to_string())? {
            let name = entry.file_name().to_string_lossy().to_string();
            let rel = if rel_prefix.is_empty() { name.clone() } else { format!("{rel_prefix}/{name}") };
            let file_type = entry.file_type().await.map_err(|e| e.to_string())?;
            if file_type.is_dir() {
                out.push(TreeEntry { rel_path: rel.clone(), is_dir: true, size: 0 });
                stack.push((rel, entry.path()));
            } else {
                let meta = entry.metadata().await.map_err(|e| e.to_string())?;
                out.push(TreeEntry { rel_path: rel, is_dir: false, size: meta.len() });
            }
        }
    }
    Ok(out)
}

/// Recursively walks a remote directory over SFTP (used for folder
/// downloads). Symlinks are recorded as their raw entry type (not followed)
/// to keep this simple and loop-safe — unlike `list_dir_entries` in
/// `ssh/sftp.rs`, which resolves symlink targets for the browser UI, this
/// only needs to know what to actually copy.
async fn walk_remote_tree(
    sftp: &russh_sftp::client::SftpSession,
    root: &str,
) -> Result<Vec<TreeEntry>, String> {
    let mut out = Vec::new();
    let mut stack: Vec<(String, String)> = vec![(String::new(), root.trim_end_matches('/').to_string())];
    while let Some((rel_prefix, abs_path)) = stack.pop() {
        let entries = sftp
            .read_dir(&abs_path)
            .await
            .map_err(|e| format!("readdir({abs_path}) failed: {e}"))?;
        for entry in entries {
            let name = entry.file_name();
            let full_path = entry.path();
            let mut metadata = entry.metadata();
            // `read_dir`'s per-entry metadata is lstat-based, so a symlink
            // pointing at a directory reports `is_dir() == false` here. Follow
            // it with a real `stat()` to resolve the actual target type,
            // otherwise a symlinked subdirectory silently gets skipped/mis-typed
            // during a recursive download instead of being descended into.
            if metadata.is_symlink() {
                if let Ok(resolved) = sftp.metadata(full_path.clone()).await {
                    metadata = resolved;
                }
            }
            let rel = if rel_prefix.is_empty() { name.clone() } else { format!("{rel_prefix}/{name}") };
            if metadata.is_dir() {
                out.push(TreeEntry { rel_path: rel.clone(), is_dir: true, size: 0 });
                stack.push((rel, full_path));
            } else {
                out.push(TreeEntry { rel_path: rel, is_dir: false, size: metadata.size.unwrap_or(0) });
            }
        }
    }
    Ok(out)
}

async fn download_file(
    job: &mut TransferJob,
    ssh_state: &SshState,
    app: &tauri::AppHandle,
    conflicts: &ConflictMap,
    cancel_token: &CancellationToken,
    settings: &TransferSettings,
) -> Result<(), String> {
    job.src_path = expand_home(&job.src_path);
    job.dest_path = expand_home(&job.dest_path);

    log::debug!("[sftp/download] looking up SFTP session for session_id={}", job.session_id);
    let (session, sftp) = get_session_and_sftp(ssh_state, &job.session_id)?;
    emit_step(app, &job.id, "SFTP session ready");

    log::debug!("[sftp/download] stat remote path: {}", job.src_path);
    let meta = sftp
        .metadata(job.src_path.clone())
        .await
        .map_err(|e| format!("stat({}) failed: {e}", job.src_path))?;

    // A directory source needs a recursive walk + per-file copy instead of
    // the single open/read/write loop below — dispatch early, before ever
    // touching the local filesystem. Without this check, a directory handle
    // would get opened below and fail on the first `read()` (SFTP servers
    // reject reading a directory handle with SSH_FX_FAILURE), but only
    // *after* the atomic-create step further down had already left a stray
    // empty file behind.
    if meta.is_dir() {
        return download_directory(job, &sftp, app, conflicts, cancel_token, settings).await;
    }

    let file_size = meta.size.unwrap_or(0);
    log::debug!("[sftp/download] remote file size={} bytes", file_size);
    emit_step(app, &job.id, format!("Opened remote file ({} bytes)", file_size));

    // Atomic local-filesystem create — closes the TOCTOU window between the
    // old `dest.exists()` check and the later unconditional `File::create`,
    // where a file created concurrently in between would be silently
    // overwritten. `create_new` is atomic on macOS/Windows/Linux alike.
    log::debug!("[sftp/download] attempting atomic local create: {}", job.dest_path);
    emit_step(app, &job.id, format!("Creating local file: {}", job.dest_path));
    let mut local_file = match tokio::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&job.dest_path)
        .await
    {
        Ok(f) => f,
        Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => {
            log::debug!("[sftp/download] conflict detected, waiting for resolution");
            emit_step(app, &job.id, "Destination already exists — waiting for conflict resolution");
            let resolution = tokio::select! {
                _ = cancel_token.cancelled() => {
                    conflicts.lock().await.remove(&job.id);
                    return Err("cancelled".to_string());
                }
                r = ask_conflict(job, app, conflicts, settings) => r?,
            };
            emit_step(app, &job.id, format!("Conflict resolved: {}", resolution.resolution));
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

    log::debug!("[sftp/download] opening remote file: {}", job.src_path);
    let mut remote_file = sftp
        .open(job.src_path.clone())
        .await
        .map_err(|e| format!("open({}) failed: {e}", job.src_path))?;
    job.bytes_total = file_size;

    let mut written = 0usize;
    let mut last_emit = std::time::Instant::now();
    let mut last_bytes = 0u64;
    // Read once per job (not per chunk) — avoids a redundant atomic load every
    // iteration and a resized buffer mid-transfer if the setting changes
    // while this job is running.
    let chunk_size = settings.chunk_size.load(std::sync::atomic::Ordering::Relaxed).max(4096);
    let mut chunk_buf = vec![0u8; chunk_size];

    // Streams remote -> local in chunk_size pieces so a multi-GB download
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
    emit_step(app, &job.id, format!("Wrote {} bytes to local disk", written));

    // --- Post-transfer verification ---
    log::debug!("[sftp/download] verifying transfer id={}", job.id);
    emit_step(app, &job.id, "Verifying transfer (size check)");
    let local_size = tokio::fs::metadata(&job.dest_path)
        .await
        .map_err(|e| format!("verify metadata({}) failed: {e}", job.dest_path))?
        .len();
    if local_size != file_size {
        return Err(format!(
            "Transfer failed: Size mismatch (remote={file_size}, local={local_size})."
        ));
    }

    emit_step(app, &job.id, "Computing MD5 checksum");
    let local_hash = compute_local_md5_async(std::path::PathBuf::from(&job.dest_path), chunk_size).await?;
    match compute_remote_md5(&session, &job.src_path).await {
        Some(remote_hash) => {
            if local_hash != remote_hash {
                return Err(format!(
                    "Transfer failed: MD5 checksum mismatch (remote={remote_hash}, local={local_hash}). File is corrupted."
                ));
            }
            log::debug!("[sftp/download] md5 verified ok id={}", job.id);
            emit_step(app, &job.id, "MD5 checksum verified — match");
        }
        None => {
            log::warn!("[sftp/download] md5sum unavailable on remote, relying on size check id={}", job.id);
            emit_step(app, &job.id, "md5sum unavailable on remote — relying on size check only");
        }
    }

    Ok(())
}

/// Recursive remote → local folder download. Dispatched from `download_file`
/// once its `sftp.metadata` stat reveals the source is a directory. Unlike
/// single-file transfers, folder transfers only verify file size (not MD5)
/// per file — hashing every file over a fresh SSH exec channel would mean one
/// network round trip per file, which doesn't scale for folders with
/// hundreds/thousands of entries (e.g. a music library).
async fn download_directory(
    job: &mut TransferJob,
    sftp: &Arc<russh_sftp::client::SftpSession>,
    app: &tauri::AppHandle,
    conflicts: &ConflictMap,
    cancel_token: &CancellationToken,
    settings: &TransferSettings,
) -> Result<(), String> {
    emit_step(app, &job.id, format!("Scanning remote folder: {}", job.src_path));
    let entries = walk_remote_tree(sftp, &job.src_path).await?;
    let total_bytes: u64 = entries.iter().filter(|e| !e.is_dir).map(|e| e.size).sum();
    job.bytes_total = total_bytes;
    emit_step(app, &job.id, format!("Found {} entries ({} bytes)", entries.len(), total_bytes));

    // Ask about the destination root only once for the whole tree — nested
    // conflicts can only happen if the root already existed (see the "fresh
    // copy" branch below, where nested paths can't pre-exist because their
    // parent doesn't).
    let mut dest_root = job.dest_path.clone();
    if tokio::fs::metadata(&dest_root).await.is_ok() {
        emit_step(app, &job.id, "Destination already exists — waiting for conflict resolution");
        let resolution = tokio::select! {
            _ = cancel_token.cancelled() => {
                conflicts.lock().await.remove(&job.id);
                return Err("cancelled".to_string());
            }
            r = ask_conflict(job, app, conflicts, settings) => r?,
        };
        emit_step(app, &job.id, format!("Conflict resolved: {}", resolution.resolution));
        match resolution.resolution.as_str() {
            "skip" => { log::debug!("[sftp/download] folder skipped by user"); return Ok(()); }
            "rename" => {
                let new_name = resolution.new_name.ok_or("rename requires new_name")?;
                let dest = std::path::Path::new(&dest_root);
                let new_dest = dest.parent().unwrap_or(dest).join(new_name);
                dest_root = new_dest.to_string_lossy().to_string();
                job.dest_path = dest_root.clone();
                log::debug!("[sftp/download] renamed dest folder to: {}", dest_root);
            }
            _ => {
                // "overwrite" (or any other resolution) — merge into the
                // existing folder; conflicting nested files get truncated
                // below, non-conflicting ones are created normally.
            }
        }
    }

    tokio::fs::create_dir_all(&dest_root)
        .await
        .map_err(|e| format!("mkdir({dest_root}) failed: {e}"))?;

    let chunk_size = settings.chunk_size.load(std::sync::atomic::Ordering::Relaxed).max(4096);
    let mut chunk_buf = vec![0u8; chunk_size];
    let mut written_total = 0u64;
    let mut file_count = 0u64;
    let mut last_emit = std::time::Instant::now();
    let mut last_bytes = 0u64;
    let on_error_policy = settings.on_folder_file_error.lock().unwrap().clone();
    // Set for the rest of *this* transfer once the user picks "skip_all" from
    // the file_error dialog — doesn't touch the persisted setting, just
    // avoids re-prompting for every remaining file in this one folder.
    let mut skip_all_remaining = false;

    for entry in &entries {
        if cancel_token.is_cancelled() {
            return Err("cancelled".to_string());
        }

        let local_path = format!("{}/{}", dest_root.trim_end_matches('/'), entry.rel_path);
        let remote_path = format!("{}/{}", job.src_path.trim_end_matches('/'), entry.rel_path);

        if entry.is_dir {
            tokio::fs::create_dir_all(&local_path)
                .await
                .map_err(|e| format!("mkdir({local_path}) failed: {e}"))?;
            continue;
        }

        emit_step(app, &job.id, format!("Downloading {}", entry.rel_path));
        let result = download_one_file(
            sftp,
            &remote_path,
            &local_path,
            entry.size,
            job,
            &mut chunk_buf,
            &mut written_total,
            cancel_token,
            &mut last_emit,
            &mut last_bytes,
            app,
        )
        .await;

        if let Err(e) = result {
            if skip_all_remaining || on_error_policy == "skip" {
                log::warn!("[sftp/download] skipping failed file {}: {e}", entry.rel_path);
                emit_step(app, &job.id, format!("Skipped (error): {} — {e}", entry.rel_path));
                job.skipped_count += 1;
            } else if on_error_policy == "abort" {
                return Err(e);
            } else {
                emit_step(app, &job.id, format!("Error on {}: {e} — waiting for resolution", entry.rel_path));
                let resolution = tokio::select! {
                    _ = cancel_token.cancelled() => {
                        conflicts.lock().await.remove(&job.id);
                        return Err("cancelled".to_string());
                    }
                    r = ask_file_error(job, app, conflicts, &entry.rel_path, &e) => r?,
                };
                match resolution.resolution.as_str() {
                    "abort" => return Err(e),
                    other => {
                        if other == "skip_all" {
                            skip_all_remaining = true;
                        }
                        job.skipped_count += 1;
                        emit_step(app, &job.id, format!("Skipped (error): {} — {e}", entry.rel_path));
                    }
                }
            }
        } else {
            file_count += 1;
        }
    }

    emit_step(
        app,
        &job.id,
        format!(
            "Downloaded {file_count} file{} ({written_total} bytes){}",
            if file_count == 1 { "" } else { "s" },
            if job.skipped_count > 0 { format!(", {} skipped", job.skipped_count) } else { String::new() },
        ),
    );
    Ok(())
}

/// Streams one file remote → local, chunk by chunk, and verifies its size —
/// shared by `download_directory`'s per-entry loop. Progress fields on `job`
/// accumulate across the whole folder (`written_total`/`last_bytes` are
/// carried in by the caller), not reset per file, so the transfer's overall
/// progress bar reflects the whole tree rather than restarting per file.
#[allow(clippy::too_many_arguments)]
async fn download_one_file(
    sftp: &russh_sftp::client::SftpSession,
    remote_path: &str,
    local_path: &str,
    expected_size: u64,
    job: &mut TransferJob,
    chunk_buf: &mut [u8],
    written_total: &mut u64,
    cancel_token: &CancellationToken,
    last_emit: &mut std::time::Instant,
    last_bytes: &mut u64,
    app: &tauri::AppHandle,
) -> Result<(), String> {
    if let Some(parent) = std::path::Path::new(local_path).parent() {
        tokio::fs::create_dir_all(parent).await.map_err(|e| e.to_string())?;
    }
    let mut local_file = tokio::fs::OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(true)
        .open(local_path)
        .await
        .map_err(|e| format!("create({local_path}) failed: {e}"))?;
    let mut remote_file = sftp
        .open(remote_path)
        .await
        .map_err(|e| format!("open({remote_path}) failed: {e}"))?;

    loop {
        let n = tokio::select! {
            _ = cancel_token.cancelled() => return Err("cancelled".to_string()),
            result = remote_file.read(chunk_buf) => {
                result.map_err(|e| format!("read({remote_path}) failed: {e}"))?
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
        *written_total += n as u64;
        job.bytes_transferred = *written_total;

        let elapsed = last_emit.elapsed().as_millis();
        if elapsed >= PROGRESS_EMIT_INTERVAL_MS {
            let bytes_delta = job.bytes_transferred - *last_bytes;
            job.speed_bps = bytes_delta as f64 / (elapsed as f64 / 1000.0);
            *last_bytes = job.bytes_transferred;
            *last_emit = std::time::Instant::now();
            emit_progress(app, job);
        }
    }
    drop(local_file);

    let local_size = tokio::fs::metadata(local_path)
        .await
        .map_err(|e| format!("verify metadata({local_path}) failed: {e}"))?
        .len();
    if local_size != expected_size {
        return Err(format!("Size mismatch (remote={expected_size}, local={local_size})"));
    }
    Ok(())
}

async fn upload_file(
    job: &mut TransferJob,
    ssh_state: &SshState,
    app: &tauri::AppHandle,
    conflicts: &ConflictMap,
    cancel_token: &CancellationToken,
    settings: &TransferSettings,
) -> Result<(), String> {
    job.src_path = expand_home(&job.src_path);
    job.dest_path = expand_home(&job.dest_path);

    log::debug!("[sftp/upload] opening local file: {}", job.src_path);
    let mut local_file = tokio::fs::File::open(&job.src_path)
        .await
        .map_err(|e| format!("read local file({}) failed: {e}", job.src_path))?;
    let local_meta = local_file
        .metadata()
        .await
        .map_err(|e| format!("metadata local file({}) failed: {e}", job.src_path))?;
    if local_meta.is_dir() {
        drop(local_file);
        let (_session, sftp) = get_session_and_sftp(ssh_state, &job.session_id)?;
        emit_step(app, &job.id, "SFTP session ready");
        return upload_directory(job, &sftp, app, conflicts, cancel_token, settings).await;
    }
    let file_size = local_meta.len();
    job.bytes_total = file_size;
    log::debug!("[sftp/upload] local file size={} bytes", file_size);
    emit_step(app, &job.id, format!("Opened local file ({} bytes)", file_size));

    log::debug!("[sftp/upload] looking up SFTP session for session_id={}", job.session_id);
    let (session, sftp) = get_session_and_sftp(ssh_state, &job.session_id)?;
    emit_step(app, &job.id, "SFTP session ready");

    // Single atomic exclusive-create attempt — no prior `stat()` check —
    // closes the stat-then-create TOCTOU window the old code had. Any
    // failure here is treated as "destination already exists", matching the
    // same ambiguity `ssh/sftp.rs`'s `sftp_create_file` already accepts for
    // this exact ATOMIC CREATE|EXCLUDE mechanism.
    log::debug!("[sftp/upload] attempting atomic remote create: {}", job.dest_path);
    emit_step(app, &job.id, format!("Creating remote file: {}", job.dest_path));
    let mut remote_file = match sftp
        .open_with_flags(job.dest_path.clone(), OpenFlags::CREATE | OpenFlags::EXCLUDE | OpenFlags::WRITE)
        .await
    {
        Ok(f) => f,
        Err(_) => {
            log::debug!("[sftp/upload] conflict at dest: {}", job.dest_path);
            emit_step(app, &job.id, "Destination already exists — waiting for conflict resolution");
            let resolution = tokio::select! {
                _ = cancel_token.cancelled() => {
                    conflicts.lock().await.remove(&job.id);
                    return Err("cancelled".to_string());
                }
                r = ask_conflict(job, app, conflicts, settings) => r?,
            };
            emit_step(app, &job.id, format!("Conflict resolved: {}", resolution.resolution));
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
    let chunk_size = settings.chunk_size.load(std::sync::atomic::Ordering::Relaxed).max(4096);
    let mut chunk_buf = vec![0u8; chunk_size];

    // Streams local -> remote in chunk_size pieces instead of loading the
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
    emit_step(app, &job.id, format!("Wrote {} bytes to remote", written));

    // --- Post-transfer verification ---
    log::debug!("[sftp/upload] verifying transfer id={}", job.id);
    emit_step(app, &job.id, "Verifying transfer (size check)");
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

    emit_step(app, &job.id, "Computing MD5 checksum");
    let local_hash = compute_local_md5_async(std::path::PathBuf::from(&job.src_path), chunk_size).await?;
    match compute_remote_md5(&session, &job.dest_path).await {
        Some(remote_hash) => {
            if local_hash != remote_hash {
                return Err(format!(
                    "Transfer failed: MD5 checksum mismatch (local={local_hash}, remote={remote_hash}). File is corrupted."
                ));
            }
            log::debug!("[sftp/upload] md5 verified ok id={}", job.id);
            emit_step(app, &job.id, "MD5 checksum verified — match");
        }
        None => {
            log::warn!("[sftp/upload] md5sum unavailable on remote, relying on size check id={}", job.id);
            emit_step(app, &job.id, "md5sum unavailable on remote — relying on size check only");
        }
    }

    Ok(())
}

/// Recursive local → remote folder upload. Dispatched from `upload_file` once
/// its local `metadata()` reveals the source is a directory. Mirrors
/// `download_directory` (size-only per-file verification, one conflict
/// prompt for the whole tree, optional skip-on-error).
async fn upload_directory(
    job: &mut TransferJob,
    sftp: &Arc<russh_sftp::client::SftpSession>,
    app: &tauri::AppHandle,
    conflicts: &ConflictMap,
    cancel_token: &CancellationToken,
    settings: &TransferSettings,
) -> Result<(), String> {
    emit_step(app, &job.id, format!("Scanning local folder: {}", job.src_path));
    let root_path = std::path::PathBuf::from(&job.src_path);
    let entries = walk_local_tree(&root_path).await?;
    let total_bytes: u64 = entries.iter().filter(|e| !e.is_dir).map(|e| e.size).sum();
    job.bytes_total = total_bytes;
    emit_step(app, &job.id, format!("Found {} entries ({} bytes)", entries.len(), total_bytes));

    // Ask about the destination root only once for the whole tree — nested
    // conflicts can only happen if the root already existed (see the "fresh
    // copy" branch below, where nested paths can't pre-exist because their
    // parent doesn't).
    let mut dest_root = job.dest_path.clone();
    if sftp.metadata(dest_root.clone()).await.is_ok() {
        emit_step(app, &job.id, "Destination already exists — waiting for conflict resolution");
        let resolution = tokio::select! {
            _ = cancel_token.cancelled() => {
                conflicts.lock().await.remove(&job.id);
                return Err("cancelled".to_string());
            }
            r = ask_conflict(job, app, conflicts, settings) => r?,
        };
        emit_step(app, &job.id, format!("Conflict resolved: {}", resolution.resolution));
        match resolution.resolution.as_str() {
            "skip" => { log::debug!("[sftp/upload] folder skipped by user"); return Ok(()); }
            "rename" => {
                let new_name = resolution.new_name.ok_or("rename requires new_name")?;
                let dest = std::path::Path::new(&dest_root);
                let new_dest = dest.parent().unwrap_or(dest).join(new_name);
                dest_root = new_dest.to_string_lossy().to_string();
                job.dest_path = dest_root.clone();
                log::debug!("[sftp/upload] renamed dest folder to: {}", dest_root);
            }
            _ => {
                // "overwrite" (or any other resolution) — merge into the
                // existing folder; conflicting nested files get truncated
                // below, non-conflicting ones are created normally.
            }
        }
    }

    // Tolerate the root already existing (the "overwrite" merge case above).
    let _ = sftp.create_dir(dest_root.clone()).await;

    let chunk_size = settings.chunk_size.load(std::sync::atomic::Ordering::Relaxed).max(4096);
    let mut chunk_buf = vec![0u8; chunk_size];
    let mut written_total = 0u64;
    let mut file_count = 0u64;
    let mut last_emit = std::time::Instant::now();
    let mut last_bytes = 0u64;
    let on_error_policy = settings.on_folder_file_error.lock().unwrap().clone();
    // Set for the rest of *this* transfer once the user picks "skip_all" from
    // the file_error dialog — doesn't touch the persisted setting, just
    // avoids re-prompting for every remaining file in this one folder.
    let mut skip_all_remaining = false;

    for entry in &entries {
        if cancel_token.is_cancelled() {
            return Err("cancelled".to_string());
        }

        let local_path = format!("{}/{}", job.src_path.trim_end_matches('/'), entry.rel_path);
        let remote_path = format!("{}/{}", dest_root.trim_end_matches('/'), entry.rel_path);

        if entry.is_dir {
            if let Err(e) = sftp.create_dir(remote_path.clone()).await {
                if sftp.metadata(remote_path.clone()).await.is_err() {
                    return Err(format!("mkdir({remote_path}) failed: {e}"));
                }
            }
            continue;
        }

        emit_step(app, &job.id, format!("Uploading {}", entry.rel_path));
        let result = upload_one_file(
            sftp,
            &local_path,
            &remote_path,
            entry.size,
            job,
            &mut chunk_buf,
            &mut written_total,
            cancel_token,
            &mut last_emit,
            &mut last_bytes,
            app,
        )
        .await;

        if let Err(e) = result {
            if skip_all_remaining || on_error_policy == "skip" {
                log::warn!("[sftp/upload] skipping failed file {}: {e}", entry.rel_path);
                emit_step(app, &job.id, format!("Skipped (error): {} — {e}", entry.rel_path));
                job.skipped_count += 1;
            } else if on_error_policy == "abort" {
                return Err(e);
            } else {
                emit_step(app, &job.id, format!("Error on {}: {e} — waiting for resolution", entry.rel_path));
                let resolution = tokio::select! {
                    _ = cancel_token.cancelled() => {
                        conflicts.lock().await.remove(&job.id);
                        return Err("cancelled".to_string());
                    }
                    r = ask_file_error(job, app, conflicts, &entry.rel_path, &e) => r?,
                };
                match resolution.resolution.as_str() {
                    "abort" => return Err(e),
                    other => {
                        if other == "skip_all" {
                            skip_all_remaining = true;
                        }
                        job.skipped_count += 1;
                        emit_step(app, &job.id, format!("Skipped (error): {} — {e}", entry.rel_path));
                    }
                }
            }
        } else {
            file_count += 1;
        }
    }

    emit_step(
        app,
        &job.id,
        format!(
            "Uploaded {file_count} file{} ({written_total} bytes){}",
            if file_count == 1 { "" } else { "s" },
            if job.skipped_count > 0 { format!(", {} skipped", job.skipped_count) } else { String::new() },
        ),
    );
    Ok(())
}

/// Streams one file local → remote, chunk by chunk, and verifies its size —
/// shared by `upload_directory`'s per-entry loop. Progress fields on `job`
/// accumulate across the whole folder, not reset per file, matching
/// `download_one_file`'s approach.
#[allow(clippy::too_many_arguments)]
async fn upload_one_file(
    sftp: &russh_sftp::client::SftpSession,
    local_path: &str,
    remote_path: &str,
    expected_size: u64,
    job: &mut TransferJob,
    chunk_buf: &mut [u8],
    written_total: &mut u64,
    cancel_token: &CancellationToken,
    last_emit: &mut std::time::Instant,
    last_bytes: &mut u64,
    app: &tauri::AppHandle,
) -> Result<(), String> {
    let mut local_file = tokio::fs::File::open(local_path)
        .await
        .map_err(|e| format!("read local file({local_path}) failed: {e}"))?;
    let mut remote_file = sftp
        .open_with_flags(remote_path, OpenFlags::CREATE | OpenFlags::TRUNCATE | OpenFlags::WRITE)
        .await
        .map_err(|e| format!("create remote({remote_path}) failed: {e}"))?;

    loop {
        let n = tokio::select! {
            _ = cancel_token.cancelled() => return Err("cancelled".to_string()),
            result = local_file.read(chunk_buf) => {
                result.map_err(|e| format!("read local file({local_path}) failed: {e}"))?
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
        *written_total += n as u64;
        job.bytes_transferred = *written_total;

        let elapsed = last_emit.elapsed().as_millis();
        if elapsed >= PROGRESS_EMIT_INTERVAL_MS {
            let bytes_delta = job.bytes_transferred - *last_bytes;
            job.speed_bps = bytes_delta as f64 / (elapsed as f64 / 1000.0);
            *last_bytes = job.bytes_transferred;
            *last_emit = std::time::Instant::now();
            emit_progress(app, job);
        }
    }
    remote_file.shutdown().await.map_err(|e| e.to_string())?;

    let remote_size = sftp
        .metadata(remote_path)
        .await
        .map_err(|e| format!("verify stat({remote_path}) failed: {e}"))?
        .size
        .unwrap_or(0);
    if remote_size != expected_size {
        return Err(format!("Size mismatch (local={expected_size}, remote={remote_size})"));
    }
    Ok(())
}

async fn ask_conflict(
    job: &TransferJob,
    app: &tauri::AppHandle,
    conflicts: &ConflictMap,
    settings: &TransferSettings,
) -> Result<ConflictResolution, String> {
    // A configured default policy short-circuits the prompt entirely — no
    // "rename" here, since that requires a new_name nothing here can
    // synthesize; the definitions.ts Select only ever offers ask/overwrite/skip.
    let policy = settings.default_conflict_resolution.lock().unwrap().clone();
    if policy == "overwrite" || policy == "skip" {
        return Ok(ConflictResolution { resolution: policy, new_name: None });
    }

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

/// Prompts the frontend about a single file that failed during a folder
/// transfer, via the `file_error` event — parallel to `ask_conflict`'s
/// `file_conflict` event, and resolved through the same `resolve_conflict`
/// command/channel (the resolution vocabulary is just different: "abort" |
/// "skip" | "skip_all" instead of "overwrite" | "skip" | "rename"). Only
/// called when `TransferSettings::on_folder_file_error` is "ask" — "skip"/
/// "abort" are handled inline by the caller without ever reaching here.
async fn ask_file_error(
    job: &TransferJob,
    app: &tauri::AppHandle,
    conflicts: &ConflictMap,
    rel_path: &str,
    error: &str,
) -> Result<ConflictResolution, String> {
    use tauri::Emitter;
    let (tx, rx) = tokio::sync::oneshot::channel::<ConflictResolution>();
    {
        let mut map = conflicts.lock().await;
        map.insert(job.id.clone(), tx);
    }
    app.emit("file_error", serde_json::json!({
        "job_id": job.id,
        "path": rel_path,
        "error": error,
    })).map_err(|e| e.to_string())?;

    rx.await.map_err(|_| "file error resolution channel closed".to_string())
}
