use crate::modules::ssh::SshState;
use std::io::{Read as _, Write as _};
use std::sync::Arc;

fn shell_quote(s: &str) -> String {
    format!("'{}'", s.replace('\'', "'\\''"))
}

/// Extract the SFTP Arc under a brief outer-lock, then release it so the
/// PTY reader thread can acquire the same lock without waiting for I/O.
macro_rules! get_sftp_arc {
    ($state_inner:expr, $tab_id:expr) => {{
        let map = $state_inner.0.lock().map_err(|e| e.to_string())?;
        let entry = map.get($tab_id).ok_or("no session for tab")?;
        entry
            .sftp
            .as_ref()
            .ok_or("No SFTP handle — connection may not support SFTP")?
            .clone()
    }};
}

#[derive(Debug, serde::Serialize, serde::Deserialize)]
pub struct FileNode {
    pub name: String,
    pub path: String,
    pub size: u64,
    pub modified_at: i64,
    pub is_dir: bool,
    pub is_symlink: bool,
    pub symlink_target: Option<String>,
    pub permissions: String,
}

fn mode_to_string(mode: u32) -> String {
    let chars = [
        (0o400, 'r'), (0o200, 'w'), (0o100, 'x'),
        (0o040, 'r'), (0o020, 'w'), (0o010, 'x'),
        (0o004, 'r'), (0o002, 'w'), (0o001, 'x'),
    ];
    chars
        .iter()
        .map(|(bit, ch)| if mode & bit != 0 { *ch } else { '-' })
        .collect()
}

