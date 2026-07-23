use serde_json::Value;
use tauri::{AppHandle, State};
use tauri_plugin_store::StoreExt;
use tokio::sync::Mutex;

use crate::modules::fs::paths::config_dir;

const SETTINGS_FILE: &str = "labonair-settings.json";
const KEY_BAR_ITEM_PLACEMENTS: &str = "barItemPlacements";

/// Serializes every `settings_set_bar_item_placement` call across all
/// windows (they share one Rust process) so the read-merge-write of the
/// `barItemPlacements` blob can never interleave — the JS-side
/// LazyStore.get()/set()/save() sequence this replaces had no such
/// guarantee, so two near-simultaneous edits (same window, rapid clicks; or
/// two different windows, e.g. the Settings window and the main window)
/// could silently drop one write.
#[derive(Default)]
pub struct BarItemPlacementLock(pub Mutex<()>);

/// Atomically merges `patch` into `barItemPlacements[item_id]` and persists
/// it, using the same absolute settings-file path the JS `LazyStore`
/// resolves (`config_dir()`, also used by `fs::paths::get_storage_paths`),
/// so both sides read/write the identical underlying store.
#[tauri::command]
pub async fn settings_set_bar_item_placement(
    app: AppHandle,
    lock: State<'_, BarItemPlacementLock>,
    item_id: String,
    patch: Value,
) -> Result<(), String> {
    let _guard = lock.0.lock().await;

    let store = app
        .store(config_dir().join(SETTINGS_FILE))
        .map_err(|e| e.to_string())?;

    let mut placements = store
        .get(KEY_BAR_ITEM_PLACEMENTS)
        .and_then(|v| v.as_object().cloned())
        .unwrap_or_default();

    let mut entry = placements
        .get(&item_id)
        .and_then(|v| v.as_object().cloned())
        .unwrap_or_default();

    if let Some(patch_obj) = patch.as_object() {
        for (k, v) in patch_obj {
            entry.insert(k.clone(), v.clone());
        }
    }
    entry.insert("itemId".to_string(), Value::String(item_id.clone()));

    placements.insert(item_id, Value::Object(entry));

    store.set(KEY_BAR_ITEM_PLACEMENTS, Value::Object(placements));
    store.save().map_err(|e| e.to_string())
}
