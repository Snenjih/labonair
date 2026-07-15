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
}

impl Default for TransferSettings {
    fn default() -> Self {
        Self {
            max_concurrent: AtomicUsize::new(2),
            chunk_size: AtomicUsize::new(65536),
            default_conflict_resolution: std::sync::Mutex::new("ask".to_string()),
        }
    }
}

pub struct TransferWorkerState {
    pub sender: mpsc::Sender<WorkerMessage>,
    pub conflicts: ConflictMap,
    pub settings: Arc<TransferSettings>,
}
