pub mod client;
pub mod exec;
pub mod pty;
pub mod sftp;

use std::collections::HashMap;
use std::sync::{Arc, Condvar, Mutex};

pub struct SshSession {
    /// PTY session — set to non-blocking after shell channel opens.
    pub session: ssh2::Session,
    pub channel: Option<ssh2::Channel>,
    /// Pre-initialized SFTP handle opened immediately after auth on a dedicated
    /// connection. ssh2::Sftp holds its own Arc<SessionInner> so the underlying
    /// session stays alive even after Session is dropped.
    pub sftp: Option<ssh2::Sftp>,
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
