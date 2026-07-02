/// Heuristic classification of a raw error string as a network-level failure
/// (dropped connection, dead socket) vs. any other error (permission denied,
/// file not found, stale session, ...). Shared between the transfer worker
/// and the SFTP browsing commands so both react identically to a dead
/// connection — remove the session and let the frontend show a reconnect
/// affordance instead of a silently stuck pane.
pub(crate) fn is_network_error(e: &str) -> bool {
    let lower = e.to_lowercase();
    lower.contains("broken pipe")
        || lower.contains("connection reset")
        || lower.contains("connection refused")
        || lower.contains("no route to host")
        || lower.contains("network")
        || lower.contains("no sftp session")
        || lower.contains("no ssh session")
        || lower.contains("sftp_state lock")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_broken_pipe() {
        assert!(is_network_error("Broken pipe (os error 32)"));
    }

    #[test]
    fn detects_connection_reset() {
        assert!(is_network_error("Connection reset by peer"));
    }

    #[test]
    fn detects_connection_refused() {
        assert!(is_network_error("Connection refused"));
    }

    #[test]
    fn detects_no_route_to_host() {
        assert!(is_network_error("No route to host"));
    }

    #[test]
    fn detects_missing_session_after_removal() {
        assert!(is_network_error("no SFTP session for tab abc-123"));
    }

    #[test]
    fn detects_missing_ssh_session_for_git() {
        assert!(is_network_error("no SSH session for this host — reconnect and try again"));
    }

    #[test]
    fn detects_lock_poisoning_message() {
        assert!(is_network_error("sftp_state lock: poisoned"));
    }

    #[test]
    fn is_case_insensitive() {
        assert!(is_network_error("BROKEN PIPE"));
    }

    #[test]
    fn does_not_flag_permission_denied() {
        assert!(!is_network_error("Permission denied"));
    }

    #[test]
    fn does_not_flag_file_not_found() {
        assert!(!is_network_error("No such file or directory"));
    }

    #[test]
    fn does_not_flag_generic_internal_error() {
        assert!(!is_network_error("invalid argument"));
    }
}
