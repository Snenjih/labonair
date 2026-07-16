use std::sync::Arc;
use std::time::Duration;
use tauri::Emitter;
use tauri::ipc::Channel;
use crate::modules::errors::LabonairError;

macro_rules! log_step {
    ($app:expr, $session_id:expr, $msg:expr) => {
        let _ = $app.emit(
            "ssh_connect_log",
            serde_json::json!({ "session_id": $session_id, "message": $msg }),
        );
    };
}

/// Object-safety helper so a direct `tokio::net::TcpStream` and a
/// jump-bridged `russh::ChannelStream` (different concrete types) can both be
/// handed to `russh::client::connect_stream` through one boxed value.
trait AsyncStream: tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin + Send {}
impl<T: tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin + Send> AsyncStream for T {}

/// Error type for `ClientHandler`. Wraps `russh::Error` (satisfying the
/// `Handler::Error: From<russh::Error>` bound) plus an `Other` variant for
/// our own host-trust/rejection messages, so `check_server_key` can surface a
/// precise, user-facing reason instead of the generic error russh would
/// otherwise produce when a check simply returns `Ok(false)`.
#[derive(Debug)]
pub enum ClientHandlerError {
    Russh(russh::Error),
    Other(String),
}

impl std::fmt::Display for ClientHandlerError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ClientHandlerError::Russh(e) => write!(f, "{e}"),
            ClientHandlerError::Other(s) => write!(f, "{s}"),
        }
    }
}

impl std::error::Error for ClientHandlerError {}

impl From<russh::Error> for ClientHandlerError {
    fn from(e: russh::Error) -> Self {
        ClientHandlerError::Russh(e)
    }
}

/// Result of checking a server's host key against `known_hosts`. Direct
/// analog of the previous SSH library's host-key check-result type, minus
/// the `Failure` variant (folded into `NotFound` here, matching how this
/// code already treated the two identically before this migration).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum KnownHostStatus {
    Match,
    Mismatch,
    NotFound,
}

/// Checks `pubkey` against `known_hosts_path` for `host_address:port`.
/// Preserves the pre-migration lookup convention: check the port-qualified name
/// first (bare hostname if port==22, else `[host]:port` — this is exactly
/// what `russh::keys::check_known_hosts_path` does internally), then fall
/// back to the bare hostname if that lookup finds nothing and port != 22
/// (forced by re-querying with port=22, which makes the helper look up the
/// bare host). A `KeyChanged` error at either step means a mismatch; any
/// other error is treated as not-found, same as today.
fn check_known_host(
    known_hosts_path: &Option<std::path::PathBuf>,
    host_address: &str,
    port: i64,
    pubkey: &russh::keys::PublicKey,
) -> KnownHostStatus {
    let Some(path) = known_hosts_path else {
        return KnownHostStatus::NotFound;
    };
    if !path.exists() {
        return KnownHostStatus::NotFound;
    }
    match russh::keys::check_known_hosts_path(host_address, port as u16, pubkey, path) {
        Ok(true) => KnownHostStatus::Match,
        Ok(false) => {
            if port != 22 {
                match russh::keys::check_known_hosts_path(host_address, 22, pubkey, path) {
                    Ok(true) => KnownHostStatus::Match,
                    Ok(false) => KnownHostStatus::NotFound,
                    Err(russh::keys::Error::KeyChanged { .. }) => KnownHostStatus::Mismatch,
                    Err(_) => KnownHostStatus::NotFound,
                }
            } else {
                KnownHostStatus::NotFound
            }
        }
        Err(russh::keys::Error::KeyChanged { .. }) => KnownHostStatus::Mismatch,
        Err(_) => KnownHostStatus::NotFound,
    }
}

/// MD5 hex-colon fingerprint over a public key's encoded wire bytes — the
/// same format the previous SSH library's MD5 host-key hash produced.
/// `ssh_key`'s `HashAlg` has no MD5 variant, so this is computed manually
/// (the `md5` crate is already a dependency) to preserve the exact string
/// format users see today.
fn md5_fingerprint(key_bytes: &[u8]) -> String {
    let digest = md5::compute(key_bytes);
    digest.iter().map(|b| format!("{:02x}", b)).collect::<Vec<_>>().join(":")
}

/// Implements `russh::client::Handler` — the host-key verification hook,
/// plus everything else the trait requires via its no-op defaults. One
/// instance is constructed per connection attempt (main session or jump
/// session), carrying just enough context to run the known-hosts/trust flow
/// for that one connection.
pub struct ClientHandler {
    session_id: String,
    app: tauri::AppHandle,
    trust_state: super::TrustState,
    fail_fast_untrusted_host: bool,
    host_address: String,
    port: i64,
    /// Shared with the owning `RushSession` (when one exists) so the real
    /// disconnect cause is available to whoever is blocked reading from this
    /// session's channels — see `RushSession::disconnect_reason`'s doc
    /// comment. Connections that have no such consumer (jump-host hops,
    /// tunnels) pass a throwaway `Arc` that nothing ever reads.
    disconnect_reason: Arc<std::sync::Mutex<Option<String>>>,
}

impl russh::client::Handler for ClientHandler {
    type Error = ClientHandlerError;

