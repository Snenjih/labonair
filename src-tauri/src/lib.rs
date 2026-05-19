mod modules;

use modules::{
    fs, pty, secrets, shell,
    hosts::{HostsDb, db::{initialize_db, hosts_get_all, hosts_create, hosts_update, hosts_delete, hosts_reorder, get_sudo_password, groups_get_all, groups_create, groups_delete}},
    ssh::{SshState, TrustState, client::{ssh_connect, ssh_connect_quick, ssh_trust_host, ssh_remove_known_host, ssh_disconnect}, exec::ssh_exec_command, pty::{ssh_pty_write, ssh_pty_resize}, sftp::{sftp_read_dir, sftp_rename, sftp_delete, sftp_mkdir, sftp_chmod, sftp_calculate_size, sftp_chown, sftp_deep_search, prepare_remote_edit, save_remote_edit}, tunnels::{TunnelState, ssh_start_tunnels, ssh_stop_tunnels}},
    sftp::{TransferWorkerState, commands::{enqueue_transfer, cancel_transfer, resolve_conflict}, worker::run_worker},
    themes::{themes_get_all, theme_import, theme_export, theme_delete, theme_fetch_index, theme_download},
};
use tauri::{Emitter, Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindowBuilder};

/// Clamps the window position and size so it fits entirely within the current monitor.
/// Called after tauri_plugin_window_state has restored the previous session's geometry —
/// that state can be stale if the user had a different monitor attached last time.
fn clamp_window_to_monitor(window: &tauri::WebviewWindow) {
    let monitor = match window.current_monitor() {
        Ok(Some(m)) => m,
        _ => return,
    };

    let mon_pos = monitor.position();
    let mon_size = monitor.size();
    let scale = monitor.scale_factor();

    let outer_pos = match window.outer_position() { Ok(p) => p, Err(_) => return };
    let outer_size = match window.outer_size() { Ok(s) => s, Err(_) => return };

    let max_w = (mon_size.width as f64 * 0.95) as u32;
    let max_h = (mon_size.height as f64 * 0.95) as u32;
    let new_w = outer_size.width.min(max_w);
    let new_h = outer_size.height.min(max_h);

    // Ensure the top-left corner is on-screen with a 40px margin so the title bar is always reachable.
    let screen_right = mon_pos.x + mon_size.width as i32;
    let screen_bottom = mon_pos.y + mon_size.height as i32;
    let margin = (40.0 * scale) as i32;

    let new_x = outer_pos.x
        .max(mon_pos.x)
        .min(screen_right - margin);
    let new_y = outer_pos.y
        .max(mon_pos.y)
        .min(screen_bottom - margin);

    if new_w != outer_size.width || new_h != outer_size.height {
        let _ = window.set_size(PhysicalSize::new(new_w, new_h));
    }
    if new_x != outer_pos.x || new_y != outer_pos.y {
        let _ = window.set_position(PhysicalPosition::new(new_x, new_y));
    }
}

#[tauri::command]
async fn ping_host(host_address: String, port: u16) -> Result<bool, String> {
    use std::net::ToSocketAddrs;
    use std::time::Duration;
    use socket2::{Socket, Domain, Type, Protocol};

    let addrs: Vec<_> = format!("{}:{}", host_address, port)
        .to_socket_addrs()
        .map_err(|e| e.to_string())?
        .collect();

    for addr in addrs {
        // Only try IPv4 to avoid macOS Error 65 on link-local routes
        if addr.is_ipv6() {
            continue;
        }
        let socket = Socket::new(Domain::IPV4, Type::STREAM, Some(Protocol::TCP))
            .map_err(|e| e.to_string())?;
        socket.set_nonblocking(true).map_err(|e| e.to_string())?;
        let sock_addr = socket2::SockAddr::from(addr);
        match socket.connect(&sock_addr) {
            Ok(_) => return Ok(true),
            Err(e) if e.raw_os_error() == Some(libc::EINPROGRESS) || e.raw_os_error() == Some(libc::EWOULDBLOCK) => {
                // Poll with select — wait up to 1500 ms
                use std::os::unix::io::AsRawFd;
                let fd = socket.as_raw_fd();
                let timeout = Duration::from_millis(1500);
                let secs = timeout.as_secs() as libc::time_t;
                let micros = timeout.subsec_micros() as libc::suseconds_t;
                let mut tv = libc::timeval { tv_sec: secs, tv_usec: micros };
                let result = unsafe {
                    let mut writefds: libc::fd_set = std::mem::zeroed();
                    libc::FD_SET(fd, &mut writefds);
                    libc::select(fd + 1, std::ptr::null_mut(), &mut writefds, std::ptr::null_mut(), &mut tv as *mut _)
                };
                if result > 0 {
                    // Check SO_ERROR to confirm connection succeeded
                    let so_err: i32 = socket.take_error()
                        .map(|opt| opt.map(|e| e.raw_os_error().unwrap_or(1)).unwrap_or(0))
                        .unwrap_or(1);
                    if so_err == 0 {
                        return Ok(true);
                    }
                }
            }
            Err(_) => {}
        }
    }
    Ok(false)
}

