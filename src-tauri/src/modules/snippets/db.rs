use super::{CommandSnippet, SnippetGroup, SnippetReorderItem};
use crate::modules::hosts::HostsDb;

fn now_millis() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

fn row_to_snippet(row: &rusqlite::Row) -> rusqlite::Result<CommandSnippet> {
    Ok(CommandSnippet {
        id: row.get(0)?,
        name: row.get(1)?,
        description: row.get(2)?,
        command: row.get(3)?,
        target: row.get(4)?,
        host_id: row.get(5)?,
        default_exec_mode: row.get(6)?,
        working_dir: row.get(7)?,
        group_id: row.get(8)?,
        tags: row.get(9)?,
        sort_order: row.get::<_, i64>(10).unwrap_or(0),
        created_at: row.get(11)?,
        updated_at: row.get(12)?,
    })
}

fn row_to_group(row: &rusqlite::Row) -> rusqlite::Result<SnippetGroup> {
    Ok(SnippetGroup {
        id: row.get(0)?,
        name: row.get(1)?,
        icon: row.get(2)?,
        color: row.get(3)?,
        sort_order: row.get::<_, i64>(4).unwrap_or(0),
        created_at: row.get(5)?,
    })
}

const SELECT_SNIPPETS: &str =
    "SELECT id, name, description, command, target, host_id, default_exec_mode, \
     working_dir, group_id, tags, sort_order, created_at, updated_at FROM snippets";

// ── Snippets ─────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn snippets_get_all(db: tauri::State<'_, HostsDb>) -> Result<Vec<CommandSnippet>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(&format!("{} ORDER BY sort_order ASC, name ASC", SELECT_SNIPPETS))
        .map_err(|e| e.to_string())?;
    let snippets = stmt
        .query_map([], row_to_snippet)
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(snippets)
}

#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn snippets_create(
    db: tauri::State<'_, HostsDb>,
    name: String,
    command: String,
    target: String,
    description: Option<String>,
    host_id: Option<String>,
    default_exec_mode: Option<String>,
    working_dir: Option<String>,
    group_id: Option<String>,
    tags: Option<String>,
    sort_order: Option<i64>,
) -> Result<CommandSnippet, String> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = now_millis();
    let exec_mode = default_exec_mode.unwrap_or_else(|| "terminal".to_string());
    let order = sort_order.unwrap_or(0);

    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO snippets (id, name, description, command, target, host_id, \
         default_exec_mode, working_dir, group_id, tags, sort_order, created_at, updated_at) \
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13)",
        rusqlite::params![
            id, name, description, command, target, host_id,
            exec_mode, working_dir, group_id, tags, order, now, now
        ],
    )
    .map_err(|e| e.to_string())?;

    conn.query_row(
        &format!("{} WHERE id=?1", SELECT_SNIPPETS),
        rusqlite::params![id],
        row_to_snippet,
    )
    .map_err(|e| e.to_string())
}

