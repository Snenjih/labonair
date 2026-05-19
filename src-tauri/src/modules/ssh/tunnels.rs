use std::collections::HashMap;
use std::io;
use std::net::{TcpListener, TcpStream};
use std::sync::{Arc, Mutex};

use serde::Deserialize;

#[derive(Debug, Clone, Deserialize)]
pub struct TunnelConfig {
    pub id: String,
    #[serde(rename = "type")]
    pub tunnel_type: String,
    pub local_port: u16,
    pub remote_host: String,
    pub remote_port: u16,
}

/// Shutdown senders keyed by host_id. Dropping the sender signals the accept loop to stop.
pub struct TunnelState(pub Arc<Mutex<HashMap<String, tokio::sync::oneshot::Sender<()>>>>);

impl Default for TunnelState {
    fn default() -> Self {
        TunnelState(Arc::new(Mutex::new(HashMap::new())))
    }
}

/// Copy bytes from `reader` to `writer` on a dedicated thread.
fn pump(mut reader: impl io::Read + Send + 'static, mut writer: impl io::Write + Send + 'static) {
    std::thread::spawn(move || {
        let _ = io::copy(&mut reader, &mut writer);
    });
}

/// Handles one accepted TCP connection by opening a direct-tcpip channel and
/// pumping data bidirectionally.  Runs on its own thread.
fn handle_connection(stream: TcpStream, session: Arc<Mutex<super::SessionHandle>>, remote_host: String, remote_port: u16) {
    std::thread::spawn(move || {
        let channel = {
            let sess = match session.lock() {
                Ok(s) => s,
                Err(_) => return,
            };
            sess.0.channel_direct_tcpip(&remote_host, remote_port as u32, None)
        };
        let channel = match channel {
            Ok(c) => c,
            Err(e) => {
                log::warn!("tunnel: channel_direct_tcpip failed: {e}");
                return;
            }
        };

        let stream_clone = match stream.try_clone() {
            Ok(s) => s,
            Err(_) => return,
        };

        // ssh2::Channel implements Read + Write but is not Clone, so we use a
        // shared Arc<Mutex> to let two threads access it.
        let chan = Arc::new(Mutex::new(channel));
        let chan2 = chan.clone();

        // TCP → SSH
        {
            let mut tcp_r = stream;
            let chan_w = chan;
            std::thread::spawn(move || {
                let mut buf = [0u8; 8192];
                loop {
                    let n = match tcp_r.read(&mut buf) {
                        Ok(0) | Err(_) => break,
                        Ok(n) => n,
                    };
                    if let Ok(mut c) = chan_w.lock() {
                        if c.write_all(&buf[..n]).is_err() { break; }
                    } else { break; }
                }
                // Signal EOF to the channel
                if let Ok(mut c) = chan_w.lock() { let _ = c.send_eof(); }
            });
        }

        // SSH → TCP
        {
            let mut tcp_w = stream_clone;
            let chan_r = chan2;
            std::thread::spawn(move || {
                let mut buf = [0u8; 8192];
                loop {
                    let n = {
                        let mut c = match chan_r.lock() {
                            Ok(c) => c,
                            Err(_) => break,
                        };
                        match c.read(&mut buf) {
                            Ok(0) | Err(_) => break,
                            Ok(n) => n,
                        }
                    };
                    if tcp_w.write_all(&buf[..n]).is_err() { break; }
                }
            });
        }
    });
}

/// `ssh_start_tunnels` establishes a *dedicated* secondary SSH connection for
/// port forwarding so it never contends with the interactive terminal's Mutex.
#[tauri::command]
pub async fn ssh_start_tunnels(
    host_id: String,
    tunnel_state: tauri::State<'_, TunnelState>,
    hosts_db: tauri::State<'_, crate::modules::hosts::HostsDb>,
    secrets: tauri::State<'_, crate::modules::secrets::SecretsState>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    // Guard: if tunnels are already running for this host, do nothing.
    {
        let map = tunnel_state.0.lock().map_err(|e| e.to_string())?;
        if map.contains_key(&host_id) {
            return Ok(());
        }
    }

    // Fetch host row.
    let (host_address, port, username, auth_method, private_key_path, tunnels_json) = {
        let conn = hosts_db.0.lock().map_err(|e| e.to_string())?;
        conn.query_row(
            "SELECT host_address, port, username, auth_method, private_key_path, tunnels \
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
                ))
            },
        )
        .map_err(|e| e.to_string())?
    };

    // Parse tunnels JSON; if empty or null, nothing to do.
    let tunnels: Vec<TunnelConfig> = match tunnels_json.as_deref() {
        Some(j) if !j.is_empty() && j != "[]" => {
            serde_json::from_str(j).unwrap_or_default()
        }
        _ => return Ok(()),
    };

    if tunnels.is_empty() {
        return Ok(());
    }

    // Fetch password.
    let password: Option<String> = if auth_method == "password" {
        crate::modules::secrets::get_password(&app, &secrets, "nexum-app", &host_id)
            .ok()
            .flatten()
    } else {
        None
    };

    let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel::<()>();

    // Register the shutdown sender before spawning so stop can be called immediately.
    {
        let mut map = tunnel_state.0.lock().map_err(|e| e.to_string())?;
        map.insert(host_id.clone(), shutdown_tx);
    }

    let host_id_for_cleanup = host_id.clone();
    let tunnel_state_arc = tunnel_state.0.clone();

    tokio::task::spawn_blocking(move || {
        run_tunnel_loop(
            host_address, port as u32, username, auth_method,
            private_key_path, password, tunnels,
            shutdown_rx, host_id_for_cleanup, tunnel_state_arc,
        );
    });

    Ok(())
}

