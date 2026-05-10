use crate::modules::ssh::SshState;
use std::io::{Read as _, Write as _};

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
pub fn sftp_read_dir(
    tab_id: String,
    path: String,
    state: tauri::State<'_, SshState>,
) -> Result<Vec<FileNode>, String> {
    let map = state.0.lock().map_err(|e| e.to_string())?;
    let entry = map.get(&tab_id).ok_or("no session for tab")?;
    let sftp = entry.session.sftp().map_err(|e| e.to_string())?;

    let entries = sftp
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

    Ok(files)
}

#[tauri::command]
pub fn sftp_rename(
    tab_id: String,
    old_path: String,
    new_path: String,
    state: tauri::State<'_, SshState>,
) -> Result<(), String> {
    let map = state.0.lock().map_err(|e| e.to_string())?;
    let entry = map.get(&tab_id).ok_or("no session for tab")?;
    let sftp = entry.session.sftp().map_err(|e| e.to_string())?;
    sftp.rename(
        std::path::Path::new(&old_path),
        std::path::Path::new(&new_path),
        None,
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn sftp_delete(
    tab_id: String,
    paths: Vec<String>,
    state: tauri::State<'_, SshState>,
) -> Result<(), String> {
    let map = state.0.lock().map_err(|e| e.to_string())?;
    let entry = map.get(&tab_id).ok_or("no session for tab")?;
    let sftp = entry.session.sftp().map_err(|e| e.to_string())?;

    for path in &paths {
        let p = std::path::Path::new(path);
        if sftp.unlink(p).is_err() {
            let mut ch = entry
                .session
                .channel_session()
                .map_err(|e| e.to_string())?;
            let safe = path.replace('\'', "'\\''");
            ch.exec(&format!("rm -rf '{safe}'"))
                .map_err(|e| e.to_string())?;
            ch.wait_close().map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn sftp_mkdir(
    tab_id: String,
    path: String,
    state: tauri::State<'_, SshState>,
) -> Result<(), String> {
    let map = state.0.lock().map_err(|e| e.to_string())?;
    let entry = map.get(&tab_id).ok_or("no session for tab")?;
    let sftp = entry.session.sftp().map_err(|e| e.to_string())?;
    sftp.mkdir(std::path::Path::new(&path), 0o755)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn sftp_chmod(
    tab_id: String,
    path: String,
    permissions: u32,
    state: tauri::State<'_, SshState>,
) -> Result<(), String> {
    let map = state.0.lock().map_err(|e| e.to_string())?;
    let entry = map.get(&tab_id).ok_or("no session for tab")?;
    let sftp = entry.session.sftp().map_err(|e| e.to_string())?;
    let mut stat = sftp
        .stat(std::path::Path::new(&path))
        .map_err(|e| e.to_string())?;
    stat.perm = Some(permissions);
    sftp.setstat(std::path::Path::new(&path), stat)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn prepare_remote_edit(
    tab_id: String,
    remote_path: String,
    state: tauri::State<'_, SshState>,
) -> Result<String, String> {
    let file_data = {
        let map = state.0.lock().map_err(|e| e.to_string())?;
        let sess = map.get(&tab_id).ok_or("no session for tab")?;
        let sftp = sess.session.sftp().map_err(|e| e.to_string())?;
        let stat = sftp.stat(std::path::Path::new(&remote_path)).map_err(|e| e.to_string())?;
        let size = stat.size.unwrap_or(0);
        if size > 5 * 1024 * 1024 {
            return Err(format!("File is too large for in-app editing ({size} bytes). Max 5 MB."));
        }
        let mut remote_file = sftp.open(std::path::Path::new(&remote_path)).map_err(|e| e.to_string())?;
        let mut buf = Vec::with_capacity(size as usize);
        remote_file.read_to_end(&mut buf).map_err(|e| e.to_string())?;
        buf
    };

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
}

#[tauri::command]
pub fn save_remote_edit(
    tab_id: String,
    remote_path: String,
    local_temp_path: String,
    state: tauri::State<'_, SshState>,
) -> Result<(), String> {
    let data = std::fs::read(&local_temp_path).map_err(|e| e.to_string())?;
    let map = state.0.lock().map_err(|e| e.to_string())?;
    let sess = map.get(&tab_id).ok_or("no session for tab")?;
    let sftp = sess.session.sftp().map_err(|e| e.to_string())?;
    let mut remote_file = sftp.create(std::path::Path::new(&remote_path)).map_err(|e| e.to_string())?;
    remote_file.write_all(&data).map_err(|e| e.to_string())
}
