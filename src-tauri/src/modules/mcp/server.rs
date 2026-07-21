use std::sync::Arc;
use std::time::Duration;

use rmcp::{
    Json, ServerHandler,
    handler::server::{router::tool::ToolRouter, wrapper::Parameters},
    model::{ServerCapabilities, ServerInfo},
    tool, tool_handler, tool_router,
    transport::streamable_http_server::{
        StreamableHttpServerConfig, StreamableHttpService, session::local::LocalSessionManager,
    },
};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use tauri::{Emitter, Manager};
use tokio_util::sync::CancellationToken;

use crate::modules::hosts::HostsDb;
use crate::modules::secrets::SecretsState;
use crate::modules::ssh::SshState;

use super::osc133::Osc133Capture;
use super::{McpState, TabOpResult};

/// Writes `data` into the live interactive PTY of `session_id`, byte-for-byte
/// the same code path `ssh::pty::ssh_pty_write` uses — the command lands
/// visibly in the terminal pane the user is watching, indistinguishable from
/// the user typing it themselves.
async fn write_to_session(app: &tauri::AppHandle, session_id: &str, data: String) -> Result<(), String> {
    let state = app.state::<SshState>();
    let session = crate::get_session_arc!(state, session_id);
    let write_half = {
        let guard = session.pty.lock().await;
        guard.as_ref().map(|p| p.write_half.clone())
    }
    .ok_or_else(|| "no pty channel open".to_string())?;
    write_half.data_bytes(data).await.map_err(|e| e.to_string())
}