#[tauri::command]
pub async fn sftp_read_dir(
    tab_id: String,
    path: String,
    state: tauri::State<'_, SshState>,
) -> Result<Vec<FileNode>, String> {
    let state_inner = state.inner().clone();

    tokio::task::spawn_blocking(move || {
        log::debug!("[SFTP] sftp_read_dir: tab={} path={}", tab_id, path);

        // Acquire Arc under brief lock, then release outer lock before I/O.
        let sftp_arc: Arc<std::sync::Mutex<crate::modules::ssh::SftpHandle>> =
            get_sftp_arc!(state_inner, &tab_id);

        let sftp = sftp_arc.lock().map_err(|e| e.to_string())?;
        log::debug!("[SFTP] readdir({})…", path);

        let entries = sftp.0
            .readdir(std::path::Path::new(&path))
            .map_err(|e| e.to_string())?;

        let mut files: Vec<FileNode> = entries
            .into_iter()
            .map(|(pb, stat)| {
                let name = pb
                    .file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_else(|| pb.to_string_lossy().to_string());
                let is_dir = stat.is_dir();
                let is_symlink = stat.file_type().is_symlink();
                let symlink_target = if is_symlink {
                    sftp.0.readlink(&pb).ok().map(|p| p.to_string_lossy().to_string())
                } else {
                    None
                };
                FileNode {
                    path: pb.to_string_lossy().to_string(),
                    name,
                    size: stat.size.unwrap_or(0),
                    modified_at: stat.mtime.unwrap_or(0) as i64,
                    is_dir,
                    is_symlink,
                    symlink_target,
                    permissions: mode_to_string(stat.perm.unwrap_or(0)),
                }
            })
            .collect();

        files.sort_by(|a, b| {
            b.is_dir
                .cmp(&a.is_dir)
                .then(a.name.to_lowercase().cmp(&b.name.to_lowercase()))
        });

        log::debug!("[SFTP] readdir complete — {} entries.", files.len());
        Ok(files)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn sftp_rename(
    tab_id: String,
    old_path: String,
    new_path: String,
    state: tauri::State<'_, SshState>,
) -> Result<(), String> {
    let state_inner = state.inner().clone();
    tokio::task::spawn_blocking(move || {
        let sftp_arc = get_sftp_arc!(state_inner, &tab_id);
        let sftp = sftp_arc.lock().map_err(|e| e.to_string())?;
        sftp.0.rename(
            std::path::Path::new(&old_path),
            std::path::Path::new(&new_path),
            None,
        )
        .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn sftp_delete(
    tab_id: String,
    paths: Vec<String>,
    state: tauri::State<'_, SshState>,
) -> Result<(), String> {
    let state_inner = state.inner().clone();
    tokio::task::spawn_blocking(move || {
        let sftp_arc = get_sftp_arc!(state_inner, &tab_id);
        let sftp = sftp_arc.lock().map_err(|e| e.to_string())?;

        for path in &paths {
            let p = std::path::Path::new(path);
            // Try SFTP unlink (files), then rmdir (empty dirs).
            // Non-empty dirs are not supported via SFTP alone — caller should
            // recursively delete children first.
            if sftp.0.unlink(p).is_err() {
                sftp.0.rmdir(p).map_err(|e| e.to_string())?;
            }
        }
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn sftp_mkdir(
    tab_id: String,
    path: String,
    state: tauri::State<'_, SshState>,
) -> Result<(), String> {
    let state_inner = state.inner().clone();
    tokio::task::spawn_blocking(move || {
        let sftp_arc = get_sftp_arc!(state_inner, &tab_id);
        let sftp = sftp_arc.lock().map_err(|e| e.to_string())?;
        sftp.0.mkdir(std::path::Path::new(&path), 0o755)
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn sftp_chmod(
    tab_id: String,
    path: String,
    permissions: u32,
    state: tauri::State<'_, SshState>,
) -> Result<(), String> {
    let state_inner = state.inner().clone();
    tokio::task::spawn_blocking(move || {
        let sftp_arc = get_sftp_arc!(state_inner, &tab_id);
        let sftp = sftp_arc.lock().map_err(|e| e.to_string())?;
        let mut stat = sftp.0
            .stat(std::path::Path::new(&path))
            .map_err(|e| e.to_string())?;
        stat.perm = Some(permissions);
        sftp.0.setstat(std::path::Path::new(&path), stat)
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn prepare_remote_edit(
    tab_id: String,
    remote_path: String,
    state: tauri::State<'_, SshState>,
) -> Result<String, String> {
    let state_inner = state.inner().clone();
    tokio::task::spawn_blocking(move || {
        let file_data = {
            let sftp_arc = get_sftp_arc!(state_inner, &tab_id);
            let sftp = sftp_arc.lock().map_err(|e| e.to_string())?;
            let stat = sftp.0
                .stat(std::path::Path::new(&remote_path))
                .map_err(|e| e.to_string())?;
            let size = stat.size.unwrap_or(0);
            if size > 5 * 1024 * 1024 {
                return Err(format!(
                    "File is too large for in-app editing ({size} bytes). Max 5 MB."
                ));
            }
            let mut remote_file = sftp.0
                .open(std::path::Path::new(&remote_path))
                .map_err(|e| e.to_string())?;
            let mut buf = Vec::with_capacity(size as usize);
            remote_file.read_to_end(&mut buf).map_err(|e| e.to_string())?;
            Ok::<_, String>(buf)
        }?;

        let temp_dir = std::env::temp_dir().join("nexum_remote_edits");
        std::fs::create_dir_all(&temp_dir).map_err(|e| e.to_string())?;
        let file_name = std::path::Path::new(&remote_path)
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "file".to_string());
        let unique_id = uuid::Uuid::new_v4().to_string();
        let temp_path = temp_dir.join(format!("{}_{}", unique_id, file_name));
        std::fs::write(&temp_path, &file_data).map_err(|e| e.to_string())?;
        Ok(temp_path.to_string_lossy().to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn save_remote_edit(
    tab_id: String,
    remote_path: String,
    local_temp_path: String,
    state: tauri::State<'_, SshState>,
) -> Result<(), String> {
    let state_inner = state.inner().clone();
    tokio::task::spawn_blocking(move || {
        let data = std::fs::read(&local_temp_path).map_err(|e| e.to_string())?;
        let sftp_arc = get_sftp_arc!(state_inner, &tab_id);
        let sftp = sftp_arc.lock().map_err(|e| e.to_string())?;
        let mut remote_file = sftp.0
            .create(std::path::Path::new(&remote_path))
            .map_err(|e| e.to_string())?;
        remote_file.write_all(&data).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Run `du -sh '<path>'` on the remote server and return the human-readable size.
#[tauri::command]
pub async fn sftp_calculate_size(
    tab_id: String,
    path: String,
    state: tauri::State<'_, SshState>,
) -> Result<String, String> {
    let state_inner = state.inner().clone();
    tokio::task::spawn_blocking(move || {
        use std::io::Read;
        let map = state_inner.0.lock().map_err(|e| e.to_string())?;
        let session = &map
            .get(&tab_id)
            .ok_or_else(|| format!("no SSH session for tab {tab_id}"))?
            .session;
        let mut ch = session.channel_session().map_err(|e| e.to_string())?;
        ch.exec(&format!("du -sh {}", shell_quote(&path))).map_err(|e| e.to_string())?;
        let mut stdout = String::new();
        ch.read_to_string(&mut stdout).map_err(|e| e.to_string())?;
        ch.wait_close().ok();
        Ok(stdout.split_whitespace().next().unwrap_or("?").to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Execute `chown owner:group '<path>'` on the remote server.
#[tauri::command]
pub async fn sftp_chown(
    tab_id: String,
    path: String,
    owner: String,
    group: String,
    state: tauri::State<'_, SshState>,
) -> Result<(), String> {
    let state_inner = state.inner().clone();
    tokio::task::spawn_blocking(move || {
        use std::io::Read;
        let map = state_inner.0.lock().map_err(|e| e.to_string())?;
        let session = &map
            .get(&tab_id)
            .ok_or_else(|| format!("no SSH session for tab {tab_id}"))?
            .session;
        let mut ch = session.channel_session().map_err(|e| e.to_string())?;
        let cmd = format!(
            "chown {}:{} {}",
            shell_quote(&owner),
            shell_quote(&group),
            shell_quote(&path)
        );
        ch.exec(&cmd).map_err(|e| e.to_string())?;
        let mut stderr_buf = String::new();
        ch.stderr().read_to_string(&mut stderr_buf).ok();
        ch.wait_close().ok();
        let exit_code = ch.exit_status().unwrap_or(-1);
        if exit_code != 0 && !stderr_buf.is_empty() {
            return Err(stderr_buf.trim().to_string());
        }
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Run `find <start_path> -iname '*<query>*' -maxdepth 5` on the remote server.
/// Returns up to 200 matching paths.
#[tauri::command]
pub async fn sftp_deep_search(
    tab_id: String,
    start_path: String,
    query: String,
    state: tauri::State<'_, SshState>,
) -> Result<Vec<String>, String> {
    let state_inner = state.inner().clone();
    tokio::task::spawn_blocking(move || {
        use std::io::Read;
        let map = state_inner.0.lock().map_err(|e| e.to_string())?;
        let session = &map
            .get(&tab_id)
            .ok_or_else(|| format!("no SSH session for tab {tab_id}"))?
            .session;
        let mut ch = session.channel_session().map_err(|e| e.to_string())?;
        let safe_query = query.replace('\'', "'\\''");
        let cmd = format!(
            "find {} -iname '*{}*' -maxdepth 5 -print 2>/dev/null | head -n 200",
            shell_quote(&start_path),
            safe_query,
        );
        ch.exec(&cmd).map_err(|e| e.to_string())?;
        let mut stdout = String::new();
        ch.read_to_string(&mut stdout).map_err(|e| e.to_string())?;
        ch.wait_close().ok();
        Ok(stdout.lines().filter(|l| !l.is_empty()).map(|l| l.to_string()).collect())
    })
    .await
    .map_err(|e| e.to_string())?
}
