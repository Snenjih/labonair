mod modules;

use modules::{
    fs::{self, paths},
    git, pty, secrets, shell,
    hosts::{HostsDb, db::{initialize_db, hosts_get_all, hosts_create, hosts_update, hosts_delete, hosts_duplicate, hosts_reorder, get_sudo_password, groups_get_all, groups_create, groups_delete, groups_update}},
    credentials::{credentials_get_all, credentials_create, credentials_update, credentials_delete, credentials_get_hosts_using, credential_generate_keypair},
    ssh::{SshState, TrustState, client::{ssh_connect, ssh_connect_quick, ssh_trust_host, ssh_remove_known_host, ssh_disconnect}, exec::ssh_exec_command, pty::{ssh_pty_write, ssh_pty_resize}, sftp::{sftp_read_dir, sftp_read_dir_page, sftp_rename, sftp_delete, sftp_mkdir, sftp_create_file, sftp_chmod, sftp_calculate_size, sftp_chown, sftp_deep_search, prepare_remote_edit, save_remote_edit, sftp_read_file_content, cleanup_remote_edit_temp}, tunnels::{TunnelState, ssh_start_tunnels, ssh_stop_tunnels}},
    sftp::{SftpState, TransferWorkerState, commands::{enqueue_transfer, cancel_transfer, resolve_conflict}, connection::{sftp_connect, sftp_disconnect}, worker::run_worker},
    snippets::db::{snippets_get_all, snippets_create, snippets_update, snippets_delete, snippets_reorder, snippet_groups_get_all, snippet_groups_create, snippet_groups_update, snippet_groups_delete},
    snippets::exec::{snippet_run_local, snippet_run_ssh},
    themes::{themes_get_all, theme_import, theme_export, theme_delete, theme_fetch_index, theme_download, theme_create, themes_get_dir},
    backgrounds::{backgrounds_list, background_import, background_delete, background_read_data_url},
};
use tauri::{Emitter, Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_window_state::StateFlags;
use tauri::menu::{AboutMetadata, Menu, MenuItem, PredefinedMenuItem, Submenu};

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
fn quit_app(app: tauri::AppHandle) {
    app.exit(0);
}

#[tauri::command]
async fn show_main_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
    Ok(())
}

/// Calculates ideal settings window dimensions based on the monitor the main window lives on.
/// Width is fixed at 860 logical px; height is 80% of monitor height, clamped [580, 900].
fn settings_window_size(app: &tauri::AppHandle) -> (f64, f64) {
    let monitor = app
        .get_webview_window("main")
        .and_then(|w| w.current_monitor().ok().flatten());
    if let Some(m) = monitor {
        let scale = m.scale_factor();
        let logical_h = m.size().height as f64 / scale;
        let h = (logical_h * 0.8).clamp(580.0, 900.0);
        (860.0, h)
    } else {
        (860.0, 580.0)
    }
}

#[tauri::command]
async fn open_settings_window(app: tauri::AppHandle, tab: Option<String>) -> Result<(), String> {
    let url_path = match tab.as_deref() {
        Some(t) if !t.is_empty() => format!("settings.html?tab={}", t),
        _ => "settings.html".to_string(),
    };

    let (set_w, set_h) = settings_window_size(&app);

    // Window already exists (hidden) — just resize, center and show it.
    if let Some(window) = app.get_webview_window("settings") {
        let _ = window.set_size(tauri::Size::Logical(tauri::LogicalSize::new(set_w, set_h)));
        let _ = window.center();
        let _ = window.show();
        let _ = window.set_focus();
        if let Some(t) = tab.as_deref().filter(|s| !s.is_empty()) {
            // emit() serializes via JSON — no string-escape footgun, unlike
            // eval() with format!(). Frontend listens via Tauri event API.
            let _ = window.emit("labonair:settings-tab", t);
        }
        return Ok(());
    }

    let mut builder = WebviewWindowBuilder::new(&app, "settings", WebviewUrl::App(url_path.into()))
        .title("Settings")
        .inner_size(set_w, set_h)
        .min_inner_size(720.0, 480.0)
        .max_inner_size(1400.0, 900.0)
        .resizable(true)
        // Keep settings above the main app window so it doesn't get hidden
        // when the user clicks back into the editor or terminal.
        .always_on_top(true);

    // Tie lifecycle to the main window so settings minimizes/closes with it.
    if let Some(main) = app.get_webview_window("main") {
        builder = builder.parent(&main).map_err(|e| e.to_string())?;
    }

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

    // Center the freshly-built window before the user sees it.
    let _ = window.center();

    // Intercept the close button: hide instead of destroying the webview so
    // the next open() call is instant (React is already running in the background).
    let window_clone = window.clone();
    window.on_window_event(move |event| {
        if let tauri::WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            let _ = window_clone.hide();
        }
    });

    Ok(())
}

