pub mod client;
pub mod pty; // implemented in Task 03.2

use std::collections::HashMap;
use std::sync::Mutex;

pub struct SshSession {
    pub session: ssh2::Session,
    pub channel: Option<ssh2::Channel>,
}

// ssh2::Session contains raw pointers but is guarded by the Mutex.
unsafe impl Send for SshSession {}
unsafe impl Sync for SshSession {}

pub struct SshState(pub Mutex<HashMap<String, SshSession>>);

impl Default for SshState {
    fn default() -> Self {
        SshState(Mutex::new(HashMap::new()))
    }
}
