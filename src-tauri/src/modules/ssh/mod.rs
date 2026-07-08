pub mod client;
pub mod config_parser;
pub mod exec;
pub mod pty;
pub mod sftp;
pub(crate) mod shell;
pub(crate) mod shell_integration;
pub mod tunnels;

use std::collections::HashMap;
use std::sync::{Arc, Condvar, Mutex};
use std::sync::atomic::AtomicBool;

/// A separately-locked session handle used by `tunnels.rs`'s local-forward
/// tunnels for their own independent session — not the interactive PTY or
/// browsing sessions, which use the merged `SshSessionInner`/
/// `SftpSessionInner` below instead. ssh2::Session contains raw pointers but
/// access is serialised by the Mutex.
pub struct SessionHandle(pub ssh2::Session);
unsafe impl Send for SessionHandle {}
unsafe impl Sync for SessionHandle {}

/// Colocates the interactive PTY channel with its owning `ssh2::Session`
/// behind a single lock, so every operation that touches this session's
/// libssh2 transport — PTY reads/writes/resizes, keepalive, and one-shot
/// exec (history reload, snippets) — serializes through the same mutex.
/// libssh2 is not safe for concurrent multi-threaded access to one Session,
/// even across different Channels/subsystems of it; splitting the channel
/// and the session behind two independent locks (as this used to do) allows
/// a PTY read and a concurrent exec call to race on the same socket, which
/// surfaces as random "transport read/write" errors that kill the session.
pub struct SshSessionInner {
    pub session: ssh2::Session,
    pub channel: Option<ssh2::Channel>,
}
unsafe impl Send for SshSessionInner {}
unsafe impl Sync for SshSessionInner {}

pub struct SshSession {
    /// The ONE lock for everything above — see `SshSessionInner`'s doc comment.
    pub inner: Arc<Mutex<SshSessionInner>>,
    /// Set to true by ssh_disconnect so the reader thread exits cleanly.
    pub shutdown: Arc<AtomicBool>,
    /// Holds the bridge thread for jump-host tunnels. Dropped when the session is removed.
    pub _jump_bridge: Option<std::thread::JoinHandle<()>>,
}

/// Clones the `Arc<Mutex<SshSessionInner>>` from the SshState map and
/// releases the outer lock before returning — analogous to get_sftp_arc!.
#[macro_export]
macro_rules! get_session_arc {
    ($state_inner:expr, $session_id:expr) => {{
        let map = $state_inner.0.lock().map_err(|e| e.to_string())?;
        map.get($session_id)
            .ok_or_else(|| format!("no SSH session for tab {}", $session_id))?
            .inner
            .clone()
    }};
}

// ssh2::Session contains raw pointers but is guarded by the Mutex.
unsafe impl Send for SshSession {}
unsafe impl Sync for SshSession {}

/// Global map of session_id → SshSession, cloneable so the reader thread can hold a reference.
#[derive(Clone)]
pub struct SshState(pub Arc<Mutex<HashMap<String, SshSession>>>);

impl Default for SshState {
    fn default() -> Self {
        SshState(Arc::new(Mutex::new(HashMap::new())))
    }
}

/// Pending trust confirmation for a specific tab.
/// The condvar is signalled by `ssh_trust_host` once the user acts.
pub type TrustPair = Arc<(Mutex<Option<bool>>, Condvar)>;

/// Global map of session_id → pending trust confirmation pair.
#[derive(Clone, Default)]
pub struct TrustState(pub Arc<Mutex<HashMap<String, TrustPair>>>);
