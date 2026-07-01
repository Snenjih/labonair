use serde::Serialize;
use thiserror::Error;

#[derive(Error, Debug, Serialize, PartialEq)]
#[serde(tag = "code", content = "message")]
pub enum LabonairError {
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

impl From<ssh2::Error> for LabonairError {
    fn from(e: ssh2::Error) -> Self {
        LabonairError::Internal(e.to_string())
    }
}

impl From<std::io::Error> for LabonairError {
    fn from(e: std::io::Error) -> Self {
        LabonairError::IoError(e.to_string())
    }
}

impl From<rusqlite::Error> for LabonairError {
    fn from(e: rusqlite::Error) -> Self {
        LabonairError::Internal(e.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn io_error_conversion_produces_io_error_variant() {
        let io_err = std::io::Error::new(std::io::ErrorKind::NotFound, "file not found");
        let err = LabonairError::from(io_err);
        assert!(matches!(err, LabonairError::IoError(_)));
        if let LabonairError::IoError(msg) = &err {
            assert!(msg.contains("file not found"));
        }
    }

    #[test]
    fn rusqlite_error_conversion_produces_internal_variant() {
        let db_err = rusqlite::Error::QueryReturnedNoRows;
        let err = LabonairError::from(db_err);
        assert!(matches!(err, LabonairError::Internal(_)));
    }

    #[test]
    fn error_serializes_with_code_tag_and_message_content() {
        let err = LabonairError::AuthFailed("bad password".to_string());
        let json = serde_json::to_value(&err).unwrap();
        assert_eq!(json["code"], "AuthFailed");
        assert_eq!(json["message"], "bad password");
    }

    #[test]
    fn each_variant_produces_distinct_code_field() {
        let variants: &[(&str, LabonairError)] = &[
            ("AuthFailed", LabonairError::AuthFailed("x".into())),
            ("NetworkError", LabonairError::NetworkError("x".into())),
            ("HostKeyMismatch", LabonairError::HostKeyMismatch("x".into())),
            ("IoError", LabonairError::IoError("x".into())),
            ("Internal", LabonairError::Internal("x".into())),
        ];
        for (expected_code, err) in variants {
            let json = serde_json::to_value(err).unwrap();
            assert_eq!(
                json["code"].as_str().unwrap(),
                *expected_code,
                "Variant {:?} should have code '{}'",
                err,
                expected_code
            );
        }
    }

    #[test]
    fn partial_eq_works_for_same_variants() {
        assert_eq!(
            LabonairError::AuthFailed("x".into()),
            LabonairError::AuthFailed("x".into())
        );
    }

    #[test]
    fn partial_eq_distinguishes_different_variants() {
        assert_ne!(
            LabonairError::AuthFailed("x".into()),
            LabonairError::Internal("x".into())
        );
    }
}