#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn snippets_update(
    db: tauri::State<'_, HostsDb>,
    id: String,
    name: Option<String>,
    command: Option<String>,
    target: Option<String>,
    description: Option<String>,
    host_id: Option<String>,
    default_exec_mode: Option<String>,
    working_dir: Option<String>,
    group_id: Option<String>,
    tags: Option<String>,
    sort_order: Option<i64>,
) -> Result<CommandSnippet, String> {
    let now = now_millis();
    let conn = db.0.lock().map_err(|e| e.to_string())?;

    macro_rules! maybe_update {
        ($field:expr, $col:literal, $val:expr) => {
            if let Some(v) = $val {
                conn.execute(
                    concat!("UPDATE snippets SET ", $col, "=?1 WHERE id=?2"),
                    rusqlite::params![v, id],
                )
                .map_err(|e| e.to_string())?;
            }
        };
    }

    maybe_update!(name, "name", name);
    maybe_update!(command, "command", command);
    maybe_update!(target, "target", target);
    maybe_update!(default_exec_mode, "default_exec_mode", default_exec_mode);

    if description.is_some() {
        conn.execute("UPDATE snippets SET description=?1 WHERE id=?2", rusqlite::params![description, id])
            .map_err(|e| e.to_string())?;
    }
    if host_id.is_some() {
        conn.execute("UPDATE snippets SET host_id=?1 WHERE id=?2", rusqlite::params![host_id, id])
            .map_err(|e| e.to_string())?;
    }
    if working_dir.is_some() {
        conn.execute("UPDATE snippets SET working_dir=?1 WHERE id=?2", rusqlite::params![working_dir, id])
            .map_err(|e| e.to_string())?;
    }
    if group_id.is_some() {
        conn.execute("UPDATE snippets SET group_id=?1 WHERE id=?2", rusqlite::params![group_id, id])
            .map_err(|e| e.to_string())?;
    }
    if tags.is_some() {
        conn.execute("UPDATE snippets SET tags=?1 WHERE id=?2", rusqlite::params![tags, id])
            .map_err(|e| e.to_string())?;
    }
    if let Some(v) = sort_order {
        conn.execute("UPDATE snippets SET sort_order=?1 WHERE id=?2", rusqlite::params![v, id])
            .map_err(|e| e.to_string())?;
    }

    conn.execute("UPDATE snippets SET updated_at=?1 WHERE id=?2", rusqlite::params![now, id])
        .map_err(|e| e.to_string())?;

    conn.query_row(
        &format!("{} WHERE id=?1", SELECT_SNIPPETS),
        rusqlite::params![id],
        row_to_snippet,
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn snippets_delete(
    db: tauri::State<'_, HostsDb>,
    id: String,
) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM snippets WHERE id=?1", rusqlite::params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn snippets_reorder(
    db: tauri::State<'_, HostsDb>,
    items: Vec<SnippetReorderItem>,
) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    for item in &items {
        conn.execute(
            "UPDATE snippets SET sort_order=?1 WHERE id=?2",
            rusqlite::params![item.sort_order, item.id],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

// ── Snippet Groups ────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn snippet_groups_get_all(db: tauri::State<'_, HostsDb>) -> Result<Vec<SnippetGroup>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, name, icon, color, sort_order, created_at FROM snippet_groups ORDER BY sort_order ASC, name ASC")
        .map_err(|e| e.to_string())?;
    let groups = stmt
        .query_map([], row_to_group)
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(groups)
}

#[tauri::command]
pub async fn snippet_groups_create(
    db: tauri::State<'_, HostsDb>,
    name: String,
    icon: Option<String>,
    color: Option<String>,
) -> Result<SnippetGroup, String> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = now_millis();
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO snippet_groups (id, name, icon, color, sort_order, created_at) VALUES (?1,?2,?3,?4,0,?5)",
        rusqlite::params![id, name, icon, color, now],
    )
    .map_err(|e| e.to_string())?;
    Ok(SnippetGroup { id, name, icon, color, sort_order: 0, created_at: now })
}

#[tauri::command]
pub async fn snippet_groups_update(
    db: tauri::State<'_, HostsDb>,
    id: String,
    name: Option<String>,
    icon: Option<String>,
    color: Option<String>,
) -> Result<SnippetGroup, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    if let Some(v) = name {
        conn.execute("UPDATE snippet_groups SET name=?1 WHERE id=?2", rusqlite::params![v, id])
            .map_err(|e| e.to_string())?;
    }
    if icon.is_some() {
        conn.execute("UPDATE snippet_groups SET icon=?1 WHERE id=?2", rusqlite::params![icon, id])
            .map_err(|e| e.to_string())?;
    }
    if color.is_some() {
        conn.execute("UPDATE snippet_groups SET color=?1 WHERE id=?2", rusqlite::params![color, id])
            .map_err(|e| e.to_string())?;
    }
    conn.query_row(
        "SELECT id, name, icon, color, sort_order, created_at FROM snippet_groups WHERE id=?1",
        rusqlite::params![id],
        row_to_group,
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn snippet_groups_delete(
    db: tauri::State<'_, HostsDb>,
    id: String,
) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    // Ungroup snippets in this group before deleting
    conn.execute("UPDATE snippets SET group_id=NULL WHERE group_id=?1", rusqlite::params![id])
        .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM snippet_groups WHERE id=?1", rusqlite::params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}
