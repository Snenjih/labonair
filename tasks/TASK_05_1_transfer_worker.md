# Task 05.1 — Background Transfer Worker (Rust)
**Phase:** 5 — Global Transfer Manager
**Status:** completed
**Priority:** High
**Dependencies:** TASK_04_2

## Background & Context
File transfers (upload/download between local and remote) are long-running operations that must not block the UI thread. This task implements a Tokio background worker that processes a queue of transfer jobs. Each job emits `transfer_progress` events to the frontend as it runs. File conflicts are surfaced via `file_conflict` events, and the worker pauses on the job until the frontend responds with `resolve_conflict`. Jobs can be cancelled at any point.

## Work Instructions

### 1. Create `src-tauri/src/modules/sftp/` Directory
Create the directory `src-tauri/src/modules/sftp/`. This is a separate module from `src-tauri/src/modules/ssh/sftp.rs` (which handles per-session SFTP commands). This module manages the global transfer queue.

### 2. Define Types in `src-tauri/src/modules/sftp/mod.rs`
```rust
pub mod worker;
pub mod commands;

use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{Mutex, mpsc, oneshot};

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum TransferDirection {
    Upload,
    Download,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum TransferStatus {
    Queued,
    Running,
    Paused,       // waiting for conflict resolution
    Cancelled,
    Completed,
    Failed(String),
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct TransferJob {
    pub id: String,           // UUID v4
    pub host_id: String,
    pub src_path: String,
    pub dest_path: String,
    pub direction: TransferDirection,
    pub status: TransferStatus,
    pub bytes_total: u64,
    pub bytes_transferred: u64,
    pub speed_bps: f64,       // bytes per second, updated periodically
}

/// Messages sent from commands into the worker loop
pub enum WorkerMessage {
    Enqueue(TransferJob),
    Cancel(String),           // job_id
    ResolveConflict {
        job_id: String,
        resolution: String,   // "overwrite" | "skip" | "rename"
        new_name: Option<String>,
    },
}

/// Conflict resolution response channel, keyed by job_id
pub type ConflictMap = Arc<Mutex<HashMap<String, oneshot::Sender<ConflictResolution>>>>;

#[derive(Debug)]
pub struct ConflictResolution {
    pub resolution: String,
    pub new_name: Option<String>,
}

/// State managed by Tauri — holds the channel into the worker loop + conflict map
pub struct TransferWorkerState {
    pub sender: mpsc::Sender<WorkerMessage>,
    pub conflicts: ConflictMap,
}
```

### 3. Implement `src-tauri/src/modules/sftp/worker.rs`
This file contains `pub async fn run_worker(...)`.

