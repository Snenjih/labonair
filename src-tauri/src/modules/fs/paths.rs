use std::path::PathBuf;

pub fn config_dir() -> PathBuf {
    #[cfg(not(target_os = "windows"))]
    let base = dirs::home_dir()
        .expect("cannot resolve home dir")
        .join(".config");
    #[cfg(target_os = "windows")]
    let base = dirs::config_dir().expect("cannot resolve config dir");

    let dir = base.join("labonair");
    let _ = std::fs::create_dir_all(&dir);
    dir
}

pub fn data_dir() -> PathBuf {
    // Maps to ~/Library/Application Support on macOS, ~/.local/share on Linux,
    // %LOCALAPPDATA% on Windows — all browsable, none treated as app bundles.
    let base = dirs::data_local_dir().expect("cannot resolve local data dir");
    let dir = base.join("Labonair");
    let _ = std::fs::create_dir_all(&dir);
    dir
}

#[tauri::command]
pub fn get_storage_paths() -> serde_json::Value {
    serde_json::json!({
        "config": config_dir().to_string_lossy(),
        "data":   data_dir().to_string_lossy(),
    })
}