    async fn check_server_key(
        &mut self,
        server_public_key: &russh::keys::PublicKey,
    ) -> Result<bool, Self::Error> {
        log_step!(self.app, self.session_id, "Verifying host fingerprint…");

        let key_bytes = server_public_key
            .to_bytes()
            .map_err(|e| ClientHandlerError::Other(format!("failed to encode host key: {e}")))?;
        let fingerprint = md5_fingerprint(&key_bytes);

        let known_hosts_path = dirs::home_dir().map(|h| h.join(".ssh").join("known_hosts"));
        // Only needed for the mismatch-cleanup path below — the actual
        // check/learn calls let russh's known_hosts helpers derive this
        // lookup name themselves.
        let known_host_check_name = if self.port == 22 {
            self.host_address.clone()
        } else {
            format!("[{}]:{}", self.host_address, self.port)
        };

        let status = check_known_host(&known_hosts_path, &self.host_address, self.port, server_public_key);

        match status {
            KnownHostStatus::Match => {
                log_step!(self.app, self.session_id, "Host fingerprint verified ✓");
                Ok(true)
            }
            KnownHostStatus::Mismatch => {
                log_step!(self.app, self.session_id, format!("Host key mismatch! Fingerprint: {}", fingerprint));
                if self.fail_fast_untrusted_host {
                    return Err(ClientHandlerError::Other(format!(
                        "host key mismatch for {} — open a terminal tab to this host to verify and trust its new fingerprint",
                        self.host_address
                    )));
                }
                self.app
                    .emit("known_hosts_warning", serde_json::json!({
                        "session_id": self.session_id, "fingerprint": fingerprint,
                        "host": self.host_address, "is_mismatch": true
                    }))
                    .map_err(|e| ClientHandlerError::Other(e.to_string()))?;
                if !wait_for_trust(&self.session_id, &self.trust_state).await {
                    return Err(ClientHandlerError::Other("User rejected host".to_string()));
                }
                if let Some(ref path) = known_hosts_path {
                    drop_known_host_entry(path, &known_host_check_name);
                    drop_known_host_entry(path, &self.host_address);
                    let _ = russh::keys::known_hosts::learn_known_hosts_path(
                        &self.host_address, self.port as u16, server_public_key, path,
                    );
                }
                log_step!(self.app, self.session_id, "Host key accepted and updated in known_hosts ✓");
                Ok(true)
            }
            KnownHostStatus::NotFound => {
                log_step!(self.app, self.session_id, format!("Unknown host — fingerprint: {}", fingerprint));
                if self.fail_fast_untrusted_host {
                    return Err(ClientHandlerError::Other(format!(
                        "host key not yet trusted for {} — open a terminal tab to this host to verify and trust its fingerprint",
                        self.host_address
                    )));
                }
                self.app
                    .emit("known_hosts_warning", serde_json::json!({
                        "session_id": self.session_id, "fingerprint": fingerprint,
                        "host": self.host_address, "is_mismatch": false
                    }))
                    .map_err(|e| ClientHandlerError::Other(e.to_string()))?;
                if !wait_for_trust(&self.session_id, &self.trust_state).await {
                    return Err(ClientHandlerError::Other("User rejected host".to_string()));
                }
                if let Some(ref path) = known_hosts_path {
                    let _ = russh::keys::known_hosts::learn_known_hosts_path(
                        &self.host_address, self.port as u16, server_public_key, path,
                    );
                }
                log_step!(self.app, self.session_id, "Host trusted and added to known_hosts ✓");
                Ok(true)
            }
        }
    }

    /// Captures the real reason the transport went down — a server-sent
    /// SSH_MSG_DISCONNECT, or the underlying I/O/protocol error — into the
    /// shared `disconnect_reason` slot so a blocked `ChannelReadHalf::wait()`
    /// caller (which otherwise only sees `None`/`Eof` with no error info) can
    /// report something more useful than a generic fallback string.
    async fn disconnected(
        &mut self,
        reason: russh::client::DisconnectReason<Self::Error>,
    ) -> Result<(), Self::Error> {
        let text = match &reason {
            russh::client::DisconnectReason::ReceivedDisconnect(info) => {
                if info.message.is_empty() {
                    format!("server disconnected: {:?}", info.reason_code)
                } else {
                    format!("server disconnected: {}", info.message)
                }
            }
            russh::client::DisconnectReason::Error(e) => e.to_string(),
        };
        if let Ok(mut slot) = self.disconnect_reason.lock() {
            *slot = Some(text);
        }
        match reason {
            russh::client::DisconnectReason::ReceivedDisconnect(_) => Ok(()),
            russh::client::DisconnectReason::Error(e) => Err(e),
        }
    }
}

