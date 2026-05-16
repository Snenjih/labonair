use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use tauri::Manager;

/// A single JSON theme file.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Theme {
    pub name: String,
    #[serde(default)]
    pub author: String,
    #[serde(rename = "type", default = "default_type")]
    pub theme_type: String,
    pub colors: HashMap<String, String>,
}

fn default_type() -> String {
    "dark".to_string()
}

/// Metadata returned to the frontend for the theme list.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThemeMeta {
    /// The filename stem (without `.json`) — used as the preference key.
    pub id: String,
    pub name: String,
    pub author: String,
    #[serde(rename = "type")]
    pub theme_type: String,
    /// The full theme including colors (used for live preview).
    pub colors: HashMap<String, String>,
    /// Whether this theme is built-in (cannot be deleted).
    pub builtin: bool,
}

const DEFAULT_DARK_JSON: &str = include_str!("default-dark.json");

fn themes_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let base = app
        .path()
        .app_local_data_dir()
        .map_err(|e| e.to_string())?;
    let dir = base.join("themes");
    if !dir.exists() {
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    }
    Ok(dir)
}

/// Return all available themes: only user `.json` files from the themes directory.
/// The built-in "Default (System)" entry is hardcoded in ThemePicker.tsx.
#[tauri::command]
pub async fn themes_get_all(app: tauri::AppHandle) -> Result<Vec<ThemeMeta>, String> {
    let mut themes = Vec::new();

    let dir = themes_dir(&app)?;
    let entries = std::fs::read_dir(&dir).map_err(|e| e.to_string())?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        let id = path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_string();
        if id == "default-dark" {
            continue;
        }
        let raw = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
        match serde_json::from_str::<Theme>(&raw) {
            Ok(t) => themes.push(ThemeMeta {
                id,
                name: t.name,
                author: t.author,
                theme_type: t.theme_type,
                colors: t.colors,
                builtin: false,
            }),
            Err(e) => log::warn!("Skipping invalid theme {:?}: {}", path, e),
        }
    }
    Ok(themes)
}

/// Import a theme from the given file path, copying it into the themes dir.
#[tauri::command]
pub async fn theme_import(
    app: tauri::AppHandle,
    source_path: String,
) -> Result<ThemeMeta, String> {
    let src = PathBuf::from(&source_path);
    let raw = std::fs::read_to_string(&src).map_err(|e| e.to_string())?;
    let theme: Theme = serde_json::from_str(&raw).map_err(|e| e.to_string())?;

    let id = src
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("imported-theme")
        .to_string();

    let dest = themes_dir(&app)?.join(format!("{}.json", id));
    std::fs::write(&dest, &raw).map_err(|e| e.to_string())?;

    Ok(ThemeMeta {
        id,
        name: theme.name,
        author: theme.author,
        theme_type: theme.theme_type,
        colors: theme.colors,
        builtin: false,
    })
}

/// Export a theme (by id) to the given destination path.
#[tauri::command]
pub async fn theme_export(
    app: tauri::AppHandle,
    id: String,
    dest_path: String,
) -> Result<(), String> {
    let content = if id == "default-dark" {
        DEFAULT_DARK_JSON.to_string()
    } else {
        let src = themes_dir(&app)?.join(format!("{}.json", id));
        std::fs::read_to_string(&src).map_err(|e| e.to_string())?
    };
    std::fs::write(dest_path, content).map_err(|e| e.to_string())?;
    Ok(())
}

/// Delete a user-created theme by id. Built-in themes cannot be deleted.
#[tauri::command]
pub async fn theme_delete(app: tauri::AppHandle, id: String) -> Result<(), String> {
    if id == "default-dark" {
        return Err("Cannot delete the built-in default theme.".to_string());
    }
    let path = themes_dir(&app)?.join(format!("{}.json", id));
    if path.exists() {
        std::fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    Ok(())
}
