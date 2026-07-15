use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use serde::Deserialize;
use tokio::net::TcpListener;
use tokio_util::sync::CancellationToken;

#[derive(Debug, Clone, Deserialize)]
pub struct TunnelConfig {
    #[allow(dead_code)]
    pub id: String,
    #[serde(rename = "type")]
    #[allow(dead_code)]
    pub tunnel_type: String,
    pub local_port: u16,
    pub remote_host: String,
    pub remote_port: u16,
}

/// Per-host tunnel entry: shutdown sender + reference count of active SSH sessions.
/// The tunnel runs as long as ref_count > 0; ssh_stop_tunnels decrements and only
/// sends the shutdown signal when the count reaches zero.
pub(crate) struct TunnelEntry {
    shutdown: tokio::sync::oneshot::Sender<()>,
    ref_count: usize,
}

pub struct TunnelState(pub Arc<Mutex<HashMap<String, TunnelEntry>>>);

impl Default for TunnelState {
    fn default() -> Self {
        TunnelState(Arc::new(Mutex::new(HashMap::new())))
    }
}

pub type TunnelMap = Arc<Mutex<HashMap<String, TunnelEntry>>>;

/// Relays bytes between one accepted local TCP connection and a `direct-tcpip`
/// channel opened on the tunnel's shared SSH `Handle`. Replaces the old
/// per-connection OS thread that manually polled a non-blocking TCP stream
/// and SSH channel with 1ms sleeps: `Handle::channel_open_direct_tcpip`
/// (the same call `client.rs::connect_via_jump` uses for jump-host bridging)
/// gives us a `Channel`, whose `.into_stream()` adapter (also reused from
/// `client.rs`) implements `AsyncRead + AsyncWrite` — so the whole bridge is
/// one `tokio::io::copy_bidirectional` call, no manual read/write loop.
async fn handle_connection(
    mut stream: tokio::net::TcpStream,
    handle: Arc<russh::client::Handle<super::client::ClientHandler>>,
    remote_host: String,
    remote_port: u16,
    local_port: u16,
) {
    let channel = match handle
        .channel_open_direct_tcpip(remote_host, remote_port as u32, "127.0.0.1", local_port as u32)
        .await
    {
        Ok(c) => c,
        Err(e) => {
            log::warn!("tunnel: channel_open_direct_tcpip failed: {e}");
            return;
        }
    };

    let mut channel_stream = channel.into_stream();
    if let Err(e) = tokio::io::copy_bidirectional(&mut stream, &mut channel_stream).await {
        log::debug!("tunnel: connection closed: {e}");
    }
}

#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn ssh_start_tunnels(
    host_id: String,
    tunnel_state: tauri::State<'_, TunnelState>,
    hosts_db: tauri::State<'_, crate::modules::hosts::HostsDb>,
    secrets: tauri::State<'_, crate::modules::secrets::SecretsState>,
    trust_state: tauri::State<'_, super::TrustState>,
    app: tauri::AppHandle,
    connect_timeout_secs: Option<u64>,
) -> Result<(), String> {
    // If tunnel already running for this host, just increment the ref count.
    {
        let mut map = tunnel_state.0.lock().map_err(|e| e.to_string())?;
        if let Some(entry) = map.get_mut(&host_id) {
            entry.ref_count += 1;
            return Ok(());
        }
    }

    let (host_address, port, username, auth_method, private_key_path, tunnels_json, jump_host_id) = {
        let conn = hosts_db.0.lock().map_err(|e| e.to_string())?;
        conn.query_row(
            "SELECT host_address, port, username, auth_method, private_key_path, tunnels, jump_host_id \
             FROM hosts WHERE id = ?1",
            rusqlite::params![host_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, i64>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, Option<String>>(4)?,
                    row.get::<_, Option<String>>(5)?,
                    row.get::<_, Option<String>>(6)?,
                ))
            },
        )
        .map_err(|e| e.to_string())?
    };

    let tunnels: Vec<TunnelConfig> = match tunnels_json.as_deref() {
        Some(j) if !j.is_empty() && j != "[]" => serde_json::from_str(j).unwrap_or_default(),
        _ => return Ok(()),
    };

    if tunnels.is_empty() {
        return Ok(());
    }

    let password: Option<String> = if auth_method == "password" {
        crate::modules::secrets::get_password(&app, &secrets, "labonair-app", &host_id)
            .ok()
            .flatten()
    } else {
        None
    };

    // Resolve jump host fields (if any) — same helper the terminal/SFTP paths use.
    let jump = match jump_host_id.as_deref() {
        Some(jid) => Some(
            super::client::resolve_jump_host(&hosts_db, &secrets, &app, jid).map_err(|e| e.to_string())?,
        ),
        None => None,
    };

    let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel::<()>();

    {
        let mut map = tunnel_state.0.lock().map_err(|e| e.to_string())?;
        map.insert(host_id.clone(), TunnelEntry { shutdown: shutdown_tx, ref_count: 1 });
    }

    let host_id_clone = host_id.clone();
    let state_arc = tunnel_state.0.clone();
    let trust_inner = trust_state.inner().clone();
    let app_clone = app.clone();

    tokio::spawn(run_tunnel_loop(
        host_address,
        port,
        username,
        auth_method,
        private_key_path,
        password,
        jump,
        tunnels,
        shutdown_rx,
        host_id_clone,
        state_arc,
        trust_inner,
        app_clone,
        connect_timeout_secs,
    ));

    Ok(())
}