#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn ssh_connect(
    session_id: String,
    host_id: String,
    passphrase: Option<String>,
    password_override: Option<String>,
    initial_cols: Option<u32>,
    initial_rows: Option<u32>,
    blocks: bool,
    on_event: Channel<super::pty::SshPtyEvent>,
    state: tauri::State<'_, super::SshState>,
    trust_state: tauri::State<'_, super::TrustState>,
    hosts_db: tauri::State<'_, crate::modules::hosts::HostsDb>,
    secrets: tauri::State<'_, crate::modules::secrets::SecretsState>,
    app: tauri::AppHandle,
    connect_timeout_secs: Option<u64>,
) -> Result<(), LabonairError> {
    // Step 1: Fetch host from SQLite (fast, sync — do before spawn_blocking)
    log_step!(app, session_id, "Reading host configuration…");
    let (host_address, port, username, auth_method, private_key_path, keep_alive_interval, keep_alive_tries, default_path_ssh, credential_id, jump_host_id) = {
        let conn = hosts_db.0.lock().map_err(|e| LabonairError::Internal(e.to_string()))?;
        let mut stmt = conn
            .prepare(
                "SELECT host_address, port, username, auth_method, private_key_path, \
                 keep_alive_interval, keep_alive_tries, default_path_ssh, credential_id, jump_host_id \
                 FROM hosts WHERE id = ?1",
            )?;
        stmt.query_row(rusqlite::params![host_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, i64>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, Option<String>>(4)?,
                row.get::<_, Option<i64>>(5)?,
                row.get::<_, Option<i64>>(6)?,
                row.get::<_, Option<String>>(7)?,
                row.get::<_, Option<String>>(8)?,
                row.get::<_, Option<String>>(9)?,
            ))
        })?
    };

    // Step 1b: Resolve credential — if the host references a credential, override auth fields.
    let (auth_method, private_key_path) = if let Some(cid) = &credential_id {
        log_step!(app, session_id, "Resolving credential…");
        let (cred_type, cred_key_path, cred_has_secret): (String, Option<String>, bool) = {
            let conn = hosts_db.0.lock().map_err(|e| LabonairError::Internal(e.to_string()))?;
            conn.query_row(
                "SELECT cred_type, key_path, has_secret FROM credentials WHERE id=?1",
                rusqlite::params![cid],
                |r| Ok((r.get(0)?, r.get(1)?, r.get::<_, i64>(2).map(|v| v != 0).unwrap_or(false))),
            )
            .map_err(|_| LabonairError::Internal(format!("Credential '{}' not found — it may have been deleted. Please update the host's auth settings.", cid)))?
        };
        let _ = cred_has_secret; // used below for password fetch
        (cred_type, cred_key_path)
    } else {
        (auth_method, private_key_path)
    };

    // Step 2: Fetch password — use override if provided, else local store.
    // When using a credential, fetch the credential's secret instead of the host's.
    let password: Option<String> = if auth_method == "password" {
        if password_override.is_some() {
            password_override.clone()
        } else {
            log_step!(app, session_id, "Retrieving credentials from local store…");
            if let Some(cid) = &credential_id {
                crate::modules::secrets::get_password(&app, &secrets, "labonair-cred", cid).ok().flatten()
            } else {
                crate::modules::secrets::get_password(&app, &secrets, "labonair-app", &host_id).ok().flatten()
            }
        }
    } else {
        None
    };

    // For key auth via credential, the passphrase may be stored in the credential's secret.
    let passphrase = if credential_id.is_some() && auth_method == "key" && passphrase.is_none() {
        if let Some(cid) = &credential_id {
            crate::modules::secrets::get_password(&app, &secrets, "labonair-cred", cid).ok().flatten()
        } else {
            passphrase
        }
    } else {
        passphrase
    };

    // Step 3: Resolve jump host fields (if any).
    let jump = match jump_host_id.as_deref() {
        Some(jid) => {
            log_step!(app, session_id, "Resolving jump host…");
            Some(resolve_jump_host(&hosts_db, &secrets, &app, jid)?)
        }
        None => None,
    };

    let state_inner = state.inner().clone();
    let trust_inner = trust_state.inner().clone();
    let cols = initial_cols.unwrap_or(220);
    let rows = initial_rows.unwrap_or(50);
    let result = ssh_connect_async(
        session_id, host_id.clone(), passphrase,
        host_address, port, username, auth_method,
        private_key_path, keep_alive_interval, keep_alive_tries,
        default_path_ssh, password, cols, rows,
        jump,
        blocks, state_inner, trust_inner, app.clone(), on_event,
        connect_timeout_secs,
    )
    .await;

    if result.is_ok() {
        // Update last_connected_at on the DB thread after successful connect.
        let conn = hosts_db.0.lock().map_err(|e| LabonairError::Internal(e.to_string()))?;
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as i64;
        let _ = conn.execute(
            "UPDATE hosts SET last_connected_at = ?1 WHERE id = ?2",
            rusqlite::params![now, host_id],
        );
    }

    result.map_err(classify_ssh_error)
}

/// Maps a string error from ssh_connect_async to a structured LabonairError variant.
fn classify_ssh_error(s: String) -> LabonairError {
    let lower = s.to_lowercase();
    if lower.contains("authentication failed")
        || lower.contains("not authenticated")
        || s == "passphrase_required"
    {
        LabonairError::AuthFailed(s)
    } else if lower.contains("tcp connect")
        || lower.contains("network")
        || lower.contains("connection reset")
        || lower.contains("broken pipe")
        || lower.contains("no route to host")
    {
        LabonairError::NetworkError(s)
    } else if lower.contains("mismatch") || lower.contains("host key") || lower.contains("user rejected host") {
        LabonairError::HostKeyMismatch(s)
    } else {
        LabonairError::Internal(s)
    }
}

/// Quick-connect: initiate an SSH connection without a saved host record.
/// Password is provided directly; no keyring lookup.
#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn ssh_connect_quick(
    session_id: String,
    username: String,
    host_address: String,
    port: u16,
    password: String,
    passphrase: Option<String>,
    initial_cols: Option<u32>,
    initial_rows: Option<u32>,
    blocks: bool,
    on_event: Channel<super::pty::SshPtyEvent>,
    state: tauri::State<'_, super::SshState>,
    trust_state: tauri::State<'_, super::TrustState>,
    app: tauri::AppHandle,
    connect_timeout_secs: Option<u64>,
) -> Result<(), String> {
    let state_inner = state.inner().clone();
    let trust_inner = trust_state.inner().clone();
    let cols = initial_cols.unwrap_or(220);
    let rows = initial_rows.unwrap_or(50);
    ssh_connect_async(
        session_id,
        String::new(), // no host_id — quick connect has no DB record
        passphrase,
        host_address,
        port as i64,
        username,
        "password".to_string(),
        None,
        None,
        None,
        None,
        Some(password),
        cols,
        rows,
        // No jump host for quick connect — no host_id/DB record to resolve one from.
        None,
        blocks,
        state_inner,
        trust_inner,
        app,
        on_event,
        connect_timeout_secs,
    )
    .await
}

