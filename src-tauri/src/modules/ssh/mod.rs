pub mod client;
pub mod config_parser;
pub mod exec;
pub mod pty;
pub mod sftp;
pub(crate) mod shell;
pub(crate) mod shell_integration;
pub mod tunnels;

use std::collections::HashMap;
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex};

/// Holds the interactive PTY channel's write half once `ssh/pty.rs`
/// (Workstream 3) opens the shell channel on a `RushSession`. The read half
/// is not stored here — it is moved into the dedicated reader task that owns
/// it exclusively, matching `russh::ChannelReadHalf`'s single-consumer model.
/// `ChannelWriteHalf`'s methods all take `&self`, so wrapping it in a plain
/// `Arc` (no lock) is sufficient for concurrent writes/resizes.
///
/// Placeholder shape: Workstream 3 may extend this (e.g. with the channel id
/// for logging) once `open_shell_channel` is rewritten against this model.
pub struct PtyChannelState {
    pub write_half: Arc<russh::ChannelWriteHalf<russh::client::Msg>>,
}

/// Unified per-`session_id` (tab) SSH session, replacing the old
/// synchronous-library-based `SshSessionInner`/`SftpSessionInner` split.
/// `russh`'s `client::Handle` is natively `Send + Sync` with every post-auth
/// method taking `&self` (verified against the vendored 0.62.2 source), so
/// unlike the old blocking-transport session, no external `Mutex` is needed
/// to serialize access — the PTY reader, one-shot exec calls, and the SFTP
/// subsystem can all use this session concurrently without racing on a
/// shared transport.
pub struct RushSession {
    pub handle: Arc<russh::client::Handle<client::ClientHandler>>,
    /// Slot for the interactive PTY channel's split write half — populated by
    /// `ssh/pty.rs` (Workstream 3). `None` until a shell channel is opened.
    pub pty: tokio::sync::Mutex<Option<PtyChannelState>>,
    /// Lazily-opened SFTP subsystem, wired up in Workstream 4.
    pub sftp: tokio::sync::OnceCell<Arc<russh_sftp::client::SftpSession>>,
    /// Set to true by ssh_disconnect so the reader task exits cleanly.
    pub shutdown: Arc<AtomicBool>,
    /// Written by `ClientHandler::disconnected()` with the real reason the
    /// transport went down (a server-sent disconnect message, or the
    /// underlying I/O error) — `russh::ChannelReadHalf::wait()` returning
    /// `None`/`Eof`/`Close` carries no error info by itself, so without this
    /// slot the PTY reader loop could only ever report a generic fallback
    /// string instead of the actual cause.
    pub disconnect_reason: Arc<Mutex<Option<String>>>,
}

/// Clones the `Arc<RushSession>` out of the `SshState` map and releases the
/// outer lock before returning, so callers never hold the map's
/// `std::sync::Mutex` across an `.await`.
#[macro_export]
macro_rules! get_session_arc {
    ($state_inner:expr, $session_id:expr) => {{
        let map = $state_inner.0.lock().map_err(|e| e.to_string())?;
        map.get($session_id)
            .ok_or_else(|| format!("no SSH session for tab {}", $session_id))?
            .clone()
    }};
}

/// Global map of session_id → SshSession. `RushSession` is stored behind an
/// `Arc` (rather than each of its fields being independently `Arc`'d) so
/// `get_session_arc!` hands back a single `Arc<RushSession>` with no double
/// indirection.
#[derive(Clone)]
pub struct SshState(pub Arc<Mutex<HashMap<String, Arc<RushSession>>>>);

impl Default for SshState {
    fn default() -> Self {
        SshState(Arc::new(Mutex::new(HashMap::new())))
    }
}

/// Global map of session_id → pending trust confirmation. `ssh_trust_host`
/// sends on the oneshot once the user accepts/rejects a host key; at most one
/// trust dialog is ever pending per session_id, so a oneshot (rather than the
/// old `Condvar`-guarded pair) is the natural fit for the now-async wait.
#[derive(Clone, Default)]
pub struct TrustState(pub Arc<Mutex<HashMap<String, tokio::sync::oneshot::Sender<bool>>>>);