/// Connects and authenticates once (via the same shared
/// `establish_authenticated_session` helper the terminal/SFTP paths use —
/// giving tunnels agent auth, passphrase-protected-key support and real
/// known-hosts verification for the first time), then bridges local TCP
/// connections through `direct-tcpip` channels on that one session until
/// `shutdown_rx` fires. `fail_fast_untrusted_host=true` is passed since
/// tunnels have no trust-dialog UI of their own — an unrecognized/mismatched
/// host key fails the tunnel start cleanly instead of hanging.
#[allow(clippy::too_many_arguments)]
async fn run_tunnel_loop(
    host_address: String,
    port: i64,
    username: String,
    auth_method: String,
    private_key_path: Option<String>,
    password: Option<String>,
    jump: Option<super::client::JumpHostParams>,
    tunnels: Vec<TunnelConfig>,
    shutdown_rx: tokio::sync::oneshot::Receiver<()>,
    host_id: String,
    tunnel_state: TunnelMap,
    trust_state: super::TrustState,
    app: tauri::AppHandle,
    connect_timeout_secs: Option<u64>,
) {
    let session_id = format!("tunnel_{host_id}");

    let handle = match super::client::establish_authenticated_session(
        &session_id,
        &host_address,
        port,
        &username,
        &auth_method,
        private_key_path.as_deref(),
        None,
        None,
        password.as_deref(),
        None,
        &trust_state,
        &app,
        true,
        jump,
        connect_timeout_secs,
    )
    .await
    {
        Ok(h) => h,
        Err(e) => {
            log::error!("tunnel: failed to establish session for host {host_id}: {e}");
            if let Ok(mut m) = tunnel_state.lock() {
                m.remove(&host_id);
            }
            return;
        }
    };

    // Bind listeners. Port-in-use errors are warned and skipped.
    let mut listeners: Vec<(TcpListener, TunnelConfig)> = Vec::new();
    for tunnel in &tunnels {
        match TcpListener::bind(format!("127.0.0.1:{}", tunnel.local_port)).await {
            Ok(listener) => {
                log::info!(
                    "tunnel: bound 127.0.0.1:{} → {}:{}",
                    tunnel.local_port,
                    tunnel.remote_host,
                    tunnel.remote_port
                );
                listeners.push((listener, tunnel.clone()));
            }
            Err(e) => {
                log::warn!(
                    "tunnel: port {} already in use ({}), skipping",
                    tunnel.local_port,
                    e
                );
            }
        }
    }

    if listeners.is_empty() {
        if let Ok(mut m) = tunnel_state.lock() {
            m.remove(&host_id);
        }
        return;
    }

    // One accept task per listener, raced against a shared cancellation token
    // instead of polling a stop flag every 20ms — reacts to shutdown as soon
    // as `cancel.cancel()` is called, with no sleep in between.
    let cancel = CancellationToken::new();
    let mut accept_tasks = Vec::new();

    for (listener, config) in listeners {
        let handle = handle.clone();
        let cancel = cancel.clone();
        let remote_host = config.remote_host;
        let remote_port = config.remote_port;
        let local_port = config.local_port;

        accept_tasks.push(tokio::spawn(async move {
            loop {
                tokio::select! {
                    accepted = listener.accept() => {
                        match accepted {
                            Ok((stream, _)) => {
                                tokio::spawn(handle_connection(
                                    stream,
                                    handle.clone(),
                                    remote_host.clone(),
                                    remote_port,
                                    local_port,
                                ));
                            }
                            Err(e) => {
                                log::warn!("tunnel: accept failed: {e}");
                                break;
                            }
                        }
                    }
                    _ = cancel.cancelled() => break,
                }
            }
        }));
    }

    // Block until the shutdown signal arrives (oneshot from ssh_stop_tunnels),
    // then cancel all accept loops immediately — no sleep-poll teardown delay.
    let _ = shutdown_rx.await;
    cancel.cancel();
    for task in accept_tasks {
        let _ = task.await;
    }

    if let Ok(mut m) = tunnel_state.lock() {
        m.remove(&host_id);
    }
    log::info!("tunnel: stopped for host {host_id}");
}

#[tauri::command]
pub async fn ssh_stop_tunnels(
    host_id: String,
    tunnel_state: tauri::State<'_, TunnelState>,
) -> Result<(), String> {
    let mut map = tunnel_state.0.lock().map_err(|e| e.to_string())?;
    if let Some(entry) = map.get_mut(&host_id) {
        entry.ref_count = entry.ref_count.saturating_sub(1);
        if entry.ref_count == 0 {
            // Last SSH session for this host closed — shut down the tunnel.
            if let Some(entry) = map.remove(&host_id) {
                let _ = entry.shutdown.send(());
            }
        }
    }
    Ok(())
}
