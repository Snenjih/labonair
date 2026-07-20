use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;

/// A single named color variant within a theme (e.g. "dark", "light", "frappe").
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThemeVariant {
    /// "light" or "dark" — drives the root `.light`/`.dark` class when this
    /// variant is the one resolved for the active color scheme.
    pub mode: String,
    #[serde(default)]
    pub label: Option<String>,
    pub colors: HashMap<String, String>,
}

/// A single JSON theme file. Must define at least one variant with
/// `mode: "light"` and one with `mode: "dark"`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Theme {
    pub name: String,
    #[serde(default)]
    pub author: String,
    #[serde(default)]
    pub author_url: String,
    #[serde(default)]
    pub version: String,
    #[serde(default)]
    pub description: String,
    pub variants: HashMap<String, ThemeVariant>,
}

impl Theme {
    fn validate(&self) -> Result<(), String> {
        if self.variants.is_empty() {
            return Err("'variants' must contain at least one entry".to_string());
        }
        let has_light = self.variants.values().any(|v| v.mode == "light");
        let has_dark = self.variants.values().any(|v| v.mode == "dark");
        if !has_light || !has_dark {
            return Err(
                "'variants' must include at least one entry with mode \"light\" and one with mode \"dark\""
                    .to_string(),
            );
        }
        Ok(())
    }
}

/// Metadata returned to the frontend for the theme list.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThemeMeta {
    /// The filename stem (without `.json`) — used as the preference key.
    pub id: String,
    pub name: String,
    pub author: String,
    pub variants: HashMap<String, ThemeVariant>,
    /// Whether this theme is built-in (cannot be deleted).
    pub builtin: bool,
}

fn meta_from_theme(id: String, theme: Theme, builtin: bool) -> ThemeMeta {
    ThemeMeta {
        id,
        name: theme.name,
        author: theme.author,
        variants: theme.variants,
        builtin,
    }
}

const DEFAULT_JSON: &str = include_str!("default.json");

fn themes_dir(_app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = crate::modules::fs::paths::config_dir().join("themes");
    if !dir.exists() {
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    }
    Ok(dir)
}

/// Return the bundled built-in "Labonair" default theme (both variants).
#[tauri::command]
pub async fn theme_get_default() -> Result<ThemeMeta, String> {
    let theme: Theme = serde_json::from_str(DEFAULT_JSON)
        .map_err(|e| format!("Failed to parse bundled default theme: {}", e))?;
    Ok(meta_from_theme("default".to_string(), theme, true))
}

/// Return all available themes: only user `.json` files from the themes directory.
/// The built-in "Default" entry is served separately via `theme_get_default`.
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
        if id == "default" {
            continue;
        }
        let raw = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
        match serde_json::from_str::<Theme>(&raw) {
            Ok(t) => match t.validate() {
                Ok(()) => themes.push(meta_from_theme(id, t, false)),
                Err(e) => log::warn!("Skipping invalid theme {:?}: {}", path, e),
            },
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
    theme.validate()?;

    let id = src
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("imported-theme")
        .to_string();

    let dest = themes_dir(&app)?.join(format!("{}.json", id));
    std::fs::write(&dest, &raw).map_err(|e| e.to_string())?;

    Ok(meta_from_theme(id, theme, false))
}

/// Export a theme (by id) to the given destination path.
#[tauri::command]
pub async fn theme_export(
    app: tauri::AppHandle,
    id: String,
    dest_path: String,
) -> Result<(), String> {
    let content = if id == "default" {
        DEFAULT_JSON.to_string()
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
    if id == "default" {
        return Err("Cannot delete the built-in default theme.".to_string());
    }
    let path = themes_dir(&app)?.join(format!("{}.json", id));
    if path.exists() {
        std::fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Create a new theme file from the default theme values and return the ThemeMeta
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

    let mut theme: Theme = serde_json::from_str(DEFAULT_JSON)
        .map_err(|e| format!("Failed to parse default theme: {}", e))?;
    theme.name = name.clone();
    theme.author = String::new();

    let json = serde_json::to_string_pretty(&theme)
        .map_err(|e| format!("Failed to serialize theme: {}", e))?;

    let dest = themes_dir(&app)?.join(format!("{}.json", slug));
    std::fs::write(&dest, &json).map_err(|e| e.to_string())?;

    let path_str = dest.to_string_lossy().to_string();
    let meta = meta_from_theme(slug, theme, false);
    Ok((meta, path_str))
}

/// Return the absolute path to the user themes directory so the frontend can open it.
#[tauri::command]
pub async fn themes_get_dir(app: tauri::AppHandle) -> Result<String, String> {
    themes_dir(&app).map(|p| p.to_string_lossy().into_owned())
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
    theme.validate()?;

    // Derive the ID from the URL filename stem so it always matches the community
    // index convention (index id == file stem == rawUrl file stem).
    let id: String = url
        .rsplit('/')
        .next()
        .map(|fname| fname.split('?').next().unwrap_or(fname))
        .and_then(|fname| {
            std::path::Path::new(fname)
                .file_stem()
                .and_then(|s| s.to_str())
                .map(|s| s.to_string())
        })
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| {
            // Fallback: slugify the theme name
            theme
                .name
                .to_lowercase()
                .chars()
                .map(|c| if c.is_alphanumeric() || c == '-' { c } else { '-' })
                .collect::<String>()
                .split('-')
                .filter(|s| !s.is_empty())
                .collect::<Vec<_>>()
                .join("-")
        });
    let id = if id.is_empty() { "imported-theme".to_string() } else { id };

    let dest = themes_dir(&app)?.join(format!("{}.json", id));
    std::fs::write(&dest, &raw_json).map_err(|e| e.to_string())?;

    Ok(meta_from_theme(id, theme, false))
}
