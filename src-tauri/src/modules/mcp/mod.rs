pub mod osc133;
pub mod server;

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

pub(crate) const MCP_SERVICE: &str = "labonair-mcp";
pub(crate) const MCP_TOKEN_ACCOUNT: &str = "bearer-token";

/// One granted (or previously-granted) SSH tab, keyed by the frontend's
/// numeric tab id (stringified) in `McpState::grants` — deliberately *not*
/// keyed by `session_id`, since a tab can rebind to a new `session_id` across
/// a jump-host reconnect while remaining the same tab the user granted
/// access to. The frontend re-pushes this (same `tab_id`, new `session_id`)
/// on every reconnect so a grant never silently goes stale.
#[derive(Clone, Default, serde::Serialize)]
pub struct SessionGrant {
    pub tab_id: String,
    pub session_id: String,
    pub granted: bool,
    pub label: String,
}

/// Outcome the frontend reports back for a pending `open_tab`/`close_tab`
/// request via `mcp_tab_op_response` (see `server.rs`'s `open_tab`/`close_tab`
/// tools, which emit `mcp_open_tab_request`/`mcp_close_tab_request` and await
/// this on a oneshot channel — same request/response shape as the existing
/// `TrustState`/`wait_for_trust` host-key-confirmation flow in `ssh/client.rs`).
#[derive(Clone, Debug, Default, serde::Deserialize)]
pub struct TabOpResult {
    pub ok: bool,
    pub session_id: Option<String>,
    pub tab_id: Option<String>,
    pub error: Option<String>,
}

#[derive(Clone)]
pub struct McpState {
    pub enabled: Arc<AtomicBool>,
    pub port: u16,
    pub grants: Arc<Mutex<HashMap<String, SessionGrant>>>,
    command_locks: Arc<Mutex<HashMap<String, Arc<tokio::sync::Mutex<()>>>>>,
    pending_tab_ops: Arc<Mutex<HashMap<String, tokio::sync::oneshot::Sender<TabOpResult>>>>,
    server_shutdown: Arc<Mutex<Option<tokio_util::sync::CancellationToken>>>,
}

impl Default for McpState {
    fn default() -> Self {
        Self {
            enabled: Arc::new(AtomicBool::new(false)),
            port: 47823,
            grants: Arc::new(Mutex::new(HashMap::new())),
            command_locks: Arc::new(Mutex::new(HashMap::new())),
            pending_tab_ops: Arc::new(Mutex::new(HashMap::new())),
            server_shutdown: Arc::new(Mutex::new(None)),
        }
    }
}

impl McpState {
    /// Per-`session_id` mutex serializing `run_command` calls against a
    /// single tab — lazily created on first use.
    fn lock_for(&self, session_id: &str) -> Arc<tokio::sync::Mutex<()>> {
        let mut map = self.command_locks.lock().unwrap();
        map.entry(session_id.to_string()).or_insert_with(|| Arc::new(tokio::sync::Mutex::new(()))).clone()
    }

    fn grant_for_session(&self, session_id: &str) -> Option<SessionGrant> {
        let map = self.grants.lock().unwrap();
        map.values().find(|g| g.session_id == session_id && g.granted).cloned()
    }
}

#[derive(serde::Serialize)]
pub struct McpStatus {
    pub enabled: bool,
    pub port: u16,
    pub token: Option<String>,
}

fn generate_token() -> String {
    use rand::RngCore;
    let mut bytes = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut bytes);
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

#[tauri::command]
pub async fn mcp_get_status(
    app: tauri::AppHandle,
    state: tauri::State<'_, McpState>,
    secrets: tauri::State<'_, crate::modules::secrets::SecretsState>,
) -> Result<McpStatus, String> {
    let token = crate::modules::secrets::get_password(&app, &secrets, MCP_SERVICE, MCP_TOKEN_ACCOUNT)?;
    Ok(McpStatus { enabled: state.enabled.load(Ordering::Relaxed), port: state.port, token })
}

