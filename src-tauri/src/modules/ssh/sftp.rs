use crate::modules::ssh::SshState;
use std::io::{Read as _, Write as _};

macro_rules! get_sftp {
    ($entry:expr) => {
        $entry
            .sftp
            .as_ref()
            .ok_or("No SFTP handle — connection may not support SFTP")?
    };
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
    let tab_id_clone = tab_id.clone();
    let path_clone = path.clone();

    tokio::task::spawn_blocking(move || {
        log::debug!("[SFTP] sftp_read_dir called: tab={} path={}", tab_id_clone, path_clone);

        log::debug!("[SFTP] Locking SSH state…");
        let map = state_inner.0.lock().map_err(|e| e.to_string())?;
        log::debug!("[SFTP] Lock acquired.");

        let entry = map.get(&tab_id_clone).ok_or("no session for tab")?;
        log::debug!("[SFTP] Session entry found.");

        let sftp = get_sftp!(entry);
        log::debug!("[SFTP] Sftp handle acquired. Calling readdir({})…", path_clone);

        let entries = sftp
            .readdir(std::path::Path::new(&path_clone))
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
                FileNode {
                    path: pb.to_string_lossy().to_string(),
                    name,
                    size: stat.size.unwrap_or(0),
                    modified_at: stat.mtime.unwrap_or(0) as i64,
                    is_dir,
                    is_symlink,
                    symlink_target: None,
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
        let map = state_inner.0.lock().map_err(|e| e.to_string())?;
        let entry = map.get(&tab_id).ok_or("no session for tab")?;
        let sftp = get_sftp!(entry);
        sftp.rename(
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
        let map = state_inner.0.lock().map_err(|e| e.to_string())?;
        let entry = map.get(&tab_id).ok_or("no session for tab")?;
        let sftp = get_sftp!(entry);

        for path in &paths {
            let p = std::path::Path::new(path);
            // Try SFTP unlink (files), then rmdir (empty dirs).
            // Non-empty dirs are not supported via SFTP alone — caller should
            // recursively delete children first.
            if sftp.unlink(p).is_err() {
                sftp.rmdir(p).map_err(|e| e.to_string())?;
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
        let map = state_inner.0.lock().map_err(|e| e.to_string())?;
        let entry = map.get(&tab_id).ok_or("no session for tab")?;
        let sftp = get_sftp!(entry);
        sftp.mkdir(std::path::Path::new(&path), 0o755)
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
        let map = state_inner.0.lock().map_err(|e| e.to_string())?;
        let entry = map.get(&tab_id).ok_or("no session for tab")?;
        let sftp = get_sftp!(entry);
        let mut stat = sftp
            .stat(std::path::Path::new(&path))
            .map_err(|e| e.to_string())?;
        stat.perm = Some(permissions);
        sftp.setstat(std::path::Path::new(&path), stat)
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
            let map = state_inner.0.lock().map_err(|e| e.to_string())?;
            let entry = map.get(&tab_id).ok_or("no session for tab")?;
            let sftp = get_sftp!(entry);
            let stat = sftp
                .stat(std::path::Path::new(&remote_path))
                .map_err(|e| e.to_string())?;
            let size = stat.size.unwrap_or(0);
            if size > 5 * 1024 * 1024 {
                return Err(format!(
                    "File is too large for in-app editing ({size} bytes). Max 5 MB."
                ));
            }
            let mut remote_file = sftp
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
        let map = state_inner.0.lock().map_err(|e| e.to_string())?;
        let entry = map.get(&tab_id).ok_or("no session for tab")?;
        let sftp = get_sftp!(entry);
        let mut remote_file = sftp
            .create(std::path::Path::new(&remote_path))
            .map_err(|e| e.to_string())?;
        remote_file.write_all(&data).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}