#[tauri::command]
async fn open_settings_window(app: tauri::AppHandle, tab: Option<String>) -> Result<(), String> {
    let url_path = match tab.as_deref() {
        Some(t) if !t.is_empty() => format!("settings.html?tab={}", t),
        _ => "settings.html".to_string(),
    };

    if let Some(window) = app.get_webview_window("settings") {
        let _ = window.set_focus();
        if let Some(t) = tab.as_deref().filter(|s| !s.is_empty()) {
            // emit() serializes via JSON — no string-escape footgun, unlike
            // eval() with format!(). Frontend listens via Tauri event API.
            let _ = window.emit("nexum:settings-tab", t);
        }
        return Ok(());
    }

    let builder = WebviewWindowBuilder::new(&app, "settings", WebviewUrl::App(url_path.into()))
        .title("Settings")
        .inner_size(860.0, 580.0)
        .min_inner_size(720.0, 480.0)
        .max_inner_size(1400.0, 900.0)
        .resizable(true);

    #[cfg(target_os = "macos")]
    let builder = builder
        .title_bar_style(tauri::TitleBarStyle::Overlay)
        .hidden_title(true);

    // On Linux we render our own titlebar + rounded shell, so drop the
    // native chrome and make the window transparent.
    #[cfg(target_os = "linux")]
    let builder = builder.decorations(false).transparent(true);

    let window = builder.build().map_err(|e| e.to_string())?;

    // Some Linux compositors (notably GNOME/Mutter with CSD-by-default)
    // ignore the builder-time decorations flag and force-draw a header bar.
    // Re-asserting it after the window is realized makes mutter respect it.
    #[cfg(target_os = "linux")]
    {
        let _ = window.set_decorations(false);
    }
    let _ = window;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .plugin(tauri_plugin_autostart::Builder::new().build())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_os::init())
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(tauri_plugin_log::log::LevelFilter::Debug)
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let data_dir = app.path().app_local_data_dir()
                .expect("failed to resolve app local data dir");
            let conn = initialize_db(data_dir)
                .expect("failed to initialize database");
            app.manage(HostsDb(std::sync::Mutex::new(conn)));

            let ssh_state = SshState::default();
            let ssh_state_for_worker = ssh_state.clone();
            app.manage(ssh_state);
            app.manage(TrustState::default());
            app.manage(TunnelState::default());

            let (tx, rx) = tokio::sync::mpsc::channel(100);
            let conflicts = std::sync::Arc::new(tokio::sync::Mutex::new(std::collections::HashMap::new()));
            let conflicts_for_worker = conflicts.clone();
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                run_worker(rx, std::sync::Arc::new(ssh_state_for_worker), app_handle, conflicts_for_worker).await;
            });
            app.manage(TransferWorkerState { sender: tx, conflicts });

            // Clamp the main window to the monitor bounds after tauri_plugin_window_state
            // has had a chance to restore the previous session's geometry (~1 frame later).
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(std::time::Duration::from_millis(150)).await;
                if let Some(window) = app_handle.get_webview_window("main") {
                    clamp_window_to_monitor(&window);
                }
            });

            Ok(())
        })
        .manage(pty::PtyState::default())
        .manage(shell::ShellState::default())
        .manage(secrets::SecretsState::default())
        .invoke_handler(tauri::generate_handler![
            pty::pty_open,
            pty::pty_write,
            pty::pty_resize,
            pty::pty_close,
            fs::tree::list_subdirs,
            fs::tree::fs_read_dir,
            fs::tree::fs_resolve_path,
            fs::file::fs_read_file,
            fs::file::fs_write_file,
            fs::file::fs_stat,
            fs::mutate::fs_create_file,
            fs::mutate::fs_create_temp_file,
            fs::mutate::fs_create_dir,
            fs::mutate::fs_rename,
            fs::mutate::fs_delete,
            fs::search::fs_search,
            fs::grep::fs_grep,
            fs::grep::fs_glob,
            shell::shell_run_command,
            shell::shell_session_open,
            shell::shell_session_run,
            shell::shell_session_close,
            shell::shell_bg_spawn,
            shell::shell_bg_logs,
            shell::shell_bg_kill,
            shell::shell_bg_list,
            open_settings_window,
            secrets::secrets_get,
            secrets::secrets_set,
            secrets::secrets_delete,
            secrets::secrets_get_all,
            secrets::secrets_get_encryption_enabled,
            secrets::secrets_set_encryption_enabled,
            hosts_get_all,
            hosts_create,
            hosts_update,
            hosts_delete,
            hosts_reorder,
            get_sudo_password,
            groups_get_all,
            groups_create,
            groups_delete,
            ssh_connect,
            ssh_connect_quick,
            ssh_trust_host,
            ssh_remove_known_host,
            ssh_disconnect,
            ssh_start_tunnels,
            ssh_stop_tunnels,
            ssh_exec_command,
            ssh_pty_write,
            ssh_pty_resize,
            sftp_read_dir,
            sftp_rename,
            sftp_delete,
            sftp_mkdir,
            sftp_chmod,
            sftp_calculate_size,
            sftp_chown,
            sftp_deep_search,
            enqueue_transfer,
            cancel_transfer,
            resolve_conflict,
            prepare_remote_edit,
            save_remote_edit,
            themes_get_all,
            theme_import,
            theme_export,
            theme_delete,
            theme_fetch_index,
            theme_download,
            ping_host,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