/// Mirrors the host → credential → stored-secret resolution `ssh_connect`
/// performs (see `ssh/client.rs`), but only to answer "would connecting to
/// this host require an interactive prompt (passphrase/2FA/manual
/// password)?" — used to gate the `open_tab` tool, which has no UI to show
/// such a prompt on. An encrypted key with no stored passphrase is
/// indistinguishable here from an unencrypted key (both report `has_secret
/// == false`/no stored secret); either way, no stored secret means this
/// function refuses rather than risk hanging on a prompt nobody can answer.
async fn require_non_interactive_auth(app: &tauri::AppHandle, host_id: &str) -> Result<(), String> {
    let hosts_db = app.state::<HostsDb>();
    let (auth_method, credential_id): (String, Option<String>) = {
        let conn = hosts_db.0.lock().map_err(|e| e.to_string())?;
        conn.query_row(
            "SELECT auth_method, credential_id FROM hosts WHERE id = ?1",
            rusqlite::params![host_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|_| format!("host '{host_id}' not found"))?
    };

    let auth_method = if let Some(cid) = &credential_id {
        let conn = hosts_db.0.lock().map_err(|e| e.to_string())?;
        conn.query_row("SELECT cred_type FROM credentials WHERE id = ?1", rusqlite::params![cid], |r| {
            r.get::<_, String>(0)
        })
        .map_err(|_| format!("credential '{cid}' not found"))?
    } else {
        auth_method
    };

    if auth_method == "none" {
        return Ok(());
    }

    let secrets = app.state::<SecretsState>();
    let (service, account): (&str, &str) = match credential_id.as_deref() {
        Some(cid) => ("labonair-cred", cid),
        None => ("labonair-app", host_id),
    };
    let has_secret = crate::modules::secrets::get_password(app, &secrets, service, account)?.is_some();
    if !has_secret {
        return Err(
            "this host requires interactive authentication (no stored password/passphrase found) — \
             connect to it manually in the app once, then retry"
                .to_string(),
        );
    }
    Ok(())
}

#[derive(Deserialize, JsonSchema)]
struct EmptyParams {}

#[derive(Serialize, JsonSchema)]
struct SessionInfo {
    tab_id: String,
    session_id: String,
    label: String,
}

#[derive(Serialize, JsonSchema)]
struct ListSessionsResult {
    sessions: Vec<SessionInfo>,
}

#[derive(Deserialize, JsonSchema)]
struct RunCommandParams {
    session_id: String,
    command: String,
    /// Defaults to 30000 (30s). If the command hasn't finished by then,
    /// returns whatever output has been captured so far with
    /// `still_running: true` instead of blocking indefinitely.
    timeout_ms: Option<u64>,
}

#[derive(Serialize, JsonSchema)]
struct RunCommandResult {
    output: String,
    exit_code: Option<i32>,
    still_running: bool,
}

#[derive(Deserialize, JsonSchema)]
struct ReadOutputParams {
    session_id: String,
    /// How long to wait for new output before returning, in milliseconds.
    /// Defaults to 1000. This is a live peek, not scrollback history — it
    /// only ever returns output produced after this call starts.
    wait_ms: Option<u64>,
}

#[derive(Serialize, JsonSchema)]
struct ReadOutputResult {
    output: String,
}

#[derive(Deserialize, JsonSchema)]
struct SendKeysParams {
    session_id: String,
    data: String,
}

#[derive(Deserialize, JsonSchema)]
struct OpenTabParams {
    host_id: String,
}

#[derive(Serialize, JsonSchema)]
struct OpenTabResult {
    tab_id: String,
    session_id: String,
}

#[derive(Deserialize, JsonSchema)]
struct CloseTabParams {
    session_id: String,
}

#[derive(Clone)]
pub struct LabonairMcpServer {
    tool_router: ToolRouter<Self>,
    app: tauri::AppHandle,
    mcp_state: McpState,
}

impl LabonairMcpServer {
    fn new(app: tauri::AppHandle, mcp_state: McpState) -> Self {
        Self { tool_router: Self::tool_router(), app, mcp_state }
    }
}

#[tool_router]
impl LabonairMcpServer {
    #[tool(
        description = "List SSH terminal tabs in the Labonair app that the user has explicitly granted this agent access to. Only tabs with agent access enabled appear here — if a tab you need isn't listed, ask the user to enable agent access for it, then call this again. The list always reflects the current grant state."
    )]
    async fn list_sessions(&self, _params: Parameters<EmptyParams>) -> Result<Json<ListSessionsResult>, String> {
        let map = self.mcp_state.grants.lock().map_err(|e| e.to_string())?;
        let sessions = map
            .values()
            .filter(|g| g.granted)
            .map(|g| SessionInfo {
                tab_id: g.tab_id.clone(),
                session_id: g.session_id.clone(),
                label: g.label.clone(),
            })
            .collect();
        Ok(Json(ListSessionsResult { sessions }))
    }

    #[tool(
        description = "Run a shell command in a Labonair SSH terminal tab the user has granted agent access to. The command is typed and executed visibly in the real terminal pane the user is watching — exactly as if they had typed it themselves, not a hidden background shell. Returns captured output and exit code once the shell prompt returns, or partial output with still_running=true if it exceeds timeout_ms (e.g. a long-running process, or one waiting for interactive input — use send_keys to interact with it, or read_output to check on it later)."
    )]
    async fn run_command(&self, Parameters(params): Parameters<RunCommandParams>) -> Result<Json<RunCommandResult>, String> {
        self.mcp_state
            .grant_for_session(&params.session_id)
            .ok_or_else(|| "session not granted — call list_sessions to see currently granted tabs".to_string())?;

        let lock = self.mcp_state.lock_for(&params.session_id);
        let _guard = lock.lock().await;

        let ssh_state = self.app.state::<SshState>();
        let session = crate::get_session_arc!(ssh_state, &params.session_id);
        let mut rx = session.agent_tap.subscribe();
        drop(session);

        write_to_session(&self.app, &params.session_id, format!("{}\n", params.command)).await?;

        let timeout = Duration::from_millis(params.timeout_ms.unwrap_or(30_000));
        let deadline = std::time::Instant::now() + timeout;
        let mut capture = Osc133Capture::new();

        loop {
            let remaining = deadline.saturating_duration_since(std::time::Instant::now());
            if remaining.is_zero() {
                return Ok(Json(RunCommandResult {
                    output: capture.clean_output().to_string(),
                    exit_code: None,
                    still_running: true,
                }));
            }
            match tokio::time::timeout(remaining, rx.recv()).await {
                Ok(Ok(chunk)) => {
                    capture.feed(&chunk);
                    if let Some(code) = capture.finished() {
                        return Ok(Json(RunCommandResult {
                            output: capture.clean_output().to_string(),
                            exit_code: code,
                            still_running: false,
                        }));
                    }
                }
                Ok(Err(_)) => {
                    return Err(
                        "output stream interrupted (session closed, or capture fell behind) — the command may still be running in the visible terminal".to_string(),
                    );
                }
                Err(_elapsed) => {
                    return Ok(Json(RunCommandResult {
                        output: capture.clean_output().to_string(),
                        exit_code: None,
                        still_running: true,
                    }));
                }
            }
        }
    }

    #[tool(
        description = "Peek at live output from a granted SSH tab without running anything — useful for checking progress of a long-running command started via run_command (still_running=true). Waits up to wait_ms (default 1000) for new output to arrive. This is a live peek, not scrollback history: it never includes output produced before this call."
    )]
    async fn read_output(&self, Parameters(params): Parameters<ReadOutputParams>) -> Result<Json<ReadOutputResult>, String> {
        self.mcp_state
            .grant_for_session(&params.session_id)
            .ok_or_else(|| "session not granted — call list_sessions to see currently granted tabs".to_string())?;

        let ssh_state = self.app.state::<SshState>();
        let session = crate::get_session_arc!(ssh_state, &params.session_id);
        let mut rx = session.agent_tap.subscribe();
        drop(session);

        let deadline = std::time::Instant::now() + Duration::from_millis(params.wait_ms.unwrap_or(1000));
        let mut capture = Osc133Capture::new();
        loop {
            let remaining = deadline.saturating_duration_since(std::time::Instant::now());
            if remaining.is_zero() {
                break;
            }
            match tokio::time::timeout(remaining, rx.recv()).await {
                Ok(Ok(chunk)) => capture.feed(&chunk),
                _ => break,
            }
        }
        Ok(Json(ReadOutputResult { output: capture.clean_output().to_string() }))
    }

    #[tool(
        description = "Send raw keystrokes to a granted SSH tab without waiting for a command-finished marker — use for interactive prompts (sudo password, y/n confirmations) or control characters (e.g. \"\\u0003\" for Ctrl+C to interrupt a stuck command started via run_command)."
    )]
    async fn send_keys(&self, Parameters(params): Parameters<SendKeysParams>) -> Result<String, String> {
        self.mcp_state
            .grant_for_session(&params.session_id)
            .ok_or_else(|| "session not granted — call list_sessions to see currently granted tabs".to_string())?;
        write_to_session(&self.app, &params.session_id, params.data).await?;
        Ok("sent".to_string())
    }

    #[tool(
        description = "Open a new SSH terminal tab to a saved Labonair host, visible in the app, and automatically grant this agent access to it. Only works for hosts with a fully stored, non-interactive password or key (no 2FA/passphrase prompt) — otherwise returns an error asking the user to connect manually first."
    )]
    async fn open_tab(&self, Parameters(params): Parameters<OpenTabParams>) -> Result<Json<OpenTabResult>, String> {
        require_non_interactive_auth(&self.app, &params.host_id).await?;

        let request_id = uuid::Uuid::new_v4().to_string();
        let (tx, rx) = tokio::sync::oneshot::channel::<TabOpResult>();
        {
            let mut map = self.mcp_state.pending_tab_ops.lock().map_err(|e| e.to_string())?;
            map.insert(request_id.clone(), tx);
        }
        self.app
            .emit("mcp_open_tab_request", serde_json::json!({ "request_id": request_id, "host_id": params.host_id }))
            .map_err(|e| e.to_string())?;

        let result = match tokio::time::timeout(Duration::from_secs(15), rx).await {
            Ok(Ok(r)) => r,
            _ => {
                let _ = self.mcp_state.pending_tab_ops.lock().map(|mut m| m.remove(&request_id));
                return Err("timed out waiting for the app to open the tab (is Labonair running?)".to_string());
            }
        };
        if !result.ok {
            return Err(result.error.unwrap_or_else(|| "failed to open tab".to_string()));
        }
        let tab_id = result.tab_id.ok_or("missing tab_id in response")?;
        let session_id = result.session_id.ok_or("missing session_id in response")?;
        Ok(Json(OpenTabResult { tab_id, session_id }))
    }

    #[tool(
        description = "Close an existing SSH terminal tab by session_id. Closes immediately without prompting the user for any unsaved-changes confirmation — only use this on tabs you are sure are safe to close."
    )]
    async fn close_tab(&self, Parameters(params): Parameters<CloseTabParams>) -> Result<String, String> {
        self.mcp_state
            .grant_for_session(&params.session_id)
            .ok_or_else(|| "session not granted — call list_sessions to see currently granted tabs".to_string())?;

        let request_id = uuid::Uuid::new_v4().to_string();
        let (tx, rx) = tokio::sync::oneshot::channel::<TabOpResult>();
        {
            let mut map = self.mcp_state.pending_tab_ops.lock().map_err(|e| e.to_string())?;
            map.insert(request_id.clone(), tx);
        }
        self.app
            .emit("mcp_close_tab_request", serde_json::json!({ "request_id": request_id, "session_id": params.session_id }))
            .map_err(|e| e.to_string())?;

        let result = match tokio::time::timeout(Duration::from_secs(10), rx).await {
            Ok(Ok(r)) => r,
            _ => {
                let _ = self.mcp_state.pending_tab_ops.lock().map(|mut m| m.remove(&request_id));
                return Err("timed out waiting for the app to close the tab".to_string());
            }
        };
        if !result.ok {
            return Err(result.error.unwrap_or_else(|| "failed to close tab".to_string()));
        }
        Ok("closed".to_string())
    }
}