fn build_menu(app: &tauri::App) -> tauri::Result<Menu<tauri::Wry>> {
    // ── Labonair app menu ─────────────────────────────────────────────────────
    let about_meta = AboutMetadata {
        version: Some(env!("CARGO_PKG_VERSION").to_string()),
        copyright: Some("© 2026 Snenjih".to_string()),
        credits: Some("A modern terminal, SSH & SFTP client with integrated AI for developers.\n\nlabonair.app".to_string()),
        icon: Some(tauri::include_image!("icons/128x128@2x.png")),
        ..Default::default()
    };
    let about       = PredefinedMenuItem::about(app, Some("About Labonair"), Some(about_meta))?;
    let settings    = MenuItem::with_id(app, "settings", "Settings...", true, Some("CmdOrCtrl+,"))?;
    let hide        = PredefinedMenuItem::hide(app, None)?;
    let hide_others = PredefinedMenuItem::hide_others(app, None)?;
    let show_all    = PredefinedMenuItem::show_all(app, None)?;
    let quit        = PredefinedMenuItem::quit(app, None)?;
    let app_menu    = Submenu::with_items(app, "Labonair", true, &[
        &about, &settings,
        &PredefinedMenuItem::separator(app)?,
        &hide, &hide_others, &show_all,
        &PredefinedMenuItem::separator(app)?,
        &quit,
    ])?;

    // ── File ──────────────────────────────────────────────────────────────────
    let new_terminal = MenuItem::with_id(app, "new_terminal_tab", "New Terminal Tab", true, Some("CmdOrCtrl+T"))?;
    let new_ssh_tab  = MenuItem::with_id(app, "new_ssh_tab",      "New SSH Tab",      true, None::<&str>)?;
    let new_sftp_tab = MenuItem::with_id(app, "new_sftp_tab",     "New SFTP Tab",     true, None::<&str>)?;
    let new_preview  = MenuItem::with_id(app, "new_preview_tab",  "New Preview Tab",  true, Some("CmdOrCtrl+P"))?;
    let new_editor   = MenuItem::with_id(app, "new_editor_tab",   "New Editor Tab",   true, Some("CmdOrCtrl+E"))?;
    let close_tab    = MenuItem::with_id(app, "close_tab",        "Close Tab",        true, Some("CmdOrCtrl+W"))?;
    let close_pane   = MenuItem::with_id(app, "close_pane",       "Close Pane",       true, Some("CmdOrCtrl+Shift+W"))?;
    let file_menu    = Submenu::with_items(app, "File", true, &[
        &new_terminal, &new_ssh_tab, &new_sftp_tab, &new_preview, &new_editor,
        &PredefinedMenuItem::separator(app)?,
        &close_tab, &close_pane,
    ])?;

    // ── Edit (PredefinedMenuItems enable copy/paste in text fields) ───────────
    let edit_menu = Submenu::with_items(app, "Edit", true, &[
        &PredefinedMenuItem::undo(app, None)?,
        &PredefinedMenuItem::redo(app, None)?,
        &PredefinedMenuItem::separator(app)?,
        &PredefinedMenuItem::cut(app, None)?,
        &PredefinedMenuItem::copy(app, None)?,
        &PredefinedMenuItem::paste(app, None)?,
        &PredefinedMenuItem::select_all(app, None)?,
    ])?;

    // ── View ──────────────────────────────────────────────────────────────────
    let toggle_sidebar = MenuItem::with_id(app, "toggle_sidebar", "Toggle Sidebar",   true, Some("CmdOrCtrl+B"))?;
    let toggle_ai      = MenuItem::with_id(app, "toggle_ai",      "Toggle AI Panel",  true, Some("CmdOrCtrl+I"))?;
    let zoom_in        = MenuItem::with_id(app, "zoom_in",        "Zoom In",          true, Some("CmdOrCtrl+Plus"))?;
    let zoom_out       = MenuItem::with_id(app, "zoom_out",       "Zoom Out",         true, Some("CmdOrCtrl+-"))?;
    let zoom_reset     = MenuItem::with_id(app, "zoom_reset",     "Reset Zoom",       true, Some("CmdOrCtrl+0"))?;
    let fullscreen     = PredefinedMenuItem::fullscreen(app, None)?;
    let view_menu      = Submenu::with_items(app, "View", true, &[
        &toggle_sidebar, &toggle_ai,
        &PredefinedMenuItem::separator(app)?,
        &zoom_in, &zoom_out, &zoom_reset,
        &PredefinedMenuItem::separator(app)?,
        &fullscreen,
    ])?;

    // ── Terminal ──────────────────────────────────────────────────────────────
    let split_right = MenuItem::with_id(app, "split_pane_right", "Split Pane Right", true, Some("CmdOrCtrl+D"))?;
    let split_down  = MenuItem::with_id(app, "split_pane_down",  "Split Pane Down",  true, Some("CmdOrCtrl+Shift+D"))?;
    let find        = MenuItem::with_id(app, "find",             "Find...",          true, Some("CmdOrCtrl+F"))?;
    let term_menu   = Submenu::with_items(app, "Terminal", true, &[
        &split_right, &split_down,
        &PredefinedMenuItem::separator(app)?,
        &find,
    ])?;

    // ── Connections ───────────────────────────────────────────────────────────
    let open_hosts   = MenuItem::with_id(app, "open_host_manager",  "Open Host Manager",      true, None::<&str>)?;
    let new_ssh_conn = MenuItem::with_id(app, "new_ssh_connection",  "New SSH Connection...",  true, Some("CmdOrCtrl+Shift+N"))?;
    let quick_ssh    = MenuItem::with_id(app, "new_quick_ssh",       "New Quick SSH...",       true, None::<&str>)?;
    let conn_menu    = Submenu::with_items(app, "Connections", true, &[
        &open_hosts,
        &PredefinedMenuItem::separator(app)?,
        &new_ssh_conn, &quick_ssh,
    ])?;

    // ── AI ────────────────────────────────────────────────────────────────────
    let toggle_ai_2  = MenuItem::with_id(app, "toggle_ai_2",    "Toggle AI Panel",      true, Some("CmdOrCtrl+I"))?;
    let new_ai_sess  = MenuItem::with_id(app, "new_ai_session",  "New AI Session",       true, None::<&str>)?;
    let ask_select   = MenuItem::with_id(app, "ask_selection",   "Ask about Selection",  true, Some("CmdOrCtrl+L"))?;
    let clear_chat   = MenuItem::with_id(app, "clear_chat",      "Clear Current Chat",   true, None::<&str>)?;
    let ai_settings  = MenuItem::with_id(app, "ai_settings",     "AI Settings...",       true, None::<&str>)?;
    let ai_menu      = Submenu::with_items(app, "AI", true, &[
        &toggle_ai_2, &new_ai_sess, &ask_select,
        &PredefinedMenuItem::separator(app)?,
        &clear_chat,
        &PredefinedMenuItem::separator(app)?,
        &ai_settings,
    ])?;

    // ── Window ────────────────────────────────────────────────────────────────
    let minimize    = PredefinedMenuItem::minimize(app, None)?;
    let zoom_win    = PredefinedMenuItem::maximize(app, None)?;
    let shortcuts   = MenuItem::with_id(app, "open_shortcuts",  "Keyboard Shortcuts",  true, Some("CmdOrCtrl+K"))?;
    let settings_2  = MenuItem::with_id(app, "open_settings_2", "Settings",            true, Some("CmdOrCtrl+,"))?;
    let next_tab    = MenuItem::with_id(app, "next_tab",         "Next Tab",            true, Some("Ctrl+Tab"))?;
    let prev_tab    = MenuItem::with_id(app, "prev_tab",         "Previous Tab",        true, Some("Ctrl+Shift+Tab"))?;
    let win_menu    = Submenu::with_items(app, "Window", true, &[
        &minimize, &zoom_win,
        &PredefinedMenuItem::separator(app)?,
        &shortcuts, &settings_2,
        &PredefinedMenuItem::separator(app)?,
        &next_tab, &prev_tab,
    ])?;

    Menu::with_items(app, &[
        &app_menu, &file_menu, &edit_menu, &view_menu,
        &term_menu, &conn_menu, &ai_menu, &win_menu,
    ])
}


