pub mod client;
pub mod exec;
pub mod pty;
pub mod sftp;

use std::collections::HashMap;
use std::sync::{Arc, Condvar, Mutex};
use std::sync::atomic::AtomicBool;

/// A separately-locked SFTP handle so SFTP commands don't hold the main
/// SshState mutex during blocking network I/O.
pub struct SftpHandle(pub ssh2::Sftp);
unsafe impl Send for SftpHandle {}
unsafe impl Sync for SftpHandle {}

/// A separately-locked session handle so exec-channel commands (du, chown,
/// find…) don't hold the outer SshState mutex during blocking network I/O.
/// ssh2::Session contains raw pointers but access is serialised by the Mutex.
pub struct SessionHandle(pub ssh2::Session);
unsafe impl Send for SessionHandle {}
unsafe impl Sync for SessionHandle {}

pub struct SshSession {
    /// Session behind its own Arc so exec-channel commands can clone the Arc,
    /// release the outer SshState lock, and then lock only the session.
    pub session: Arc<Mutex<SessionHandle>>,
    pub channel: Option<ssh2::Channel>,
    /// Pre-initialized SFTP handle in its own lock so SFTP commands can
    /// release the outer SshState mutex before blocking on network I/O.
    pub sftp: Option<Arc<Mutex<SftpHandle>>>,
    /// Set to true by ssh_disconnect so the reader thread exits cleanly.
    pub shutdown: Arc<AtomicBool>,
}

/// Clones the `Arc<Mutex<SessionHandle>>` from the SshState map and releases
/// the outer lock before returning — analogous to get_sftp_arc!.
#[macro_export]
macro_rules! get_session_arc {
    ($state_inner:expr, $session_id:expr) => {{
        let map = $state_inner.0.lock().map_err(|e| e.to_string())?;
        map.get($session_id)
            .ok_or_else(|| format!("no SSH session for tab {}", $session_id))?
            .session
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