fn run_tunnel_loop(
    host_address: String,
    port: u32,
    username: String,
    auth_method: String,
    private_key_path: Option<String>,
    password: Option<String>,
    tunnels: Vec<TunnelConfig>,
    mut shutdown_rx: tokio::sync::oneshot::Receiver<()>,
    host_id: String,
    tunnel_state: Arc<Mutex<HashMap<String, tokio::sync::oneshot::Sender<()>>>>,
) {
    // Build a dedicated SSH session.
    let tcp = match std::net::TcpStream::connect(format!("{host_address}:{port}")) {
        Ok(t) => t,
        Err(e) => {
            log::error!("tunnel: TCP connect failed: {e}");
            tunnel_state.lock().ok().map(|mut m| m.remove(&host_id));
            return;
        }
    };

    let mut session = match ssh2::Session::new() {
        Ok(s) => s,
        Err(e) => {
            log::error!("tunnel: session create failed: {e}");
            tunnel_state.lock().ok().map(|mut m| m.remove(&host_id));
            return;
        }
    };
    session.set_tcp_stream(tcp);
    if let Err(e) = session.handshake() {
        log::error!("tunnel: handshake failed: {e}");
        tunnel_state.lock().ok().map(|mut m| m.remove(&host_id));
        return;
    }

    // Authenticate.
    let auth_ok = match auth_method.as_str() {
        "password" => {
            if let Some(pw) = &password {
                session.userauth_password(&username, pw).is_ok()
            } else {
                false
            }
        }
        "key" => {
            let key_path = private_key_path.as_deref().map(std::path::Path::new);
            session.userauth_pubkey_file(&username, None, key_path.unwrap_or(std::path::Path::new("")), None).is_ok()
        }
        _ => false,
    };

    if !auth_ok || !session.authenticated() {
        log::error!("tunnel: authentication failed for {username}@{host_address}");
        tunnel_state.lock().ok().map(|mut m| m.remove(&host_id));
        return;
    }

    let session_arc = Arc::new(Mutex::new(super::SessionHandle(session)));

    // Bind listeners for each tunnel; skip on port-in-use errors.
    let mut listeners: Vec<(TcpListener, TunnelConfig)> = Vec::new();
    for tunnel in &tunnels {
        match TcpListener::bind(format!("127.0.0.1:{}", tunnel.local_port)) {
            Ok(listener) => {
                if let Err(e) = listener.set_nonblocking(false) {
                    log::warn!("tunnel: set_nonblocking failed for port {}: {e}", tunnel.local_port);
                }
                log::info!("tunnel: bound 127.0.0.1:{} → {}:{}", tunnel.local_port, tunnel.remote_host, tunnel.remote_port);
                listeners.push((listener, tunnel.clone()));
            }
            Err(e) => {
                log::warn!("tunnel: failed to bind port {}: {e} — skipping", tunnel.local_port);
            }
        }
    }

    if listeners.is_empty() {
        tunnel_state.lock().ok().map(|mut m| m.remove(&host_id));
        return;
    }

    // Accept loop — runs until shutdown signal is received.
    let mut thread_handles: Vec<std::thread::JoinHandle<()>> = Vec::new();

    for (listener, config) in listeners {
        let sess = session_arc.clone();
        let remote_host = config.remote_host.clone();
        let remote_port = config.remote_port;
        let handle = std::thread::spawn(move || {
            for stream in listener.incoming() {
                match stream {
                    Ok(s) => handle_connection(s, sess.clone(), remote_host.clone(), remote_port),
                    Err(e) => {
                        if e.kind() == io::ErrorKind::WouldBlock {
                            std::thread::sleep(std::time::Duration::from_millis(10));
                        } else {
                            break;
                        }
                    }
                }
            }
        });
        thread_handles.push(handle);
    }

    // Block until shutdown signal.
    let _ = shutdown_rx.try_recv();
    // Poll until signal arrives; this is in a spawn_blocking context so blocking is fine.
    loop {
        match shutdown_rx.try_recv() {
            Ok(_) | Err(tokio::sync::oneshot::error::TryRecvError::Closed) => break,
            Err(tokio::sync::oneshot::error::TryRecvError::Empty) => {
                std::thread::sleep(std::time::Duration::from_millis(200));
            }
        }
    }

    // Cleanup — listeners will be dropped when threads finish naturally.
    tunnel_state.lock().ok().map(|mut m| m.remove(&host_id));
    log::info!("tunnel: stopped tunnels for host {host_id}");
}

/// Stop all tunnels for a specific host by sending the shutdown signal.
#[tauri::command]
pub async fn ssh_stop_tunnels(
    host_id: String,
    tunnel_state: tauri::State<'_, TunnelState>,
) -> Result<(), String> {
    let mut map = tunnel_state.0.lock().map_err(|e| e.to_string())?;
    if let Some(tx) = map.remove(&host_id) {
        let _ = tx.send(());
    }
    Ok(())
}