/// Signal the backend to accept or reject a host's fingerprint.
/// Called by the frontend after the user acts on the trust dialog.
#[tauri::command]
pub async fn ssh_trust_host(
    session_id: String,
    accepted: bool,
    trust_state: tauri::State<'_, super::TrustState>,
) -> Result<(), String> {
    let sender = {
        let mut map = trust_state.0.lock().map_err(|e| e.to_string())?;
        map.remove(&session_id)
    };
    if let Some(tx) = sender {
        let _ = tx.send(accepted);
    }
    Ok(())
}

/// Remove all known_hosts entries for a given host address.
/// Used when a host key mismatch is confirmed by the user.
#[tauri::command]
pub async fn ssh_remove_known_host(host_address: String) -> Result<(), String> {
    let path = dirs::home_dir()
        .map(|h| h.join(".ssh").join("known_hosts"))
        .ok_or_else(|| "Cannot determine home directory".to_string())?;

    if !path.exists() {
        return Ok(());
    }

    let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let filtered: Vec<&str> = content
        .lines()
        .filter(|line| {
            let trimmed = line.trim();
            if trimmed.starts_with('#') || trimmed.is_empty() {
                return true;
            }
            // Each line: "hostname[,hostname2] key-type base64-key [comment]"
            // Reject lines whose first field matches the host address.
            let first_field = trimmed.split_whitespace().next().unwrap_or("");
            !first_field.split(',').any(|h| h == host_address)
        })
        .collect();
    let new_content = filtered.join("\n") + "\n";
    std::fs::write(&path, new_content).map_err(|e| e.to_string())?;
    Ok(())
}

/// Waits for the user to accept or reject an unknown/changed host key, or for
/// the 5-minute dialog timeout to expire. Always removes the pending entry
/// from `TrustState` before returning, so the map never leaks even if the
/// dialog is dismissed without a response. Returns `true` = trusted, `false`
/// = rejected or timed out.
async fn wait_for_trust(session_id: &str, trust_state: &super::TrustState) -> bool {
    let (tx, rx) = tokio::sync::oneshot::channel::<bool>();
    {
        let Ok(mut map) = trust_state.0.lock() else { return false };
        map.insert(session_id.to_string(), tx);
    }

    let trusted = matches!(
        tokio::time::timeout(Duration::from_secs(300), rx).await,
        Ok(Ok(true))
    );

    // Always clean up — no leaks regardless of how we exit.
    let _ = trust_state.0.lock().map(|mut m| m.remove(session_id));

    trusted
}

