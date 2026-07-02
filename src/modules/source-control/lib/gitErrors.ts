/** Mirrors the backend's `is_network_error` classifier (`net_error.rs`) so
 *  the frontend can distinguish "the SSH session died" from a genuine git
 *  error (merge conflict, bad ref, ...) and offer a reconnect affordance
 *  instead of a misleading "not a git repository" message. */
export function isSessionLostError(msg: string): boolean {
  const lower = msg.toLowerCase();
  return (
    lower.includes("no ssh session") ||
    lower.includes("no sftp session") ||
    lower.includes("connection reset") ||
    lower.includes("broken pipe") ||
    lower.includes("connection refused") ||
    lower.includes("no route to host")
  );
}
