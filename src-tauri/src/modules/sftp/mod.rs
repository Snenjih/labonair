pub mod commands;
pub mod connection;
pub(crate) mod net_error;
pub mod worker;

// `state.rs` (the old dedicated `SftpState`/`SftpSession`/`SftpSessionInner`
// types, backed by the previous synchronous SSH library) is deleted per the
// russh migration's session-model decision: SFTP sessions are now stored
// per-`session_id` in the unified `crate::modules::ssh::SshState` registry
// (see `connection.rs`, `ssh/sftp.rs`, `worker.rs`, `git/executor.rs`).

use std::collections::HashMap;
use std::sync::Arc;
use std::sync::atomic::AtomicUsize;
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
    Paused,
    Cancelled,
    Completed,
    Failed(String),
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct TransferJob {
    pub id: String,
    pub session_id: String,
    pub src_path: String,
    pub dest_path: String,
    pub direction: TransferDirection,
    pub status: TransferStatus,
    pub bytes_total: u64,
    pub bytes_transferred: u64,
    pub speed_bps: f64,
    /// Number of files skipped due to per-file errors during a folder
    /// transfer (see `TransferSettings::skip_failed_files_in_folders`).
    /// Always 0 for single-file transfers.
    #[serde(default)]
    pub skipped_count: u32,
}

/// A single timestamped step in a transfer's lifecycle (open, handshake,
/// chunk-loop completion, checksum verification, ...), emitted as the
/// `transfer_step` event so the frontend can show a per-transfer log.
#[derive(Debug, Clone, serde::Serialize)]
pub struct TransferStepPayload {
    pub job_id: String,
    pub ts: i64,
    pub message: String,
}

pub enum WorkerMessage {
    Enqueue(TransferJob),
    Cancel(String),
    #[allow(dead_code)]
    ResolveConflict {
        job_id: String,
        resolution: String,
        new_name: Option<String>,
    },
    /// Sent after a dual-pane SFTP tab reconnects (`sftp_disconnect` +
    /// `sftp_connect` under the same `session_id`). Any job already running
    /// against that session captured its `Arc<RushSession>`/`Arc<SftpSession>`
    /// once at job start (see `get_session_and_sftp`), so it keeps limping
    /// along against the now-dead connection instead of picking up the fresh
    /// one — this cancels those in-flight jobs and re-enqueues equivalent
    /// fresh jobs that will resolve the new session when they start. Queued
    /// (not-yet-started) jobs for the same session need no action: they
    /// resolve the session lazily at start time, so they already pick up
    /// whatever session is current by then.
    SessionReconnected(String),
}

pub type ConflictMap = Arc<Mutex<HashMap<String, oneshot::Sender<ConflictResolution>>>>;

#[derive(Debug)]
pub struct ConflictResolution {
    pub resolution: String,
    pub new_name: Option<String>,
}

/// Queue-wide transfer tuning knobs, pushed from the frontend Settings store
/// whenever `sftpMaxConcurrentTransfers`/`sftpChunkSizeKb`/
/// `sftpDefaultConflictResolution` change (see `sftp_update_transfer_settings`).
/// Unlike most preferences, these affect worker behavior rather than a single
/// command call, so they're held as shared state instead of being passed as
/// per-call arguments.
pub struct TransferSettings {
    pub max_concurrent: AtomicUsize,
    /// Chunk size in bytes for transfer read/write loops.
    pub chunk_size: AtomicUsize,
    /// One of "ask" | "overwrite" | "skip". "ask" preserves today's behavior
    /// of prompting the frontend via the `file_conflict` event.
    pub default_conflict_resolution: std::sync::Mutex<String>,
    /// One of "ask" | "skip" | "abort" — what to do when a folder transfer
    /// hits a per-file error. "ask" (default) prompts the frontend via the
    /// `file_error` event, same mechanism as `file_conflict`; "skip" silently
    /// skips the offending file and continues; "abort" fails the whole job
    /// immediately, matching a single-file transfer's behavior.
    pub on_folder_file_error: std::sync::Mutex<String>,
}

impl Default for TransferSettings {
    fn default() -> Self {
        Self {
            max_concurrent: AtomicUsize::new(2),
            chunk_size: AtomicUsize::new(65536),
            default_conflict_resolution: std::sync::Mutex::new("ask".to_string()),
            on_folder_file_error: std::sync::Mutex::new("ask".to_string()),
        }
    }
}

pub struct TransferWorkerState {
    pub sender: mpsc::Sender<WorkerMessage>,
    pub conflicts: ConflictMap,
    pub settings: Arc<TransferSettings>,
}
