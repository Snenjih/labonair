use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use tauri::AppHandle;
use tauri::Manager;

const DEFAULT_DARK_JSON: &str = include_str!("../../../assets/themes/default-dark.json");

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThemeMeta {
    pub id: String,
    pub name: String,
    pub author: String,
    #[serde(rename = "type")]
    pub theme_type: String,
    pub colors: HashMap<String, String>,
    #[serde(default)]
    pub builtin: bool,
}

fn themes_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let data_dir = app
        .path()
        .app_local_data_dir()
        .map_err(|e| e.to_string())?;
    Ok(data_dir.join("themes"))
}

fn load_default_dark() -> Result<ThemeMeta, String> {
    let mut meta: ThemeMeta =
        serde_json::from_str(DEFAULT_DARK_JSON).map_err(|e| e.to_string())?;
    meta.id = "default-dark".to_string();
    meta.builtin = true;
    Ok(meta)
}

fn load_theme_file(path: &std::path::Path, id: &str) -> Result<ThemeMeta, String> {
    let contents = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    let mut meta: ThemeMeta = serde_json::from_str(&contents).map_err(|e| e.to_string())?;
    meta.id = id.to_string();
    meta.builtin = false;
    Ok(meta)
}

#[tauri::command]
pub async fn themes_get_all(app: AppHandle) -> Result<Vec<ThemeMeta>, String> {
    let mut themes = Vec::new();

    let default_dark = load_default_dark()?;
    themes.push(default_dark);

    let dir = themes_dir(&app)?;
    if dir.exists() {
        let entries =
            std::fs::read_dir(&dir).map_err(|e| format!("Cannot read themes dir: {e}"))?;

        let mut user_themes: Vec<ThemeMeta> = Vec::new();
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|s| s.to_str()) != Some("json") {
                continue;
            }
            let stem = path
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or_default()
                .to_string();
            if stem == "default-dark" {
                continue;
            }
            match load_theme_file(&path, &stem) {
                Ok(t) => user_themes.push(t),
                Err(e) => eprintln!("Failed to load theme {stem}: {e}"),
            }
        }
        user_themes.sort_by(|a, b| a.name.cmp(&b.name));
        themes.extend(user_themes);
    }

    Ok(themes)
}

#[tauri::command]
pub async fn theme_import(app: AppHandle, source_path: String) -> Result<(), String> {
    let src = std::path::Path::new(&source_path);

    // Validate: must be parseable as a ThemeMeta
    let contents = std::fs::read_to_string(src)
        .map_err(|e| format!("Cannot read source file: {e}"))?;
    let _meta: ThemeMeta =
        serde_json::from_str(&contents).map_err(|e| format!("Invalid theme JSON: {e}"))?;

    let dir = themes_dir(&app)?;
    std::fs::create_dir_all(&dir)
        .map_err(|e| format!("Cannot create themes directory: {e}"))?;

    let filename = src
        .file_name()
        .ok_or("Source path has no filename")?;
    let dest = dir.join(filename);
    std::fs::copy(src, &dest).map_err(|e| format!("Copy failed: {e}"))?;

    Ok(())
}

#[tauri::command]
pub async fn theme_export(app: AppHandle, id: String, dest_path: String) -> Result<(), String> {
    if id == "default-dark" {
        std::fs::write(&dest_path, DEFAULT_DARK_JSON)
            .map_err(|e| format!("Write failed: {e}"))?;
        return Ok(());
    }

    let dir = themes_dir(&app)?;
    let src = dir.join(format!("{id}.json"));
    if !src.exists() {
        return Err(format!("Theme '{id}' not found"));
    }
    std::fs::copy(&src, &dest_path).map_err(|e| format!("Copy failed: {e}"))?;

    Ok(())
}

#[tauri::command]
pub async fn theme_delete(app: AppHandle, id: String) -> Result<(), String> {
    if id == "default-dark" {
        return Err("Cannot delete built-in themes".to_string());
    }

    let dir = themes_dir(&app)?;
    let path = dir.join(format!("{id}.json"));
    if !path.exists() {
        return Err(format!("Theme '{id}' not found"));
    }
    std::fs::remove_file(&path).map_err(|e| format!("Delete failed: {e}"))?;

    Ok(())
}
