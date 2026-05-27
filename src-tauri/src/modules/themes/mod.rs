use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;

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

fn themes_dir(_app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = crate::modules::fs::paths::config_dir().join("themes");
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

/// Create a new theme file from the default dark theme values and return the ThemeMeta
/// plus the absolute path to the created file so the frontend can open it in the editor.
#[tauri::command]
pub async fn theme_create(app: tauri::AppHandle, name: String) -> Result<(ThemeMeta, String), String> {
    // Derive a filesystem-safe slug from the name
    let slug: String = name
        .to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() || c == '-' { c } else { '-' })
        .collect::<String>()
        .split('-')
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join("-");
    let slug = if slug.is_empty() { "my-theme".to_string() } else { slug };

    let mut theme: Theme = serde_json::from_str(DEFAULT_DARK_JSON)
        .map_err(|e| format!("Failed to parse default theme: {}", e))?;
    theme.name = name.clone();
    theme.author = String::new();

    let json = serde_json::to_string_pretty(&theme)
        .map_err(|e| format!("Failed to serialize theme: {}", e))?;

    let dest = themes_dir(&app)?.join(format!("{}.json", slug));
    std::fs::write(&dest, &json).map_err(|e| e.to_string())?;

    let path_str = dest.to_string_lossy().to_string();
    let meta = ThemeMeta {
        id: slug,
        name,
        author: String::new(),
        theme_type: theme.theme_type,
        colors: theme.colors,
        builtin: false,
    };
    Ok((meta, path_str))
}

/// Fetch the remote theme index JSON via reqwest (bypasses Tauri CSP / CORS).
/// Returns the raw JSON string; React parses it with JSON.parse().
#[tauri::command]
pub async fn theme_fetch_index(url: String) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;
    let res = client.get(&url).send().await.map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("HTTP {}", res.status()));
    }
    res.text().await.map_err(|e| e.to_string())
}

/// Download a theme JSON from a URL, validate it, and save it to the themes dir.
#[tauri::command]
pub async fn theme_download(app: tauri::AppHandle, url: String) -> Result<ThemeMeta, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;
    let res = client.get(&url).send().await.map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("Failed to download theme. HTTP {}", res.status()));
    }
    let raw_json = res.text().await.map_err(|e| e.to_string())?;

    let theme: Theme = serde_json::from_str(&raw_json)
        .map_err(|e| format!("Invalid theme JSON: {}", e))?;

    // Derive a safe filesystem ID from the name
    let id: String = theme
        .name
        .to_lowercase()
        .chars()
        .map(|c| if c.is_alphanumeric() || c == '-' { c } else { '-' })
        .collect::<String>()
        .split('-')
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join("-");
    let id = if id.is_empty() { "imported-theme".to_string() } else { id };

    let dest = themes_dir(&app)?.join(format!("{}.json", id));
    std::fs::write(&dest, &raw_json).map_err(|e| e.to_string())?;

    Ok(ThemeMeta {
        id,
        name: theme.name,
        author: theme.author,
        theme_type: theme.theme_type,
        colors: theme.colors,
        builtin: false,
    })
}