#[tool_handler(router = self.tool_router)]
impl ServerHandler for LabonairMcpServer {
    fn get_info(&self) -> ServerInfo {
        ServerInfo::new(ServerCapabilities::builder().enable_tools().build())
    }
}

/// Starts (or restarts) the MCP Streamable-HTTP server bound to
/// `127.0.0.1:<mcp_state.port>`, guarded by a bearer-token check on every
/// request. Idempotent — always stops any previously running instance first,
/// so re-enabling the bridge or regenerating the token never leaves a stale
/// listener behind.
pub fn ensure_started(app: tauri::AppHandle, mcp_state: McpState, token: String) {
    stop(&mcp_state);

    let ct = CancellationToken::new();
    {
        let mut slot = mcp_state.server_shutdown.lock().unwrap();
        *slot = Some(ct.clone());
    }

    let port = mcp_state.port;
    let token = Arc::new(token);

    tauri::async_runtime::spawn(async move {
        let factory_app = app.clone();
        let factory_state = mcp_state.clone();
        let server_ct = ct.child_token();

        let service: StreamableHttpService<LabonairMcpServer, LocalSessionManager> = StreamableHttpService::new(
            move || Ok(LabonairMcpServer::new(factory_app.clone(), factory_state.clone())),
            Default::default(),
            StreamableHttpServerConfig::default().with_cancellation_token(server_ct),
        );

        let expected_token = token;
        let router = axum::Router::new().nest_service("/mcp", service).layer(axum::middleware::from_fn(
            move |req: axum::extract::Request, next: axum::middleware::Next| {
                let expected = expected_token.clone();
                async move {
                    let authorized = req
                        .headers()
                        .get(axum::http::header::AUTHORIZATION)
                        .and_then(|v| v.to_str().ok())
                        .map(|v| v == format!("Bearer {expected}"))
                        .unwrap_or(false);
                    if !authorized {
                        return axum::response::Response::builder()
                            .status(axum::http::StatusCode::UNAUTHORIZED)
                            .body(axum::body::Body::empty())
                            .unwrap();
                    }
                    next.run(req).await
                }
            },
        ));

        let listener = match tokio::net::TcpListener::bind(("127.0.0.1", port)).await {
            Ok(l) => l,
            Err(e) => {
                log::error!("mcp: failed to bind 127.0.0.1:{port}: {e}");
                return;
            }
        };
        let _ = axum::serve(listener, router).with_graceful_shutdown(async move { ct.cancelled_owned().await }).await;
    });
}

/// Cancels any currently running MCP server task. Safe to call even if
/// nothing is running.
pub fn stop(mcp_state: &McpState) {
    if let Ok(mut slot) = mcp_state.server_shutdown.lock() {
        if let Some(ct) = slot.take() {
            ct.cancel();
        }
    }
}
