pub mod osc133;
pub mod server;

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicU16, AtomicU32, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{Emitter, Manager};

pub(crate) const MCP_SERVICE: &str = "labonair-mcp";
pub(crate) const MCP_TOKEN_ACCOUNT: &str = "bearer-token";

const DEFAULT_PORT: u16 = 47823;
const DEFAULT_MAX_COMMAND_TIMEOUT_MS: u64 = 300_000;
const AUTO_REVOKE_SWEEP_INTERVAL: Duration = Duration::from_secs(60);

/// Which underlying terminal backend a grant targets — SSH tabs are resolved
/// through `SshState`/`session_id`; local tabs have no string-keyed Rust
/// session at all (see `pty::PtyState`, keyed by `u32`), so `local_pty_id`
/// carries the numeric id the frontend's `terminalSessionRegistry` looked up
/// for this tab.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, serde::Serialize, serde::Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum SessionKind {
    #[default]
    Ssh,
    Local,
}

/// One granted (or previously-granted) tab, keyed by the frontend's numeric
/// tab id (stringified) in `McpState::grants` — deliberately *not* keyed by
/// `session_id`, since an SSH tab can rebind to a new `session_id` across a
/// jump-host reconnect while remaining the same tab the user granted access
/// to. The frontend re-pushes this (same `tab_id`, new `session_id`) on every
/// reconnect so a grant never silently goes stale.
#[derive(Clone, Default, serde::Serialize)]
pub struct SessionGrant {
    pub tab_id: String,
    pub session_id: String,
    pub granted: bool,
    pub label: String,
    pub kind: SessionKind,
    pub local_pty_id: Option<u32>,
    /// `Some` only for SSH grants — used to re-check the host's "Block AI
    /// Agent Access" flag live at tool-execution time, not just at grant
    /// time (see `host_blocks_agent_access`).
    pub host_id: Option<String>,
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
    pub port: Arc<AtomicU16>,
    pub max_command_timeout_ms: Arc<AtomicU64>,
    pub auto_revoke_minutes: Arc<AtomicU32>,
    pub grants: Arc<Mutex<HashMap<String, SessionGrant>>>,
    command_locks: Arc<Mutex<HashMap<String, Arc<tokio::sync::Mutex<()>>>>>,
    pending_tab_ops: Arc<Mutex<HashMap<String, tokio::sync::oneshot::Sender<TabOpResult>>>>,
    server_shutdown: Arc<Mutex<Option<tokio_util::sync::CancellationToken>>>,
    /// Last grant/activity timestamp per `tab_id`, swept by
    /// `spawn_auto_revoke_sweeper` — absent entirely from the map means "no
    /// activity recorded yet" (treated as due for revocation the same as any
    /// other stale entry once `auto_revoke_minutes` is nonzero).
    last_used: Arc<Mutex<HashMap<String, Instant>>>,
}

