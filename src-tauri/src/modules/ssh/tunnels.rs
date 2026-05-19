use std::collections::HashMap;
use std::io::{self, Read, Write};
use std::net::TcpListener;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use serde::Deserialize;

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

/// Single-thread, non-blocking polling loop for one TCP↔SSH connection.
/// No Arc<Mutex<Channel>> — this thread owns the channel exclusively, so
/// there is no deadlock regardless of which side speaks first.
/// The SSH session is set to non-blocking mode before this is called, so
/// channel.read() returns immediately with WouldBlock when no data is ready.
fn handle_connection(
    mut stream: std::net::TcpStream,
    session: Arc<Mutex<super::SessionHandle>>,
    remote_host: String,
    remote_port: u16,
) {
    std::thread::spawn(move || {
        // Open channel while briefly holding the session lock.
        let channel = {
            let sess = match session.lock() {
                Ok(s) => s,
                Err(_) => return,
            };
            sess.0.channel_direct_tcpip(&remote_host, remote_port, None)
        };
        let mut channel = match channel {
            Ok(c) => c,
            Err(e) => {
                log::warn!("tunnel: channel_direct_tcpip failed: {e}");
                return;
            }
        };

        // Non-blocking TCP so reads return immediately with WouldBlock.
        stream.set_nonblocking(true).ok();

        let mut tcp_buf = [0u8; 16384];
        let mut ssh_buf = [0u8; 16384];

        // Single-thread polling: alternates TCP→SSH and SSH→TCP.
        // No two threads hold the channel — deadlock is structurally impossible.
        loop {
            let mut idle = true;

            // TCP → SSH
            match stream.read(&mut tcp_buf) {
                Ok(0) => break,
                Ok(n) => {
                    if channel.write_all(&tcp_buf[..n]).is_err() {
                        break;
                    }
                    idle = false;
                }
                Err(e) if e.kind() == io::ErrorKind::WouldBlock => {}
                Err(_) => break,
            }

            // SSH → TCP (non-blocking because session is set_blocking(false))
            let n = match channel.read(&mut ssh_buf) {
                Ok(0) => break,
                Ok(n) => {
                    idle = false;
                    n
                }
                Err(e) if e.kind() == io::ErrorKind::WouldBlock => 0,
                Err(_) => break,
            };
            if n > 0 && stream.write_all(&ssh_buf[..n]).is_err() {
                break;
            }

            if channel.eof() {
                break;
            }
            if idle {
                std::thread::sleep(std::time::Duration::from_millis(1));
            }
        }

        let _ = channel.send_eof();
        let _ = channel.close();
        let _ = channel.wait_close();
    });
}

#[tauri::command]
pub async fn ssh_start_tunnels(
    host_id: String,
    tunnel_state: tauri::State<'_, TunnelState>,
    hosts_db: tauri::State<'_, crate::modules::hosts::HostsDb>,
    secrets: tauri::State<'_, crate::modules::secrets::SecretsState>,
    app: tauri::AppHandle,
) -> Result<(), String> {
    // If tunnel already running for this host, just increment the ref count.
    {
        let mut map = tunnel_state.0.lock().map_err(|e| e.to_string())?;
        if let Some(entry) = map.get_mut(&host_id) {
            entry.ref_count += 1;
            return Ok(());
        }
    }

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

    let tunnels: Vec<TunnelConfig> = match tunnels_json.as_deref() {
        Some(j) if !j.is_empty() && j != "[]" => serde_json::from_str(j).unwrap_or_default(),
        _ => return Ok(()),
    };

    if tunnels.is_empty() {
        return Ok(());
    }

    let password: Option<String> = if auth_method == "password" {
        crate::modules::secrets::get_password(&app, &secrets, "nexum-app", &host_id)
            .ok()
            .flatten()
    } else {
        None
    };

    let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel::<()>();

    {
        let mut map = tunnel_state.0.lock().map_err(|e| e.to_string())?;
        map.insert(host_id.clone(), TunnelEntry { shutdown: shutdown_tx, ref_count: 1 });
    }

    let host_id_clone = host_id.clone();
    let state_arc = tunnel_state.0.clone();

    tokio::task::spawn_blocking(move || {
        run_tunnel_loop(
            host_address,
            port as u32,
            username,
            auth_method,
            private_key_path,
            password,
            tunnels,
            shutdown_rx,
            host_id_clone,
            state_arc,
        );
    });

    Ok(())
}

