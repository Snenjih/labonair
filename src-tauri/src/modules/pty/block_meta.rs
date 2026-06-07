use std::path::PathBuf;
use tauri::AppHandle;
use tauri::Manager;

#[tauri::command]
pub async fn block_meta_save(
    session_id: String,
    blocks_json: String,
    app: AppHandle,
) -> Result<(), String> {
    let dir = block_meta_dir(&app)?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(format!("{}.json", sanitize_session_id(&session_id)));
    std::fs::write(path, blocks_json).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn block_meta_load(
    session_id: String,
    app: AppHandle,
) -> Result<Option<String>, String> {
    let path = block_meta_dir(&app)?
        .join(format!("{}.json", sanitize_session_id(&session_id)));
    if !path.exists() {
        return Ok(None);
    }
    std::fs::read_to_string(path)
        .map(Some)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn block_meta_cleanup(app: AppHandle) -> Result<(), String> {
    let dir = block_meta_dir(&app)?;
    if !dir.exists() {
        return Ok(());
    }
    let cutoff = std::time::SystemTime::now()
        .checked_sub(std::time::Duration::from_secs(30 * 24 * 3600))
        .unwrap_or(std::time::SystemTime::UNIX_EPOCH);
    if let Ok(entries) = std::fs::read_dir(&dir) {
        for entry in entries.flatten() {
            if let Ok(meta) = entry.metadata() {
                if meta.modified().map(|m| m < cutoff).unwrap_or(false) {
                    let _ = std::fs::remove_file(entry.path());
                }
            }
        }
    }
    Ok(())
}

fn block_meta_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_local_data_dir()
        .map(|p| p.join("block_meta"))
        .map_err(|e| e.to_string())
}

fn sanitize_session_id(id: &str) -> String {
    id.chars()
        .map(|c| {
            if c.is_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect()
}
