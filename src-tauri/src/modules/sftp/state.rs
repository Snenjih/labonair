use std::collections::HashMap;
use std::sync::{Arc, Mutex};

/// Colocates the SSH session and its SFTP subsystem handle behind one lock,
/// so browsing (readdir, rename, ...), exec-based ops (du, chown, find) and
/// git-over-exec commands for one browsing session all serialize through the
/// same mutex — see `ssh::SshSessionInner`'s doc comment for why splitting
/// these into two independent locks (as this used to do) is unsafe with
/// libssh2, which does not allow unsynchronized concurrent access to one
/// Session's transport, even across its SFTP subsystem and exec channels.
pub struct SftpSessionInner {
    pub session: ssh2::Session,
    pub sftp: ssh2::Sftp,
}
unsafe impl Send for SftpSessionInner {}
unsafe impl Sync for SftpSessionInner {}

pub struct SftpSession {
    pub inner: Arc<Mutex<SftpSessionInner>>,
}

#[derive(Clone, Default)]
pub struct SftpState(pub Arc<Mutex<HashMap<String, SftpSession>>>);