impl Default for McpState {
    fn default() -> Self {
        Self {
            enabled: Arc::new(AtomicBool::new(false)),
            port: Arc::new(AtomicU16::new(DEFAULT_PORT)),
            max_command_timeout_ms: Arc::new(AtomicU64::new(DEFAULT_MAX_COMMAND_TIMEOUT_MS)),
            auto_revoke_minutes: Arc::new(AtomicU32::new(0)),
            grants: Arc::new(Mutex::new(HashMap::new())),
            command_locks: Arc::new(Mutex::new(HashMap::new())),
            pending_tab_ops: Arc::new(Mutex::new(HashMap::new())),
            server_shutdown: Arc::new(Mutex::new(None)),
            last_used: Arc::new(Mutex::new(HashMap::new())),
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

    /// Records activity for `tab_id` so the auto-revoke sweep doesn't
    /// consider it stale. Called on grant and on every tool call that
    /// touches a session.
    fn touch(&self, tab_id: &str) {
        self.last_used.lock().unwrap().insert(tab_id.to_string(), Instant::now());
    }

    fn max_command_timeout_ms(&self) -> u64 {
        self.max_command_timeout_ms.load(Ordering::Relaxed)
    }
}

/// Looks up a host's current "Block AI Agent Access" flag directly (not from
/// a possibly-stale `SessionGrant`), so a flag flipped on *after* a tab was
/// already granted still takes effect on the very next tool call. Missing
/// host/DB error is treated as "not blocked" — a host that no longer exists
/// has bigger problems than this check, and the SSH session lookup itself
/// will fail right after with a clearer error.
pub(crate) fn host_blocks_agent_access(app: &tauri::AppHandle, host_id: &str) -> Result<bool, String> {
    let hosts_db = app.state::<crate::modules::hosts::HostsDb>();
    let conn = hosts_db.0.lock().map_err(|e| e.to_string())?;
    let blocked: i64 = conn
        .query_row(
            "SELECT block_agent_access FROM hosts WHERE id = ?1",
            rusqlite::params![host_id],
            |r| r.get(0),
        )
        .unwrap_or(0);
    Ok(blocked != 0)
}

#[derive(serde::Serialize)]
pub struct McpStatus {
    pub enabled: bool,
    pub port: u16,
    pub token: Option<String>,
    pub max_command_timeout_secs: u64,
    pub auto_revoke_minutes: u32,
}

fn generate_token() -> String {
    use rand::RngCore;
    let mut bytes = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut bytes);
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn build_status(state: &McpState, token: Option<String>) -> McpStatus {
    McpStatus {
        enabled: state.enabled.load(Ordering::Relaxed),
        port: state.port.load(Ordering::Relaxed),
        token,
        max_command_timeout_secs: state.max_command_timeout_ms.load(Ordering::Relaxed) / 1000,
        auto_revoke_minutes: state.auto_revoke_minutes.load(Ordering::Relaxed),
    }
}

#[tauri::command]
pub async fn mcp_get_status(
    app: tauri::AppHandle,
    state: tauri::State<'_, McpState>,
    secrets: tauri::State<'_, crate::modules::secrets::SecretsState>,
) -> Result<McpStatus, String> {
    let token = crate::modules::secrets::get_password(&app, &secrets, MCP_SERVICE, MCP_TOKEN_ACCOUNT)?;
    Ok(build_status(&state, token))
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
        Ok(build_status(&state, Some(token)))
    } else {
        state.enabled.store(false, Ordering::Relaxed);
        server::stop(state.inner());
        state.grants.lock().map_err(|e| e.to_string())?.clear();
        Ok(build_status(&state, None))
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
    Ok(build_status(&state, Some(token)))
}

/// Changes the port the bridge listens on. If currently enabled, restarts
/// the listener immediately so the change takes effect without requiring a
/// separate disable/enable cycle.
#[tauri::command]
pub async fn mcp_set_port(
    port: u16,
    app: tauri::AppHandle,
    state: tauri::State<'_, McpState>,
    secrets: tauri::State<'_, crate::modules::secrets::SecretsState>,
) -> Result<McpStatus, String> {
    state.port.store(port, Ordering::Relaxed);
    if state.enabled.load(Ordering::Relaxed) {
        let token = crate::modules::secrets::get_password(&app, &secrets, MCP_SERVICE, MCP_TOKEN_ACCOUNT)?
            .unwrap_or_default();
        server::ensure_started(app.clone(), state.inner().clone(), token.clone());
        return Ok(build_status(&state, Some(token)));
    }
    Ok(build_status(&state, None))
}

#[tauri::command]
pub async fn mcp_set_max_command_timeout_secs(secs: u64, state: tauri::State<'_, McpState>) -> Result<(), String> {
    state.max_command_timeout_ms.store(secs.saturating_mul(1000), Ordering::Relaxed);
    Ok(())
}

#[tauri::command]
pub async fn mcp_set_auto_revoke_minutes(minutes: u32, state: tauri::State<'_, McpState>) -> Result<(), String> {
    state.auto_revoke_minutes.store(minutes, Ordering::Relaxed);
    Ok(())
}

/// Frontend-driven grant/revoke for one tab. Called on every toggle change
/// *and* on every SSH reconnect (with the same `tab_id`, new `session_id`) so
/// a grant never silently goes stale across a jump-host rebind. Refuses to
/// grant an SSH tab whose host has "Block AI Agent Access" enabled.
#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn mcp_set_session_grant(
    tab_id: String,
    session_id: String,
    granted: bool,
    label: String,
    kind: SessionKind,
    local_pty_id: Option<u32>,
    host_id: Option<String>,
    app: tauri::AppHandle,
    state: tauri::State<'_, McpState>,
) -> Result<(), String> {
    if granted {
        if let Some(hid) = &host_id {
            if host_blocks_agent_access(&app, hid)? {
                return Err("this host has AI agent access blocked in its settings".to_string());
            }
        }
        let mut map = state.grants.lock().map_err(|e| e.to_string())?;
        map.insert(
            tab_id.clone(),
            SessionGrant { tab_id: tab_id.clone(), session_id, granted, label, kind, local_pty_id, host_id },
        );
        drop(map);
        state.touch(&tab_id);
    } else {
        let mut map = state.grants.lock().map_err(|e| e.to_string())?;
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

/// Background sweep, started once at app startup regardless of whether the
/// bridge is currently enabled (cheap no-op when `auto_revoke_minutes == 0`
/// or there are no grants). Revokes any tab whose last grant/activity
/// timestamp is older than the configured window and notifies the frontend
/// via `mcp_grant_expired` so its local mirror (badge, context-menu checkbox)
/// clears without waiting for the user to notice.
pub fn spawn_auto_revoke_sweeper(app: tauri::AppHandle, state: McpState) {
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(AUTO_REVOKE_SWEEP_INTERVAL).await;
            let minutes = state.auto_revoke_minutes.load(Ordering::Relaxed);
            if minutes == 0 {
                continue;
            }
            let cutoff = Duration::from_secs(minutes as u64 * 60);
            let now = Instant::now();
            let expired: Vec<String> = {
                let last_used = state.last_used.lock().unwrap();
                last_used
                    .iter()
                    .filter(|(_, t)| now.duration_since(**t) > cutoff)
                    .map(|(k, _)| k.clone())
                    .collect()
            };
            if expired.is_empty() {
                continue;
            }
            {
                let mut grants = state.grants.lock().unwrap();
                let mut last_used = state.last_used.lock().unwrap();
                for tab_id in &expired {
                    grants.remove(tab_id);
                    last_used.remove(tab_id);
                }
            }
            for tab_id in expired {
                let _ = app.emit("mcp_grant_expired", serde_json::json!({ "tab_id": tab_id }));
            }
        }
    });
}
