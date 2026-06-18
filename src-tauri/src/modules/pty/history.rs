/// Shell history command stubs.
/// These return empty results until a full SQLite-backed history implementation
/// is added in a future iteration.

#[tauri::command]
pub async fn history_suggest(_line: String) -> Result<Option<String>, String> {
    Ok(None)
}

#[tauri::command]
pub async fn history_commands(_prefix: String, _limit: usize) -> Result<Vec<String>, String> {
    Ok(vec![])
}

#[tauri::command]
pub async fn history_list(_query: String, _limit: usize) -> Result<Vec<String>, String> {
    Ok(vec![])
}

#[tauri::command]
pub async fn history_record(_command: String) -> Result<(), String> {
    Ok(())
}
