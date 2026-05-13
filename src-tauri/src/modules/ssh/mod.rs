pub mod client;
pub mod exec;
pub mod pty;
pub mod sftp;

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

pub struct SshSession {
    /// PTY session — set to non-blocking after shell channel opens.
    pub session: ssh2::Session,
    pub channel: Option<ssh2::Channel>,
    /// Dedicated blocking session used exclusively for SFTP operations.
    pub sftp_session: Option<ssh2::Session>,
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