/// Like `establish_authenticated_session` but accepts an already-connected
/// async stream (e.g. a jump-host bridge's `ChannelStream`).
///
/// `fail_fast_untrusted_host`: when true, an unknown/mismatched host key
/// returns an error immediately instead of waiting on the trust dialog.
/// Used by background sessions that have no trust-prompt UI of their own
/// (the sidebar Explorer's lazy SFTP session) — without this they'd hang
/// for up to 5 minutes on first connect to a not-yet-trusted host. The
/// interactive terminal/SFTP-tab connect flow always passes `false` for its
/// *main* hop since it owns a real trust dialog (`SshLoadingScreen`). A jump
/// hop (see `connect_via_jump`) always passes `true` regardless of the main
/// hop's policy — it has no trust-prompt UI of its own either way.
#[allow(clippy::too_many_arguments)]
pub(crate) async fn establish_authenticated_session_from_stream<R>(
    session_id: &str,
    tcp: R,
    host_address: &str,
    port: i64,
    username: &str,
    auth_method: &str,
    private_key_path: Option<&str>,
    keep_alive_interval: Option<i64>,
    keep_alive_tries: Option<i64>,
    password: Option<&str>,
    passphrase: Option<&str>,
    trust_state: &super::TrustState,
    app: &tauri::AppHandle,
    fail_fast_untrusted_host: bool,
    disconnect_reason: Arc<std::sync::Mutex<Option<String>>>,
) -> Result<Arc<russh::client::Handle<ClientHandler>>, String>
where
    R: tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin + Send + 'static,
{
    log_step!(app, session_id, "TCP connection established.");

    // SSH handshake
    log_step!(app, session_id, "Starting SSH handshake…");
    let effective_interval = keep_alive_interval.unwrap_or(25i64) as u64;
    let effective_tries = keep_alive_tries.unwrap_or(3).max(0) as usize;
    let config = Arc::new(russh::client::Config {
        keepalive_interval: Some(Duration::from_secs(effective_interval)),
        keepalive_max: effective_tries,
        ..Default::default()
    });

    let handler = ClientHandler {
        session_id: session_id.to_string(),
        app: app.clone(),
        trust_state: trust_state.clone(),
        fail_fast_untrusted_host,
        host_address: host_address.to_string(),
        port,
        disconnect_reason,
    };

    let mut handle = russh::client::connect_stream(config, tcp, handler)
        .await
        .map_err(|e| e.to_string())?;
    log_step!(app, session_id, "SSH handshake complete.");

    // Authentication
    log_step!(app, session_id, "Authenticating…");
    let authenticated = if auth_method == "key" {
        let key_path = private_key_path
            .map(std::path::Path::new)
            .ok_or("private_key_path not set for key auth")?;
        if !key_path.exists() {
            return Err(format!("Private key file not found: {}", key_path.display()));
        }

        let agent_ok = try_agent_auth(&mut handle, username, session_id, app).await;
        if agent_ok {
            true
        } else {
            let pem = std::fs::read_to_string(key_path)
                .map_err(|e| format!("Failed to read private key file: {e}"))?;
            log_step!(app, session_id, "Authenticating with public key file…");
            // `russh::keys::Error::KeyIsEncrypted` is only ever raised by the
            // legacy OpenSSH-format and PKCS#5 ("-----BEGIN RSA PRIVATE
            // KEY-----" with a DEK-Info header) decoders — never by the
            // PKCS#8 path, which is what `credential_generate_keypair`
            // actually produces (`-----BEGIN ENCRYPTED PRIVATE KEY-----`).
            // Detect that format directly from the PEM header so a missing
            // or wrong passphrase on one of this app's own generated keys
            // still routes through the passphrase prompt instead of a
            // generic auth-failed error.
            let is_pkcs8_encrypted = pem.contains("-----BEGIN ENCRYPTED PRIVATE KEY-----");
            match russh::keys::decode_secret_key(&pem, passphrase) {
                Ok(key_pair) => {
                    let hash_alg = handle.best_supported_rsa_hash().await.ok().flatten().flatten();
                    let key = russh::keys::PrivateKeyWithHashAlg::new(Arc::new(key_pair), hash_alg);
                    match handle.authenticate_publickey(username, key).await {
                        Ok(res) if res.success() => true,
                        other => {
                            let msg = match other {
                                Err(e) => e.to_string(),
                                Ok(_) => "authentication failed".to_string(),
                            };
                            log_step!(app, session_id, format!("Key auth failed: {}", msg));
                            app.emit("auth_required", serde_json::json!({
                                "session_id": session_id, "prompt_message": msg, "is_2fa": false
                            })).map_err(|e| e.to_string())?;
                            return Err(format!("authentication failed: {}", msg));
                        }
                    }
                }
                // The key is encrypted and no passphrase was supplied — prompt
                // for one instead of surfacing a generic auth failure. If a
                // passphrase WAS supplied and is simply wrong, russh reports
                // this the same way (it can't distinguish "wrong passphrase"
                // from "encrypted, no passphrase given" at decode time), so
                // it also lands here — the frontend re-prompts either way.
                // The PKCS#8-encrypted case (see `is_pkcs8_encrypted` above)
                // gets the same treatment for any decode failure, since it
                // never surfaces as `KeyIsEncrypted` at all.
                Err(russh::keys::Error::KeyIsEncrypted) => {
                    log_step!(app, session_id, "Key is passphrase-protected, prompting…");
                    app.emit("passphrase_required", serde_json::json!({ "session_id": session_id }))
                        .map_err(|e| e.to_string())?;
                    return Err("passphrase_required".to_string());
                }
                Err(e) if is_pkcs8_encrypted => {
                    log_step!(app, session_id, "Key is passphrase-protected, prompting…");
                    let _ = e; // decode failure on an encrypted PKCS#8 key means missing/wrong passphrase
                    app.emit("passphrase_required", serde_json::json!({ "session_id": session_id }))
                        .map_err(|e| e.to_string())?;
                    return Err("passphrase_required".to_string());
                }
                Err(e) => {
                    let msg = e.to_string();
                    log_step!(app, session_id, format!("Key auth failed: {}", msg));
                    app.emit("auth_required", serde_json::json!({
                        "session_id": session_id, "prompt_message": msg, "is_2fa": false
                    })).map_err(|e| e.to_string())?;
                    return Err(format!("authentication failed: {}", msg));
                }
            }
        }
    } else {
        let pw = password.unwrap_or("");
        match handle.authenticate_password(username, pw).await {
            Ok(res) if res.success() => true,
            other => {
                let msg = match other {
                    Err(e) => e.to_string(),
                    Ok(_) => "authentication failed".to_string(),
                };
                log_step!(app, session_id, format!("Password auth failed: {}", msg));
                app.emit("auth_required", serde_json::json!({
                    "session_id": session_id, "prompt_message": msg, "is_2fa": false
                })).map_err(|e| e.to_string())?;
                return Err(format!("authentication failed: {}", msg));
            }
        }
    };

    if !authenticated {
        log_step!(app, session_id, "Authentication failed.");
        app.emit("auth_required", serde_json::json!({
            "session_id": session_id, "prompt_message": "Authentication failed", "is_2fa": false
        })).map_err(|e| e.to_string())?;
        return Err("not authenticated".to_string());
    }

    log_step!(app, session_id, "Authenticated ✓");
    Ok(Arc::new(handle))
}

/// Fully-resolved connection parameters for a jump host — the shape
/// `ssh_connect`'s jump-host resolution step used to build inline before
/// being extracted into `resolve_jump_host` so the SFTP/tunnels path (via
/// `establish_authenticated_session`) can reuse it.
pub(crate) struct JumpHostParams {
    pub address: String,
    pub port: i64,
    pub username: String,
    pub auth_method: String,
    pub private_key_path: Option<String>,
    pub password: Option<String>,
    pub keep_alive_interval: Option<i64>,
}

