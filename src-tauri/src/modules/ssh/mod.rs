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

pub struct SshSession {
    /// PTY session — set to non-blocking after shell channel opens.
    pub session: ssh2::Session,
    pub channel: Option<ssh2::Channel>,
    /// Pre-initialized SFTP handle in its own lock so SFTP commands can
    /// release the outer SshState mutex before blocking on network I/O.
    pub sftp: Option<Arc<Mutex<SftpHandle>>>,
    /// Set to true by ssh_disconnect so the reader thread exits cleanly.
    pub shutdown: Arc<AtomicBool>,
}

// ssh2::Session contains raw pointers but is guarded by the Mutex.
unsafe impl Send for SshSession {}
unsafe impl Sync for SshSession {}

/// Global map of tab_id → SshSession, cloneable so the reader thread can hold a reference.
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

/// Global map of tab_id → pending trust confirmation pair.
#[derive(Clone, Default)]
pub struct TrustState(pub Arc<Mutex<HashMap<String, TrustPair>>>);