```rust
use super::*;
use std::io::{Read, Write};

const CHUNK_SIZE: usize = 65536; // 64 KB
const PROGRESS_EMIT_INTERVAL_MS: u64 = 100;

pub async fn run_worker(
    mut rx: mpsc::Receiver<WorkerMessage>,
    ssh_state: Arc<crate::modules::ssh::SshState>,
    app: tauri::AppHandle,
    conflicts: ConflictMap,
) {
    let mut queue: std::collections::VecDeque<TransferJob> = std::collections::VecDeque::new();
    let mut cancelled: std::collections::HashSet<String> = std::collections::HashSet::new();

    loop {
        // Try to receive new messages without blocking if queue is not empty
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
                    // Look up the oneshot sender and send resolution
                    let map = conflicts.lock().await;
                    // handled in process_job via oneshot
                    drop(map);
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
                    if cancelled.contains(&job.id) {
                        job.status = TransferStatus::Cancelled;
                    } else {
                        job.status = TransferStatus::Failed(e);
                    }
                    emit_progress(&app, &job);
                }
            }
        } else {
            // Queue empty — wait for a new message
            match rx.recv().await {
                Some(WorkerMessage::Enqueue(job)) => {
                    emit_progress(&app, &job);
                    queue.push_back(job);
                }
                Some(WorkerMessage::Cancel(id)) => { cancelled.insert(id); }
                Some(WorkerMessage::ResolveConflict { .. }) => { /* handled via oneshot */ }
                None => return, // channel closed
            }
        }
    }
}

fn emit_progress(app: &tauri::AppHandle, job: &TransferJob) {
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
        TransferDirection::Download => {
            // Remote → Local
            download_file(job, ssh_state, app, conflicts, cancelled).await
        }
        TransferDirection::Upload => {
            // Local → Remote
            upload_file(job, ssh_state, app, conflicts, cancelled).await
        }
    }
}

async fn download_file(
    job: &mut TransferJob,
    ssh_state: &Arc<crate::modules::ssh::SshState>,
    app: &tauri::AppHandle,
    conflicts: &ConflictMap,
    cancelled: &std::collections::HashSet<String>,
) -> Result<(), String> {
    // Check for local conflict
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
            _ => {} // overwrite — proceed
        }
    }

    // Open SFTP read stream
    let (file_size, data) = {
        let map = ssh_state.0.lock().map_err(|e| e.to_string())?;
        let sess = map.get(&job.host_id).ok_or("no session")?;
        let sftp = sess.session.sftp().map_err(|e| e.to_string())?;
        let mut remote_file = sftp.open(std::path::Path::new(&job.src_path))
            .map_err(|e| e.to_string())?;
        let stat = sftp.stat(std::path::Path::new(&job.src_path))
            .map_err(|e| e.to_string())?;
        let size = stat.size.unwrap_or(0);
        let mut buf = Vec::with_capacity(size as usize);
        remote_file.read_to_end(&mut buf).map_err(|e| e.to_string())?;
        (size, buf)
    };

    job.bytes_total = file_size;

    // Write locally in chunks, emitting progress
    let mut local_file = std::fs::File::create(&job.dest_path)
        .map_err(|e| e.to_string())?;
    let mut written = 0usize;
    let mut last_emit = std::time::Instant::now();

    for chunk in data.chunks(CHUNK_SIZE) {
        if cancelled.contains(&job.id) {
            return Err("cancelled".to_string());
        }
        local_file.write_all(chunk).map_err(|e| e.to_string())?;
        written += chunk.len();
        job.bytes_transferred = written as u64;

        if last_emit.elapsed().as_millis() >= PROGRESS_EMIT_INTERVAL_MS as u128 {
            emit_progress(app, job);
            last_emit = std::time::Instant::now();
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
    // Read local file first
    let data = std::fs::read(&job.src_path).map_err(|e| e.to_string())?;
    job.bytes_total = data.len() as u64;

    // Check remote conflict by attempting stat
    let conflict_exists = {
        let map = ssh_state.0.lock().map_err(|e| e.to_string())?;
        let sess = map.get(&job.host_id).ok_or("no session")?;
        let sftp = sess.session.sftp().map_err(|e| e.to_string())?;
        sftp.stat(std::path::Path::new(&job.dest_path)).is_ok()
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
            _ => {} // overwrite
        }
    }

    // Upload in chunks
    let mut last_emit = std::time::Instant::now();
    let map = ssh_state.0.lock().map_err(|e| e.to_string())?;
    let sess = map.get(&job.host_id).ok_or("no session")?;
    let sftp = sess.session.sftp().map_err(|e| e.to_string())?;
    let mut remote_file = sftp.create(std::path::Path::new(&job.dest_path))
        .map_err(|e| e.to_string())?;

    for (i, chunk) in data.chunks(CHUNK_SIZE).enumerate() {
        if cancelled.contains(&job.id) {
            return Err("cancelled".to_string());
        }
        remote_file.write_all(chunk).map_err(|e| e.to_string())?;
        job.bytes_transferred = (i + 1) as u64 * CHUNK_SIZE as u64;
        job.bytes_transferred = job.bytes_transferred.min(job.bytes_total);

        if last_emit.elapsed().as_millis() >= PROGRESS_EMIT_INTERVAL_MS as u128 {
            emit_progress(app, job);
            last_emit = std::time::Instant::now();
        }
    }
    Ok(())
}

async fn ask_conflict(
    job: &TransferJob,
    app: &tauri::AppHandle,
    conflicts: &ConflictMap,
) -> Result<ConflictResolution, String> {
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
```