#[allow(clippy::too_many_arguments)]
fn run_tunnel_loop(
    host_address: String,
    port: u32,
    username: String,
    auth_method: String,
    private_key_path: Option<String>,
    password: Option<String>,
    tunnels: Vec<TunnelConfig>,
    shutdown_rx: tokio::sync::oneshot::Receiver<()>,
    host_id: String,
    tunnel_state: TunnelMap,
) {
    // Build dedicated SSH session.
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

    let auth_ok = match auth_method.as_str() {
        "password" => password
            .as_deref()
            .map(|pw| session.userauth_password(&username, pw).is_ok())
            .unwrap_or(false),
        "key" => {
            let key = private_key_path.as_deref().unwrap_or("");
            session
                .userauth_pubkey_file(&username, None, std::path::Path::new(key), None)
                .is_ok()
        }
        _ => false,
    };

    if !auth_ok || !session.authenticated() {
        log::error!("tunnel: auth failed for {username}@{host_address}");
        tunnel_state.lock().ok().map(|mut m| m.remove(&host_id));
        return;
    }

    // Non-blocking mode so channel reads/writes return WouldBlock instead of blocking.
    session.set_blocking(false);

    let session_arc = Arc::new(Mutex::new(super::SessionHandle(session)));

    // Bind listeners. Port-in-use errors are warned and skipped (§6.2).
    // Set non-blocking so accept threads can poll for shutdown without blocking forever (§6.3 fix).
    let mut listeners: Vec<(TcpListener, TunnelConfig, Arc<AtomicBool>)> = Vec::new();
    for tunnel in &tunnels {
        match TcpListener::bind(format!("127.0.0.1:{}", tunnel.local_port)) {
            Ok(listener) => {
                // Non-blocking: accept() returns WouldBlock immediately when no client.
                // This allows the loop to check the shutdown flag without hanging.
                listener.set_nonblocking(true).ok();
                log::info!(
                    "tunnel: bound 127.0.0.1:{} → {}:{}",
                    tunnel.local_port,
                    tunnel.remote_host,
                    tunnel.remote_port
                );
                let stop = Arc::new(AtomicBool::new(false));
                listeners.push((listener, tunnel.clone(), stop));
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
        tunnel_state.lock().ok().map(|mut m| m.remove(&host_id));
        return;
    }

    // Spawn one accept thread per listener. Each thread polls a shared AtomicBool for shutdown.
    let stop_flags: Vec<Arc<AtomicBool>> = listeners.iter().map(|(_, _, f)| f.clone()).collect();

    for (listener, config, stop_flag) in listeners {
        let sess = session_arc.clone();
        let remote_host = config.remote_host.clone();
        let remote_port = config.remote_port;

        std::thread::spawn(move || {
            loop {
                if stop_flag.load(Ordering::Relaxed) {
                    break;
                }
                match listener.accept() {
                    Ok((stream, _)) => {
                        handle_connection(stream, sess.clone(), remote_host.clone(), remote_port);
                    }
                    Err(e) if e.kind() == io::ErrorKind::WouldBlock => {
                        // No pending connection — check shutdown and yield.
                        std::thread::sleep(std::time::Duration::from_millis(20));
                    }
                    Err(_) => break,
                }
            }
        });
    }

    // Block until shutdown signal arrives (oneshot from ssh_stop_tunnels).
    let mut rx = shutdown_rx;
    loop {
        match rx.try_recv() {
            Ok(_) | Err(tokio::sync::oneshot::error::TryRecvError::Closed) => break,
            Err(tokio::sync::oneshot::error::TryRecvError::Empty) => {
                std::thread::sleep(std::time::Duration::from_millis(200));
            }
        }
    }

    // Signal all accept threads to exit cleanly.
    for flag in &stop_flags {
        flag.store(true, Ordering::Relaxed);
    }

    tunnel_state.lock().ok().map(|mut m| m.remove(&host_id));
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