/// Enables or disables the MCP bridge. Enabling generates a bearer token on
/// first use (persisted via the app's own secrets store, not SQLite — same
/// rule the rest of the app follows for credentials) and starts the
/// Streamable-HTTP listener; disabling stops it **and revokes every
/// currently-granted tab** — a disabled bridge must expose zero sessions,
/// not just refuse new connections. Idempotent either way.
#[tauri::command]
pub async fn mcp_set_enabled(
    enabled: bool,
    app: tauri::AppHandle,
    state: tauri::State<'_, McpState>,
    secrets: tauri::State<'_, crate::modules::secrets::SecretsState>,
) -> Result<McpStatus, String> {
    if enabled {
        let existing = crate::modules::secrets::get_password(&app, &secrets, MCP_SERVICE, MCP_TOKEN_ACCOUNT)?;
        let token = match existing {
            Some(t) => t,
            None => {
                let t = generate_token();
                crate::modules::secrets::store_password(&app, &secrets, MCP_SERVICE, MCP_TOKEN_ACCOUNT, &t)?;
                t
            }
        };
        state.enabled.store(true, Ordering::Relaxed);
        server::ensure_started(app.clone(), state.inner().clone(), token.clone());
        Ok(McpStatus { enabled: true, port: state.port, token: Some(token) })
    } else {
        state.enabled.store(false, Ordering::Relaxed);
        server::stop(state.inner());
        state.grants.lock().map_err(|e| e.to_string())?.clear();
        Ok(McpStatus { enabled: false, port: state.port, token: None })
    }
}

/// Regenerates the bearer token (invalidating any previously configured
/// `claude mcp add` setup) and, if the bridge is currently enabled, restarts
/// the listener so the new token takes effect immediately.
#[tauri::command]
pub async fn mcp_regenerate_token(
    app: tauri::AppHandle,
    state: tauri::State<'_, McpState>,
    secrets: tauri::State<'_, crate::modules::secrets::SecretsState>,
) -> Result<McpStatus, String> {
    let token = generate_token();
    crate::modules::secrets::store_password(&app, &secrets, MCP_SERVICE, MCP_TOKEN_ACCOUNT, &token)?;
    if state.enabled.load(Ordering::Relaxed) {
        server::ensure_started(app.clone(), state.inner().clone(), token.clone());
    }
    Ok(McpStatus { enabled: state.enabled.load(Ordering::Relaxed), port: state.port, token: Some(token) })
}

/// Frontend-driven grant/revoke for one tab. Called on every toggle change
/// *and* on every SSH reconnect (with the same `tab_id`, new `session_id`) so
/// a grant never silently goes stale across a jump-host rebind.
#[tauri::command]
pub async fn mcp_set_session_grant(
    tab_id: String,
    session_id: String,
    granted: bool,
    label: String,
    state: tauri::State<'_, McpState>,
) -> Result<(), String> {
    let mut map = state.grants.lock().map_err(|e| e.to_string())?;
    if granted {
        map.insert(tab_id.clone(), SessionGrant { tab_id, session_id, granted, label });
    } else {
        map.remove(&tab_id);
    }
    Ok(())
}

/// Completes a pending `open_tab`/`close_tab` request the frontend was asked
/// to perform via the `mcp_open_tab_request`/`mcp_close_tab_request` events —
/// see `server.rs`'s `open_tab`/`close_tab` tool implementations.
#[tauri::command]
pub async fn mcp_tab_op_response(
    request_id: String,
    result: TabOpResult,
    state: tauri::State<'_, McpState>,
) -> Result<(), String> {
    let sender = { state.pending_tab_ops.lock().map_err(|e| e.to_string())?.remove(&request_id) };
    if let Some(tx) = sender {
        let _ = tx.send(result);
    }
    Ok(())
}
