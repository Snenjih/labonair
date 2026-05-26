use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

const ALLOWED_EXTENSIONS: &[&str] = &["jpg", "jpeg", "png", "gif", "webp", "avif", "bmp"];

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackgroundInfo {
    pub filename: String,
    pub path: String,
    pub size_bytes: u64,
}

fn backgrounds_dir() -> Result<PathBuf, String> {
    let dir = crate::modules::fs::paths::config_dir().join("backgrounds");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn is_allowed_extension(ext: &str) -> bool {
    ALLOWED_EXTENSIONS.contains(&ext.to_lowercase().as_str())
}

#[tauri::command]
pub async fn backgrounds_list() -> Result<Vec<BackgroundInfo>, String> {
    let dir = backgrounds_dir()?;
    let mut items = Vec::new();

    let entries = match std::fs::read_dir(&dir) {
        Ok(e) => e,
        Err(_) => return Ok(vec![]),
    };

    for entry in entries.flatten() {
        let path = entry.path();
        let ext = path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("");
        if !is_allowed_extension(ext) {
            continue;
        }
        let filename = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_string();
        let size_bytes = entry.metadata().map(|m| m.len()).unwrap_or(0);
        items.push(BackgroundInfo {
            filename,
            path: path.to_string_lossy().to_string(),
            size_bytes,
        });
    }

    items.sort_by(|a, b| a.filename.cmp(&b.filename));
    Ok(items)
}

#[tauri::command]
pub async fn background_import(source_path: String) -> Result<BackgroundInfo, String> {
    let source = std::path::Path::new(&source_path);

    let ext = source
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("");
    if !is_allowed_extension(ext) {
        return Err(format!("Unsupported image format: {}", ext));
    }

    // Only keep the filename, strip any path components (security)
    let raw_name = source
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or("Invalid source filename")?;

    let dir = backgrounds_dir()?;
    let dest = dir.join(raw_name);

    // Resolve collision: insert _<timestamp_ms> before extension
    let dest = if dest.exists() {
        let stem = source
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("background");
        let ts = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0);
        let new_name = format!("{}_{}.{}", stem, ts, ext.to_lowercase());
        dir.join(new_name)
    } else {
        dest
    };

    std::fs::copy(&source_path, &dest).map_err(|e| e.to_string())?;

    let filename = dest
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("")
        .to_string();
    let size_bytes = std::fs::metadata(&dest).map(|m| m.len()).unwrap_or(0);

    Ok(BackgroundInfo {
        filename,
        path: dest.to_string_lossy().to_string(),
        size_bytes,
    })
}

#[tauri::command]
pub async fn background_delete(filename: String) -> Result<(), String> {
    // Path traversal guard
    if filename.contains('/') || filename.contains('\\') {
        return Err("Invalid filename".to_string());
    }

    let dir = backgrounds_dir()?;
    let path = dir.join(&filename);

    // Ensure the resolved path is still inside backgrounds_dir
    let canonical_dir = dir.canonicalize().map_err(|e| e.to_string())?;
    let canonical_path = path.canonicalize().map_err(|_| "File not found".to_string())?;
    if !canonical_path.starts_with(&canonical_dir) {
        return Err("Invalid filename".to_string());
    }

    std::fs::remove_file(&canonical_path).map_err(|e| e.to_string())?;
    Ok(())
}
