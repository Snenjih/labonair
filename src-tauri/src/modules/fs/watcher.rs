use notify::RecommendedWatcher;
use notify_debouncer_mini::{new_debouncer, Debouncer};
use serde::Serialize;
use std::{
    collections::{HashMap, HashSet},
    path::Path,
    sync::{Arc, Mutex},
    time::Duration,
};
use tauri::{AppHandle, Emitter, State};

#[derive(Serialize, Clone)]
struct DirChangedPayload {
    path: String,
}

pub struct WatcherState(pub Arc<Mutex<HashMap<String, Debouncer<RecommendedWatcher>>>>);

impl Default for WatcherState {
    fn default() -> Self {
        WatcherState(Arc::new(Mutex::new(HashMap::new())))
    }
}

fn normalize_path(path: &str) -> String {
    let expanded = if path == "~" {
        dirs::home_dir()
            .map(|h| h.to_string_lossy().to_string())
            .unwrap_or_else(|| path.to_string())
    } else if let Some(rest) = path.strip_prefix("~/") {
        dirs::home_dir()
            .map(|h| format!("{}/{}", h.display(), rest))
            .unwrap_or_else(|| path.to_string())
    } else {
        path.to_string()
    };
    expanded.trim_end_matches('/').to_string()
}

fn create_watcher(
    path: &str,
    app: AppHandle,
) -> Result<Debouncer<RecommendedWatcher>, String> {
    let emit_path = path.to_string();
    let mut debouncer = new_debouncer(
        Duration::from_millis(300),
        move |res: Result<Vec<notify_debouncer_mini::DebouncedEvent>, notify::Error>| {
            if res.is_ok() {
                let _ = app.emit("fs:dir-changed", DirChangedPayload {
                    path: emit_path.clone(),
                });
            }
        },
    )
    .map_err(|e| e.to_string())?;

    debouncer
        .watcher()
        .watch(Path::new(path), notify::RecursiveMode::NonRecursive)
        .map_err(|e| e.to_string())?;

    Ok(debouncer)
}

/// Starts a non-recursive watcher for `path`. No-op if already watched.
#[tauri::command]
pub async fn fs_watch_dir(
    path: String,
    state: State<'_, WatcherState>,
    app: AppHandle,
) -> Result<(), String> {
    let key = normalize_path(&path);

    {
        let map = state.0.lock().map_err(|e| e.to_string())?;
        if map.contains_key(&key) {
            return Ok(());
        }
    }

    if !Path::new(&key).is_dir() {
        return Ok(());
    }

    let debouncer = create_watcher(&key, app)?;
    state
        .0
        .lock()
        .map_err(|e| e.to_string())?
        .insert(key, debouncer);

    Ok(())
}

/// Stops the watcher for `path`. No-op if not currently watched.
#[tauri::command]
pub async fn fs_unwatch_dir(
    path: String,
    state: State<'_, WatcherState>,
) -> Result<(), String> {
    let key = normalize_path(&path);
    state.0.lock().map_err(|e| e.to_string())?.remove(&key);
    Ok(())
}

/// Synchronises the active watcher set to exactly `paths`.
/// Removes stale watchers and starts new ones. Call with an empty
/// vec to stop all watchers (e.g. on explorer unmount).
#[tauri::command]
pub async fn fs_sync_watchers(
    paths: Vec<String>,
    state: State<'_, WatcherState>,
    app: AppHandle,
) -> Result<(), String> {
    let normalized: Vec<String> = paths.iter().map(|p| normalize_path(p)).collect();
    let target_set: HashSet<&str> = normalized.iter().map(|s| s.as_str()).collect();

    // Collect paths not yet watched — outside the lock to avoid holding it during watcher creation.
    let to_add: Vec<String> = {
        let map = state.0.lock().map_err(|e| e.to_string())?;
        normalized
            .iter()
            .filter(|p| !map.contains_key(p.as_str()))
            .cloned()
            .collect()
    };

    // Create new watchers (potentially slow I/O) without holding the lock.
    let mut new_watchers: Vec<(String, Debouncer<RecommendedWatcher>)> = Vec::new();
    for path in to_add {
        if Path::new(&path).is_dir() {
            if let Ok(d) = create_watcher(&path, app.clone()) {
                new_watchers.push((path, d));
            }
        }
    }

    // One final lock: prune stale entries, insert new ones.
    let mut map = state.0.lock().map_err(|e| e.to_string())?;
    map.retain(|k, _| target_set.contains(k.as_str()));
    for (path, debouncer) in new_watchers {
        map.entry(path).or_insert(debouncer);
    }

    Ok(())
}
