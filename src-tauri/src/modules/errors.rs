use serde::Serialize;
use thiserror::Error;

#[derive(Error, Debug, Serialize)]
#[serde(tag = "code", content = "message")]
pub enum NexumError {
    #[error("Authentication failed: {0}")]
    AuthFailed(String),
    #[error("Network connection lost: {0}")]
    NetworkError(String),
    #[error("Host key verification failed: {0}")]
    HostKeyMismatch(String),
    #[error("I/O error: {0}")]
    IoError(String),
    #[error("Internal error: {0}")]
    Internal(String),
}

impl From<ssh2::Error> for NexumError {
    fn from(e: ssh2::Error) -> Self {
        NexumError::Internal(e.to_string())
    }
}

impl From<std::io::Error> for NexumError {
    fn from(e: std::io::Error) -> Self {
        NexumError::IoError(e.to_string())
    }
}

impl From<rusqlite::Error> for NexumError {
    fn from(e: rusqlite::Error) -> Self {
        NexumError::Internal(e.to_string())
    }
}
