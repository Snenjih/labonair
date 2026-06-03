use std::io::{Read, Write};
use flate2::{read::GzDecoder, write::GzEncoder, Compression};
use crate::modules::fs::paths::data_dir;

const MAX_UNCOMPRESSED_BYTES: usize = 10 * 1024 * 1024; // 10 MB

fn scrollback_path(session_id: &str) -> Result<std::path::PathBuf, String> {
    if session_id.len() != 36
        || !session_id.chars().all(|c| c.is_ascii_hexdigit() || c == '-')
    {
        return Err("invalid session_id".to_string());
    }
    let dir = data_dir().join("scrollback");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join(format!("{}.ansi.gz", session_id)))
}

#[tauri::command]
pub async fn scrollback_save(session_id: String, ansi: String) -> Result<(), String> {
    if ansi.trim().is_empty() || ansi.len() > MAX_UNCOMPRESSED_BYTES {
        return Ok(());
    }
    let path = match scrollback_path(&session_id) {
        Ok(p) => p,
        Err(_) => return Ok(()), // invalid id — silently skip
    };
    tokio::task::spawn_blocking(move || {
        let mut encoder = GzEncoder::new(Vec::new(), Compression::fast());
        encoder.write_all(ansi.as_bytes()).map_err(|e| e.to_string())?;
        let compressed = encoder.finish().map_err(|e| e.to_string())?;
        // Atomic write: write to .tmp then rename
        let tmp_path = path.with_extension("ansi.gz.tmp");
        std::fs::write(&tmp_path, &compressed).map_err(|e| e.to_string())?;
        std::fs::rename(&tmp_path, &path).map_err(|e| {
            let _ = std::fs::remove_file(&tmp_path);
            e.to_string()
        })
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn scrollback_load(session_id: String) -> Result<Option<String>, String> {
    let path = match scrollback_path(&session_id) {
        Ok(p) => p,
        Err(_) => return Ok(None), // invalid id — graceful
    };
    tokio::task::spawn_blocking(move || {
        if !path.exists() {
            return Ok(None);
        }
        let compressed = match std::fs::read(&path) {
            Ok(b) => b,
            Err(_) => return Ok(None),
        };
        let mut decoder = GzDecoder::new(&compressed[..]);
        let mut ansi = String::new();
        match decoder.read_to_string(&mut ansi) {
            Ok(_) => {
                if ansi.len() > MAX_UNCOMPRESSED_BYTES {
                    let _ = std::fs::remove_file(&path);
                    return Ok(None);
                }
                Ok(Some(ansi))
            }
            Err(_) => {
                // Corrupt file — delete it so it doesn't persist
                let _ = std::fs::remove_file(&path);
                Ok(None)
            }
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn scrollback_cleanup(known_session_ids: Vec<String>) -> Result<(), String> {
    let dir = data_dir().join("scrollback");
    tokio::task::spawn_blocking(move || {
        let entries = match std::fs::read_dir(&dir) {
            Ok(e) => e,
            Err(_) => return, // directory doesn't exist yet — nothing to clean
        };
        let known: std::collections::HashSet<&str> =
            known_session_ids.iter().map(|s| s.as_str()).collect();
        for entry in entries.flatten() {
            let name = entry.file_name();
            let name_str = name.to_string_lossy();
            // Delete stale temp files unconditionally
            if name_str.ends_with(".ansi.gz.tmp") {
                let _ = std::fs::remove_file(entry.path());
                continue;
            }
            if let Some(stem) = name_str.strip_suffix(".ansi.gz") {
                if !known.contains(stem) {
                    let _ = std::fs::remove_file(entry.path());
                }
            }
        }
    })
    .await
    .ok(); // spawn_blocking join error is non-fatal
    Ok(())
}