### 4. Implement `src-tauri/src/modules/sftp/commands.rs`
```rust
use super::*;

#[tauri::command]
pub async fn enqueue_transfer(
    host_id: String,
    src_path: String,
    dest_path: String,
    direction: String, // "upload" | "download"
    worker: tauri::State<'_, TransferWorkerState>,
) -> Result<String, String> {
    let id = uuid::Uuid::new_v4().to_string();
    let job = TransferJob {
        id: id.clone(),
        host_id,
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
```

### 5. Register in `src-tauri/src/modules/mod.rs`
Add:
```rust
pub mod sftp;
```

### 6. Wire into `src-tauri/src/lib.rs`
In the `.setup(|app| {...})` hook:
```rust
use crate::modules::sftp::{TransferWorkerState, worker::run_worker};

let (tx, rx) = tokio::sync::mpsc::channel(100);
let conflicts = std::sync::Arc::new(tokio::sync::Mutex::new(std::collections::HashMap::new()));
let conflicts_clone = conflicts.clone();

let ssh_state_arc = {
    // We need an Arc to SshState for the worker.
    // Since SshState is managed state, access it via app.state().
    // ALTERNATIVE: Wrap SshState in Arc<SshState> instead of plain SshState
    // and store the Arc both in managed state and pass a clone to the worker.
    // This is the recommended approach.
    std::sync::Arc::new(crate::modules::ssh::SshState::default())
};

app.manage(crate::modules::ssh::SshState(/* ... */));
// REVISED: Manage SshState as Arc so it can be cloned for the worker.
// Change SshState in mod.rs to:
//   pub struct SshState(pub Arc<std::sync::Mutex<HashMap<String, SshSession>>>);
// Then clone the Arc for the worker.
```

**NOTE**: To share `SshState` between the managed state AND the worker thread, refactor `SshState` to wrap `Arc<Mutex<...>>` instead of plain `Mutex`. Then:
```rust
// In ssh/mod.rs, change to:
pub struct SshState(pub std::sync::Arc<std::sync::Mutex<HashMap<String, SshSession>>>);
impl Default for SshState {
    fn default() -> Self { SshState(std::sync::Arc::new(std::sync::Mutex::new(HashMap::new()))) }
}
// Add Clone:
impl Clone for SshState { fn clone(&self) -> Self { SshState(self.0.clone()) } }

// In lib.rs setup:
let ssh_state = crate::modules::ssh::SshState::default();
let ssh_state_for_worker = ssh_state.clone(); // clone the Arc
app.manage(ssh_state);

let app_handle = app.handle().clone();
let conflicts_for_worker = conflicts.clone();
tokio::spawn(async move {
    run_worker(rx, ssh_state_for_worker, app_handle, conflicts_for_worker).await;
});

app.manage(TransferWorkerState { sender: tx, conflicts });
```

In `generate_handler![]`, add: `enqueue_transfer, cancel_transfer, resolve_conflict`.

## Files to Create
- `src-tauri/src/modules/sftp/mod.rs`
- `src-tauri/src/modules/sftp/worker.rs`
- `src-tauri/src/modules/sftp/commands.rs`

## Files to Modify
- `src-tauri/src/modules/mod.rs`
- `src-tauri/src/modules/ssh/mod.rs` (refactor SshState to use Arc, add Clone)
- `src-tauri/src/lib.rs`

## Expected Outcome
- `cargo check` passes.
- Calling `invoke("enqueue_transfer", { host_id, src_path, dest_path, direction: "download" })` returns a job UUID.
- `transfer_progress` events fire every ~100ms with updated `bytes_transferred`.
- Calling `invoke("cancel_transfer", { job_id })` stops the transfer.
- When a conflict is detected, `file_conflict` event fires and the transfer pauses until `resolve_conflict` is called.

## Additional Information
- **Verify:** Run `cargo check` before marking complete.
- The worker runs as a long-lived `tokio::spawn` task, not a thread. It is NOT linked to any particular SSH session.
- Speed calculation (`speed_bps`) can be derived by measuring time between progress emits: `bytes_since_last_emit / elapsed_secs`. Add this to the progress emission logic.
- The `host_id` field in `TransferJob` is used to look up the active `SshState` session. Ensure the SSH session is established before enqueueing transfers.
- The `upload_file` function holds the `SshState` mutex for the entire duration of the upload. For large files this is a long time. A future optimization is to open the SFTP session once per host and cache it, but that is out of scope for this task.