/// Resolves a jump host's own connection fields + credential + keyring
/// password from the `hosts`/`credentials` tables. Single-hop only — a jump
/// host's own `jump_host_id` (if it has one) is intentionally never queried
/// here, so chained jump hosts remain unsupported, matching the behavior
/// this was extracted from.
pub(crate) fn resolve_jump_host(
    hosts_db: &crate::modules::hosts::HostsDb,
    secrets: &crate::modules::secrets::SecretsState,
    app: &tauri::AppHandle,
    jump_host_id: &str,
) -> Result<JumpHostParams, LabonairError> {
    let (jh_addr, jh_port, jh_user, jh_auth, jh_key, jh_kai, jh_cred_id): (
        String, i64, String, String, Option<String>, Option<i64>, Option<String>,
    ) = {
        let conn = hosts_db.0.lock().map_err(|e| LabonairError::Internal(e.to_string()))?;
        conn.query_row(
            "SELECT host_address, port, username, auth_method, private_key_path, \
             keep_alive_interval, credential_id FROM hosts WHERE id = ?1",
            rusqlite::params![jump_host_id],
            |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                    row.get(5)?,
                    row.get(6)?,
                ))
            },
        )
        .map_err(|_| LabonairError::Internal(format!("Jump host '{}' not found", jump_host_id)))?
    };

    // Resolve credential for jump host if needed
    let (jh_auth, jh_key) = if let Some(ref jcid) = jh_cred_id {
        let (cred_type, cred_key_path): (String, Option<String>) = {
            let conn = hosts_db.0.lock().map_err(|e| LabonairError::Internal(e.to_string()))?;
            conn.query_row(
                "SELECT cred_type, key_path FROM credentials WHERE id=?1",
                rusqlite::params![jcid],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .map_err(|_| LabonairError::Internal(format!("Jump host credential '{}' not found", jcid)))?
        };
        (cred_type, cred_key_path)
    } else {
        (jh_auth, jh_key)
    };

    // Fetch jump host password from keyring
    let jh_pw: Option<String> = if jh_auth == "password" {
        if let Some(ref jcid) = jh_cred_id {
            crate::modules::secrets::get_password(app, secrets, "labonair-cred", jcid)
                .ok()
                .flatten()
        } else {
            crate::modules::secrets::get_password(app, secrets, "labonair-app", jump_host_id)
                .ok()
                .flatten()
        }
    } else {
        None
    };

    Ok(JumpHostParams {
        address: jh_addr,
        port: jh_port,
        username: jh_user,
        auth_method: jh_auth,
        private_key_path: jh_key,
        password: jh_pw,
        keep_alive_interval: jh_kai,
    })
}

/// Opens the transport stream for a connection — either a direct TCP socket,
/// or one bridged through a jump host via `connect_via_jump`. Shared by the
/// terminal path (`ssh_connect_async`) and the SFTP/tunnels path
/// (`establish_authenticated_session`) so the jump-vs-direct branch and its
/// circular-reference guard exist in exactly one place.
#[allow(clippy::too_many_arguments)]
async fn connect_transport_maybe_via_jump(
    session_id: &str,
    host_address: &str,
    port: i64,
    jump: Option<&JumpHostParams>,
    trust_state: &super::TrustState,
    app: &tauri::AppHandle,
    connect_timeout_secs: u64,
) -> Result<Box<dyn AsyncStream>, String> {
    let Some(jh) = jump else {
        return Ok(Box::new(tcp_connect_async(host_address, port, connect_timeout_secs).await?));
    };
    // Circular reference guard
    if jh.address.as_str() == host_address && jh.port == port {
        return Err("Jump host cannot be the same as the target host".to_string());
    }
    let stream = connect_via_jump(
        session_id,
        &jh.address,
        jh.port,
        &jh.username,
        &jh.auth_method,
        jh.private_key_path.as_deref(),
        jh.password.as_deref(),
        jh.keep_alive_interval,
        host_address,
        port,
        trust_state,
        app,
        connect_timeout_secs,
    )
    .await?;
    Ok(Box::new(stream))
}

/// Performs TCP connect (direct, or bridged through a jump host) → SSH
/// handshake → host-key check → authentication. Returns the fully
/// authenticated `Handle`. Thin wrapper around
/// `establish_authenticated_session_from_stream` that first opens the
/// transport. Used by SFTP connect and tunnels.
#[allow(clippy::too_many_arguments)]
pub(crate) async fn establish_authenticated_session(
    session_id: &str,
    host_address: &str,
    port: i64,
    username: &str,
    auth_method: &str,
    private_key_path: Option<&str>,
    keep_alive_interval: Option<i64>,
    keep_alive_tries: Option<i64>,
    password: Option<&str>,
    passphrase: Option<&str>,
    trust_state: &super::TrustState,
    app: &tauri::AppHandle,
    fail_fast_untrusted_host: bool,
    jump: Option<JumpHostParams>,
    connect_timeout_secs: Option<u64>,
) -> Result<Arc<russh::client::Handle<ClientHandler>>, String> {
    log_step!(app, session_id, format!("TCP connecting to {}:{}…", host_address, port));
    let tcp = connect_transport_maybe_via_jump(
        session_id,
        host_address,
        port,
        jump.as_ref(),
        trust_state,
        app,
        connect_timeout_secs.unwrap_or(10),
    )
    .await?;
    // Neither of this wrapper's callers (SFTP-only connect, tunnels) currently
    // consume a rich disconnect reason, so a throwaway slot is passed here —
    // only the interactive terminal path (which calls the `_from_stream`
    // variant directly) shares its own `RushSession.disconnect_reason`.
    establish_authenticated_session_from_stream(
        session_id, tcp, host_address, port, username, auth_method,
        private_key_path, keep_alive_interval, keep_alive_tries,
        password, passphrase, trust_state, app, fail_fast_untrusted_host,
        Arc::new(std::sync::Mutex::new(None)),
    ).await
}

