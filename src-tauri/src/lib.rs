mod modules;

use modules::{
    fs, pty, secrets, shell,
    hosts::{HostsDb, db::{initialize_db, hosts_get_all, hosts_create, hosts_update, hosts_delete, hosts_reorder, get_sudo_password, groups_get_all, groups_create, groups_delete}},
    ssh::{SshState, TrustState, client::{ssh_connect, ssh_connect_quick, ssh_trust_host, ssh_remove_known_host, ssh_disconnect}, exec::ssh_exec_command, pty::{ssh_pty_write, ssh_pty_resize}, sftp::{sftp_read_dir, sftp_rename, sftp_delete, sftp_mkdir, sftp_chmod, prepare_remote_edit, save_remote_edit}},
    sftp::{TransferWorkerState, commands::{enqueue_transfer, cancel_transfer, resolve_conflict}, worker::run_worker},
    themes::{themes_get_all, theme_import, theme_export, theme_delete},
};
use tauri::{Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

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

            let (tx, rx) = tokio::sync::mpsc::channel(100);
            let conflicts = std::sync::Arc::new(tokio::sync::Mutex::new(std::collections::HashMap::new()));
            let conflicts_for_worker = conflicts.clone();
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                run_worker(rx, std::sync::Arc::new(ssh_state_for_worker), app_handle, conflicts_for_worker).await;
            });
            app.manage(TransferWorkerState { sender: tx, conflicts });

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
            fs::file::fs_read_file,
            fs::file::fs_write_file,
            fs::file::fs_stat,
            fs::mutate::fs_create_file,
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
            ssh_exec_command,
            ssh_pty_write,
            ssh_pty_resize,
            sftp_read_dir,
            sftp_rename,
            sftp_delete,
            sftp_mkdir,
            sftp_chmod,
            enqueue_transfer,
            cancel_transfer,
            resolve_conflict,
            prepare_remote_edit,
            save_remote_edit,
            themes_get_all,
            theme_import,
            theme_export,
            theme_delete,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
