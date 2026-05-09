pub mod client;
pub mod pty;

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

pub struct SshSession {
    pub session: ssh2::Session,
    pub channel: Option<ssh2::Channel>,
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
