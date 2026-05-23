use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use crate::modules::ssh::{SessionHandle, SftpHandle};

pub struct SftpSession {
    /// SSH session — used by exec-based commands (md5sum, du, find, chown).
    pub session: Arc<Mutex<SessionHandle>>,
    /// SFTP protocol handle — used for all SFTP file operations.
    pub sftp: Arc<Mutex<SftpHandle>>,
}

#[derive(Clone, Default)]
pub struct SftpState(pub Arc<Mutex<HashMap<String, SftpSession>>>);