#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(
            tauri_plugin_window_state::Builder::new()
                // Exclude VISIBLE so the plugin never forces the window visible
                // before React has mounted — avoids the transparent shadow flash
                // on Windows/Linux. The frontend calls show() after first paint.
                .with_state_flags(StateFlags::all() & !StateFlags::VISIBLE)
                .build(),
        )
        .plugin(tauri_plugin_autostart::Builder::new().build())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_os::init())
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(if cfg!(debug_assertions) {
                    tauri_plugin_log::log::LevelFilter::Debug
                } else {
                    tauri_plugin_log::log::LevelFilter::Warn
                })
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_drag::init())
        .setup(|app| {
            // Migrate nexum-settings.json → labonair-settings.json on first launch
            {
                let config_dir = paths::config_dir();
                let old_settings = config_dir.join("nexum-settings.json");
                let new_settings = config_dir.join("labonair-settings.json");
                if old_settings.exists() && !new_settings.exists() {
                    let _ = std::fs::rename(&old_settings, &new_settings);
                }
            }

            // Migrate nexum-* keychain service names → labonair-* once at startup.
            // The SecretsState isn't managed yet at this point, so we use a temporary
            // instance to perform the one-time key rename in the secrets store file.
            {
                let temp_secrets = secrets::SecretsState::default();
                secrets::migrate_service_names(app.handle(), &temp_secrets);
            }

            let conn = initialize_db(paths::data_dir())
                .expect("failed to initialize database");
            app.manage(HostsDb(std::sync::Mutex::new(conn)));

            let ssh_state = SshState::default();
            app.manage(ssh_state);
            app.manage(TrustState::default());
            app.manage(TunnelState::default());

            // Dedicated SFTP state — decoupled from SshState so SFTP I/O never
            // blocks the PTY terminal mutex.
            let sftp_state = SftpState::default();
            let sftp_state_for_worker = sftp_state.clone();
            app.manage(sftp_state);

            let (tx, rx) = tokio::sync::mpsc::channel(100);
            let conflicts = std::sync::Arc::new(tokio::sync::Mutex::new(std::collections::HashMap::new()));
            let conflicts_for_worker = conflicts.clone();
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                run_worker(rx, std::sync::Arc::new(sftp_state_for_worker), app_handle, conflicts_for_worker).await;
            });
            app.manage(TransferWorkerState { sender: tx, conflicts });

            // Read the restoreWindowState preference directly from the store file.
            // The window-state plugin has already applied the saved geometry by this point;
            // if the user has disabled the feature we reset to defaults instead.
            let restore_window = std::fs::read_to_string(
                    paths::config_dir().join("labonair-settings.json")
                ).ok()
                .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
                .and_then(|v| v.get("restoreWindowState").and_then(|b| b.as_bool()))
                .unwrap_or(true);

            // After the window-state plugin has restored geometry, either clamp to
            // monitor bounds (restore enabled) or reset to the default 800×600 centered
            // (restore disabled). A short sleep lets the plugin finish its async work.
            // The CAMetalLayer async-rendering tweak is also deferred here so it never
            // races with the WKWebView WebContent process starting up.
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(std::time::Duration::from_millis(150)).await;
                if let Some(window) = app_handle.get_webview_window("main") {
                    if restore_window {
                        clamp_window_to_monitor(&window);
                    } else {
                        let _ = window.set_size(tauri::Size::Physical(PhysicalSize {
                            width: 800,
                            height: 600,
                        }));
                        let _ = window.center();
                    }

                    // macOS: enable async CAMetalLayer rendering. Deferred so the
                    // WebContent process is stable before we touch the layer tree.
                    #[cfg(target_os = "macos")]
                    let _ = window.with_webview(|webview| {
                        use objc2::msg_send;
                        use objc2::runtime::AnyObject;
                        unsafe {
                            let ns_view: *mut AnyObject = webview.inner() as *mut AnyObject;
                            let layer: *mut AnyObject = msg_send![ns_view, layer];
                            if !layer.is_null() {
                                let _: () = msg_send![layer, setDrawsAsynchronously: true];
                            }
                        }
                    });
                }
            });

            // Safety net: if the frontend never calls show_main_window (e.g. because
            // the WebContent process crashed before React could mount), force-show the
            // window after 12 s so the app is never stuck invisible forever.
            let app_handle_guard = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(std::time::Duration::from_secs(12)).await;
                if let Some(win) = app_handle_guard.get_webview_window("main") {
                    let _ = win.show();
                }
            });

            // Build and set the native macOS (and cross-platform) menu bar.
            let menu = build_menu(app)?;
            app.set_menu(menu)?;

            #[cfg(target_os = "macos")]
            modules::dock_menu::setup(app.app_handle());

            app.on_menu_event(|app, event| {
                match event.id().as_ref() {
                    "settings" | "open_settings_2" => {
                        let app = app.clone();
                        tauri::async_runtime::spawn(async move {
                            let _ = open_settings_window(app, None).await;
                        });
                    }
                    "ai_settings" => {
                        let app = app.clone();
                        tauri::async_runtime::spawn(async move {
                            let _ = open_settings_window(app, Some("ai".to_string())).await;
                        });
                    }
                    other => {
                        if let Some(win) = app.get_webview_window("main") {
                            let _ = win.emit(&format!("menu:{}", other), ());
                        }
                    }
                }
            });

            Ok(())
        })
        .manage(pty::PtyState::default())
        .manage(shell::ShellState::default())
        .manage(secrets::SecretsState::default())
        .manage(fs::watcher::WatcherState::default())
        .invoke_handler(tauri::generate_handler![
            pty::pty_open,
            pty::pty_write,
            pty::pty_resize,
            pty::pty_close,
            pty::pty_has_foreground_job,
            fs::tree::list_subdirs,
            fs::tree::fs_read_dir,
            fs::tree::fs_read_dir_page,
            fs::tree::fs_resolve_path,
            fs::watcher::fs_watch_dir,
            fs::watcher::fs_unwatch_dir,
            fs::watcher::fs_sync_watchers,
            fs::file::fs_read_file,
            fs::file::fs_write_file,
            fs::file::fs_stat,
            fs::file::fs_file_exists,
            fs::file::fs_realpath,
            fs::mutate::fs_create_file,
            fs::mutate::fs_create_temp_file,
            fs::mutate::fs_create_dir,
            fs::mutate::fs_rename,
            fs::mutate::fs_delete,
            fs::mutate::fs_copy_into,
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
            quit_app,
            show_main_window,
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
            hosts_duplicate,
            hosts_reorder,
            get_sudo_password,
            groups_get_all,
            groups_create,
            groups_delete,
            groups_update,
            credentials_get_all,
            credentials_create,
            credentials_update,
            credentials_delete,
            credentials_get_hosts_using,
            credential_generate_keypair,
            ssh_connect,
            ssh_connect_quick,
            ssh_trust_host,
            ssh_remove_known_host,
            ssh_disconnect,
            crate::modules::ssh::config_parser::parse_ssh_config_cmd,
            crate::modules::ssh::config_parser::import_ssh_config_entries,
            ssh_start_tunnels,
            ssh_stop_tunnels,
            ssh_exec_command,
            ssh_pty_write,
            ssh_pty_resize,
            sftp_connect,
            sftp_disconnect,
            sftp_read_dir,
            sftp_read_dir_page,
            sftp_rename,
            sftp_delete,
            sftp_mkdir,
            sftp_create_file,
            sftp_chmod,
            sftp_calculate_size,
            sftp_chown,
            sftp_deep_search,
            enqueue_transfer,
            cancel_transfer,
            resolve_conflict,
            prepare_remote_edit,
            save_remote_edit,
            sftp_read_file_content,
            cleanup_remote_edit_temp,
            snippets_get_all,
            snippets_create,
            snippets_update,
            snippets_delete,
            snippets_reorder,
            snippet_groups_get_all,
            snippet_groups_create,
            snippet_groups_update,
            snippet_groups_delete,
            snippet_run_local,
            snippet_run_ssh,
            themes_get_all,
            theme_import,
            theme_export,
            theme_delete,
            theme_fetch_index,
            theme_download,
            theme_create,
            themes_get_dir,
            ping_host,
            fs::paths::get_storage_paths,
            backgrounds_list,
            background_import,
            background_delete,
            background_read_data_url,
            modules::scrollback::scrollback_save,
            modules::scrollback::scrollback_load,
            modules::scrollback::scrollback_cleanup,
            git::git_is_repo,
            git::git_get_repo_root,
            git::git_get_status,
            git::git_get_current_branch,
            git::git_get_branches,
            git::git_get_diff,
            git::git_stage_file,
            git::git_unstage_file,
            git::git_stage_all,
            git::git_unstage_all,
            git::git_discard_file,
            git::git_commit,
            git::git_push,
            git::git_pull,
            git::git_fetch,
            git::git_abort,
            git::git_get_log,
            git::git_get_commit_detail,
            git::git_checkout_branch,
            git::git_create_branch,
            git::git_delete_branch,
            git::git_rename_branch,
            git::git_stash_push,
            git::git_stash_list,
            git::git_stash_pop,
            git::git_stash_apply,
            git::git_stash_drop,
            git::git_get_commit_diff,
            git::git_push_force_with_lease,
            git::git_push_set_upstream,
            git::git_cherry_pick,
            git::git_get_tags,
            git::git_create_tag,
            git::git_delete_tag,
            git::git_push_tag,
            git::git_get_diff_stats,
            git::git_get_commit_numstat,
            git::git_get_remote_url,
            git::git_add_to_gitignore,
            git::git_add_to_exclude,
            git::git_get_workspace_state,
            git::git_init,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