#[allow(clippy::too_many_arguments)]
async fn ssh_connect_async(
    session_id: String,
    _host_id: String,
    passphrase: Option<String>,
    host_address: String,
    port: i64,
    username: String,
    auth_method: String,
    private_key_path: Option<String>,
    keep_alive_interval: Option<i64>,
    keep_alive_tries: Option<i64>,
    default_path_ssh: Option<String>,
    password: Option<String>,
    initial_cols: u32,
    initial_rows: u32,
    jump: Option<JumpHostParams>,
    blocks: bool,
    state: super::SshState,
    trust_state: super::TrustState,
    app: tauri::AppHandle,
    on_event: Channel<super::pty::SshPtyEvent>,
    connect_timeout_secs: Option<u64>,
) -> Result<(), String> {
    // Establish the transport stream — either a direct TCP connection or a
    // channel bridged through a jump host.
    let tcp = connect_transport_maybe_via_jump(
        &session_id,
        &host_address,
        port,
        jump.as_ref(),
        &trust_state,
        &app,
        connect_timeout_secs.unwrap_or(10),
    )
    .await?;

    let disconnect_reason = Arc::new(std::sync::Mutex::new(None));
    let handle = establish_authenticated_session_from_stream(
        &session_id,
        tcp,
        &host_address,
        port,
        &username,
        &auth_method,
        private_key_path.as_deref(),
        keep_alive_interval,
        keep_alive_tries,
        password.as_deref(),
        passphrase.as_deref(),
        &trust_state,
        &app,
        false,
        disconnect_reason.clone(),
    )
    .await?;

    // Store session in SshState *before* opening the shell channel — this
    // function runs sequentially on one async task with no `.await` between
    // building the session and inserting it, so the reader task spawned by
    // `open_shell_channel` can never race ahead of registration (see that
    // function's doc comment for why the old thread-rendezvous is no longer
    // needed).
    let session = Arc::new(super::RushSession {
        handle,
        pty: tokio::sync::Mutex::new(None),
        sftp: tokio::sync::OnceCell::new(),
        shutdown: Arc::new(std::sync::atomic::AtomicBool::new(false)),
        disconnect_reason,
    });
    {
        let mut map = state.0.lock().map_err(|e| e.to_string())?;
        map.insert(session_id.clone(), session.clone());
    }

    log_step!(app, session_id, "Opening shell channel…");
    if let Err(e) = super::pty::open_shell_channel(
        session,
        session_id.clone(),
        app.clone(),
        state.clone(),
        initial_cols,
        initial_rows,
        blocks,
        on_event,
    )
    .await
    {
        // Roll back the just-inserted entry — a session with an authenticated
        // handle but no working PTY is not a usable connection.
        let mut map = state.0.lock().map_err(|e| e.to_string())?;
        map.remove(&session_id);
        return Err(format!("failed to open shell channel: {e}"));
    }

    log_step!(app, session_id, "Session established ✓");
    app.emit(
        "session_established",
        serde_json::json!({ "session_id": session_id, "default_path_ssh": default_path_ssh }),
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

/// Connects to a jump host, authenticates (reusing the same
/// known-hosts/trust/auth flow as a direct connection, keyed by
/// `"{session_id}_jump"`), and opens a `direct-tcpip` channel to the target
/// through it. Returns the channel as an `AsyncRead + AsyncWrite` stream
/// (`Channel::into_stream()`) ready to hand to `connect_stream` for the
/// target session — no local loopback socket or bridging thread needed
/// (russh's own per-connection background task does the message pumping).
/// Its own host-key trust check always fail-fasts (see the call site below)
/// since no frontend trust dialog ever listens for a `"{session_id}_jump"`
/// `known_hosts_warning` — waiting on one would hang for the full 5-minute
/// dialog timeout with no way for the user to respond.
#[allow(clippy::too_many_arguments)]
async fn connect_via_jump(
    session_id: &str,
    jump_host_address: &str,
    jump_port: i64,
    jump_username: &str,
    jump_auth_method: &str,
    jump_private_key_path: Option<&str>,
    jump_password: Option<&str>,
    jump_keep_alive_interval: Option<i64>,
    target_host: &str,
    target_port: i64,
    trust_state: &super::TrustState,
    app: &tauri::AppHandle,
    connect_timeout_secs: u64,
) -> Result<russh::ChannelStream<russh::client::Msg>, String> {
    log_step!(
        app,
        session_id,
        format!("Connecting to jump host {}:{}…", jump_host_address, jump_port)
    );

    let jump_session_id = format!("{}_jump", session_id);
    let jump_tcp = tcp_connect_async(jump_host_address, jump_port, connect_timeout_secs)
        .await
        .map_err(|e| format!("Jump host TCP connect failed: {}", e))?;

    let jump_handle = establish_authenticated_session_from_stream(
        &jump_session_id,
        jump_tcp,
        jump_host_address,
        jump_port,
        jump_username,
        jump_auth_method,
        jump_private_key_path,
        jump_keep_alive_interval,
        None,
        jump_password,
        None,
        trust_state,
        app,
        // Always fail-fast on an untrusted/mismatched jump-host key, regardless
        // of the main hop's own trust-dialog policy: the frontend's trust
        // dialog only ever listens for the *main* session_id's
        // `known_hosts_warning`, never `"{session_id}_jump"`, so waiting here
        // would block for the full 5-minute dialog timeout with no way for the
        // user to ever respond. The jump hop is always a background hop with
        // no dedicated UI, so it must resolve immediately either way.
        true,
        // The jump hop has no PTY/consumer of its own to read this back.
        Arc::new(std::sync::Mutex::new(None)),
    )
    .await
    .map_err(|e| format!("Jump host authentication failed: {}", e))?;

    log_step!(
        app,
        session_id,
        format!(
            "Jump host authenticated. Opening tunnel to {}:{}…",
            target_host, target_port
        )
    );

    let channel = jump_handle
        .channel_open_direct_tcpip(target_host, target_port as u32, "127.0.0.1", 0)
        .await
        .map_err(|e| {
            format!(
                "Jump host: failed to open tunnel to {}:{}: {}",
                target_host, target_port, e
            )
        })?;

    log_step!(app, session_id, "Jump tunnel established ✓");

    Ok(channel.into_stream())
}

/// Opens a TCP connection to host:port with a configurable timeout
/// (`sshConnectTimeoutSecs`, default 10s — see `tcp_connect_async`).
/// Uses socket2 for explicit OS-level socket control and IPv4-only filtering.
/// This fixes "No route to host" errors on macOS with local network addresses.
fn tcp_connect(host: &str, port: i64, timeout_secs: u64) -> Result<std::net::TcpStream, String> {
    use socket2::{Domain, Socket, TcpKeepalive, Type};
    use std::net::{IpAddr, ToSocketAddrs};
    use std::time::Duration;

    let addr_str = format!("{}:{}", host, port);
    let addrs: Vec<std::net::SocketAddr> = addr_str
        .to_socket_addrs()
        .map_err(|e| format!("Failed to resolve {}: {}", addr_str, e))?
        .filter(|addr| matches!(addr.ip(), IpAddr::V4(_)))
        .collect();

    if addrs.is_empty() {
        return Err(format!("No IPv4 addresses resolved for {}", addr_str));
    }

    let mut last_err = String::new();
    for addr in &addrs {
        match Socket::new(Domain::IPV4, Type::STREAM, None) {
            Ok(socket) => {
                let _ = socket.set_nonblocking(false);
                let sock_addr: socket2::SockAddr = (*addr).into();
                match socket.connect_timeout(&sock_addr, Duration::from_secs(timeout_secs)) {
                    Ok(_) => {
                        let ka = TcpKeepalive::new()
                            .with_time(Duration::from_secs(60))
                            .with_interval(Duration::from_secs(15));
                        socket.set_tcp_keepalive(&ka).ok();
                        let tcp: std::net::TcpStream = socket.into();
                        tcp.set_nodelay(true).ok();
                        return Ok(tcp);
                    }
                    Err(e) => last_err = e.to_string(),
                }
            }
            Err(e) => last_err = e.to_string(),
        }
    }
    Err(last_err)
}

/// Runs the blocking `tcp_connect` helper and converts its result into a
/// `tokio::net::TcpStream` — the stream must be switched to non-blocking mode
/// before tokio can register it with the reactor.
async fn tcp_connect_async(
    host: &str,
    port: i64,
    timeout_secs: u64,
) -> Result<tokio::net::TcpStream, String> {
    let host_owned = host.to_string();
    let std_tcp = tcp_connect(&host_owned, port, timeout_secs)
        .map_err(|e| format!("TCP connect to {}:{} failed: {}", host_owned, port, e))?;
    std_tcp.set_nonblocking(true).map_err(|e| e.to_string())?;
    tokio::net::TcpStream::from_std(std_tcp).map_err(|e| e.to_string())
}

/// Tries to authenticate via the running ssh-agent (SSH_AUTH_SOCK).
/// Returns true if authentication succeeded, false if agent unavailable or all
/// identities were rejected — never panics. Certificates offered by the agent
/// are skipped (not supported via this path, matching the pre-migration
/// behavior — only plain public-key identities are tried).
#[cfg(unix)]
async fn try_agent_auth(
    handle: &mut russh::client::Handle<ClientHandler>,
    username: &str,
    session_id: &str,
    app: &tauri::AppHandle,
) -> bool {
    if std::env::var("SSH_AUTH_SOCK").is_err() {
        return false;
    }
    let mut agent = match russh::keys::agent::client::AgentClient::connect_env().await {
        Ok(a) => a,
        Err(_) => return false,
    };
    let identities = match agent.request_identities().await {
        Ok(ids) => ids,
        Err(_) => return false,
    };
    for identity in identities {
        let russh::keys::agent::AgentIdentity::PublicKey { key, .. } = identity else {
            continue;
        };
        // For RSA identities, negotiate the signature hash the server actually
        // accepts (`rsa-sha2-256`/`-512`) rather than always requesting the
        // legacy `ssh-rsa`/SHA-1 combination, which OpenSSH >= 8.8 rejects by
        // default. Irrelevant (ignored) for non-RSA key types.
        let hash_alg = handle.best_supported_rsa_hash().await.ok().flatten().flatten();
        if let Ok(res) = handle.authenticate_publickey_with(username, key, hash_alg, &mut agent).await {
            if res.success() {
                log_step!(app, session_id, "Authenticated via ssh-agent ✓");
                return true;
            }
        }
    }
    false
}

#[cfg(not(unix))]
async fn try_agent_auth(
    _handle: &mut russh::client::Handle<ClientHandler>,
    _username: &str,
    _session_id: &str,
    _app: &tauri::AppHandle,
) -> bool {
    false
}

/// Remove all known_hosts lines matching `host_address` via file rewrite.
pub fn drop_known_host_entry(path: &std::path::Path, host_address: &str) {
    if !path.exists() {
        return;
    }
    let Ok(content) = std::fs::read_to_string(path) else { return };
    let filtered: Vec<&str> = content
        .lines()
        .filter(|line| {
            let trimmed = line.trim();
            if trimmed.starts_with('#') || trimmed.is_empty() {
                return true;
            }
            let first_field = trimmed.split_whitespace().next().unwrap_or("");
            !first_field.split(',').any(|h| h == host_address)
        })
        .collect();
    let new_content = filtered.join("\n") + "\n";
    let _ = std::fs::write(path, new_content);
}

#[tauri::command]
pub async fn ssh_disconnect(
    session_id: String,
    state: tauri::State<'_, super::SshState>,
) -> Result<(), String> {
    let sess = {
        let mut map = state.0.lock().map_err(|e| e.to_string())?;
        map.remove(&session_id)
    };
    if let Some(sess) = sess {
        // Signal any dependent reader task to exit before tearing down the transport.
        sess.shutdown.store(true, std::sync::atomic::Ordering::Relaxed);
        let _ = sess
            .handle
            .disconnect(russh::Disconnect::ByApplication, "User disconnected", "")
            .await;
    }
    Ok(())
}
