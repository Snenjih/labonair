use super::{CommandSnippet, SnippetGroup, SnippetReorderItem};
use crate::modules::errors::LabonairError;
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
pub async fn snippets_get_all(db: tauri::State<'_, HostsDb>) -> Result<Vec<CommandSnippet>, LabonairError> {
    let conn = db.0.lock().map_err(|e| LabonairError::Internal(e.to_string()))?;
    let mut stmt = conn
        .prepare(&format!("{} ORDER BY sort_order ASC, name ASC", SELECT_SNIPPETS))?;
    let snippets = stmt
        .query_map([], row_to_snippet)?
        .collect::<Result<Vec<_>, _>>()?;
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
) -> Result<CommandSnippet, LabonairError> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = now_millis();
    let exec_mode = default_exec_mode.unwrap_or_else(|| "terminal".to_string());
    let order = sort_order.unwrap_or(0);

    let conn = db.0.lock().map_err(|e| LabonairError::Internal(e.to_string()))?;
    conn.execute(
        "INSERT INTO snippets (id, name, description, command, target, host_id, \
         default_exec_mode, working_dir, group_id, tags, sort_order, created_at, updated_at) \
         VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13)",
        rusqlite::params![
            id, name, description, command, target, host_id,
            exec_mode, working_dir, group_id, tags, order, now, now
        ],
    )?;

    Ok(conn.query_row(
        &format!("{} WHERE id=?1", SELECT_SNIPPETS),
        rusqlite::params![id],
        row_to_snippet,
    )?)
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
) -> Result<CommandSnippet, LabonairError> {
    let now = now_millis();
    let conn = db.0.lock().map_err(|e| LabonairError::Internal(e.to_string()))?;

    macro_rules! maybe_update {
        ($field:expr, $col:literal, $val:expr) => {
            if let Some(v) = $val {
                conn.execute(
                    concat!("UPDATE snippets SET ", $col, "=?1 WHERE id=?2"),
                    rusqlite::params![v, id],
                )?;
            }
        };
    }

    maybe_update!(name, "name", name);
    maybe_update!(command, "command", command);
    maybe_update!(target, "target", target);
    maybe_update!(default_exec_mode, "default_exec_mode", default_exec_mode);

    if description.is_some() {
        conn.execute("UPDATE snippets SET description=?1 WHERE id=?2", rusqlite::params![description, id])?;
    }
    if host_id.is_some() {
        conn.execute("UPDATE snippets SET host_id=?1 WHERE id=?2", rusqlite::params![host_id, id])?;
    }
    if working_dir.is_some() {
        conn.execute("UPDATE snippets SET working_dir=?1 WHERE id=?2", rusqlite::params![working_dir, id])?;
    }
    if group_id.is_some() {
        conn.execute("UPDATE snippets SET group_id=?1 WHERE id=?2", rusqlite::params![group_id, id])?;
    }
    if tags.is_some() {
        conn.execute("UPDATE snippets SET tags=?1 WHERE id=?2", rusqlite::params![tags, id])?;
    }
    if let Some(v) = sort_order {
        conn.execute("UPDATE snippets SET sort_order=?1 WHERE id=?2", rusqlite::params![v, id])?;
    }

    conn.execute("UPDATE snippets SET updated_at=?1 WHERE id=?2", rusqlite::params![now, id])?;

    Ok(conn.query_row(
        &format!("{} WHERE id=?1", SELECT_SNIPPETS),
        rusqlite::params![id],
        row_to_snippet,
    )?)
}

#[tauri::command]
pub async fn snippets_delete(
    db: tauri::State<'_, HostsDb>,
    id: String,
) -> Result<(), LabonairError> {
    let conn = db.0.lock().map_err(|e| LabonairError::Internal(e.to_string()))?;
    conn.execute("DELETE FROM snippets WHERE id=?1", rusqlite::params![id])?;
    Ok(())
}

#[tauri::command]
pub async fn snippets_reorder(
    db: tauri::State<'_, HostsDb>,
    items: Vec<SnippetReorderItem>,
) -> Result<(), LabonairError> {
    let conn = db.0.lock().map_err(|e| LabonairError::Internal(e.to_string()))?;
    for item in &items {
        conn.execute(
            "UPDATE snippets SET sort_order=?1 WHERE id=?2",
            rusqlite::params![item.sort_order, item.id],
        )?;
    }
    Ok(())
}

// ── Snippet Groups ────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn snippet_groups_get_all(db: tauri::State<'_, HostsDb>) -> Result<Vec<SnippetGroup>, LabonairError> {
    let conn = db.0.lock().map_err(|e| LabonairError::Internal(e.to_string()))?;
    let mut stmt = conn
        .prepare("SELECT id, name, icon, color, sort_order, created_at FROM snippet_groups ORDER BY sort_order ASC, name ASC")?;
    let groups = stmt
        .query_map([], row_to_group)?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(groups)
}

#[tauri::command]
pub async fn snippet_groups_create(
    db: tauri::State<'_, HostsDb>,
    name: String,
    icon: Option<String>,
    color: Option<String>,
) -> Result<SnippetGroup, LabonairError> {
    let id = uuid::Uuid::new_v4().to_string();
    let now = now_millis();
    let conn = db.0.lock().map_err(|e| LabonairError::Internal(e.to_string()))?;
    conn.execute(
        "INSERT INTO snippet_groups (id, name, icon, color, sort_order, created_at) VALUES (?1,?2,?3,?4,0,?5)",
        rusqlite::params![id, name, icon, color, now],
    )?;
    Ok(SnippetGroup { id, name, icon, color, sort_order: 0, created_at: now })
}

#[tauri::command]
pub async fn snippet_groups_update(
    db: tauri::State<'_, HostsDb>,
    id: String,
    name: Option<String>,
    icon: Option<String>,
    color: Option<String>,
) -> Result<SnippetGroup, LabonairError> {
    let conn = db.0.lock().map_err(|e| LabonairError::Internal(e.to_string()))?;
    if let Some(v) = name {
        conn.execute("UPDATE snippet_groups SET name=?1 WHERE id=?2", rusqlite::params![v, id])?;
    }
    if icon.is_some() {
        conn.execute("UPDATE snippet_groups SET icon=?1 WHERE id=?2", rusqlite::params![icon, id])?;
    }
    if color.is_some() {
        conn.execute("UPDATE snippet_groups SET color=?1 WHERE id=?2", rusqlite::params![color, id])?;
    }
    Ok(conn.query_row(
        "SELECT id, name, icon, color, sort_order, created_at FROM snippet_groups WHERE id=?1",
        rusqlite::params![id],
        row_to_group,
    )?)
}

#[tauri::command]
pub async fn snippet_groups_delete(
    db: tauri::State<'_, HostsDb>,
    id: String,
) -> Result<(), LabonairError> {
    let conn = db.0.lock().map_err(|e| LabonairError::Internal(e.to_string()))?;
    conn.execute("UPDATE snippets SET group_id=NULL WHERE group_id=?1", rusqlite::params![id])?;
    conn.execute("DELETE FROM snippet_groups WHERE id=?1", rusqlite::params![id])?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    fn init_test_db() -> Connection {
        let conn = Connection::open_in_memory().expect("in-memory db");
        conn.execute_batch(
            "CREATE TABLE snippet_groups (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                icon TEXT,
                color TEXT,
                sort_order INTEGER NOT NULL DEFAULT 0,
                created_at INTEGER NOT NULL
            );
            CREATE TABLE snippets (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                command TEXT NOT NULL,
                target TEXT NOT NULL DEFAULT 'local',
                host_id TEXT,
                default_exec_mode TEXT NOT NULL DEFAULT 'terminal',
                working_dir TEXT,
                group_id TEXT REFERENCES snippet_groups(id) ON DELETE SET NULL,
                tags TEXT,
                sort_order INTEGER NOT NULL DEFAULT 0,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );",
        )
        .expect("schema");
        conn
    }

    fn query_snippet_groups(conn: &Connection) -> Vec<SnippetGroup> {
        let mut stmt = conn
            .prepare(
                "SELECT id, name, icon, color, sort_order, created_at \
                 FROM snippet_groups ORDER BY sort_order ASC, name ASC",
            )
            .unwrap();
        stmt.query_map([], |row| {
            Ok(SnippetGroup {
                id: row.get(0)?,
                name: row.get(1)?,
                icon: row.get(2)?,
                color: row.get(3)?,
                sort_order: row.get::<_, i64>(4).unwrap_or(0),
                created_at: row.get(5)?,
            })
        })
        .unwrap()
        .collect::<Result<Vec<_>, _>>()
        .unwrap()
    }

    fn insert_snippet_group(conn: &Connection, id: &str, name: &str) -> SnippetGroup {
        let now = 1_000_000i64;
        conn.execute(
            "INSERT INTO snippet_groups (id, name, icon, color, sort_order, created_at) \
             VALUES (?1, ?2, NULL, NULL, 0, ?3)",
            rusqlite::params![id, name, now],
        )
        .unwrap();
        SnippetGroup {
            id: id.to_string(),
            name: name.to_string(),
            icon: None,
            color: None,
            sort_order: 0,
            created_at: now,
        }
    }

    #[test]
    fn empty_db_has_no_snippet_groups() {
        let conn = init_test_db();
        assert!(query_snippet_groups(&conn).is_empty());
    }

    #[test]
    fn insert_and_query_snippet_group() {
        let conn = init_test_db();
        let group = insert_snippet_group(&conn, "sg1", "Deploy");
        let groups = query_snippet_groups(&conn);
        assert_eq!(groups.len(), 1);
        assert_eq!(groups[0], group);
    }

    #[test]
    fn update_snippet_group_name() {
        let conn = init_test_db();
        insert_snippet_group(&conn, "sg1", "Old");
        conn.execute(
            "UPDATE snippet_groups SET name=?1 WHERE id=?2",
            rusqlite::params!["New", "sg1"],
        )
        .unwrap();
        let groups = query_snippet_groups(&conn);
        assert_eq!(groups[0].name, "New");
    }

    #[test]
    fn delete_snippet_group_removes_it() {
        let conn = init_test_db();
        insert_snippet_group(&conn, "sg1", "To Delete");
        conn.execute(
            "DELETE FROM snippet_groups WHERE id=?1",
            rusqlite::params!["sg1"],
        )
        .unwrap();
        assert!(query_snippet_groups(&conn).is_empty());
    }

    #[test]
    fn delete_snippet_group_nulls_snippet_group_id() {
        let conn = init_test_db();
        insert_snippet_group(&conn, "sg1", "Group");
        let now = 1_000_000i64;
        conn.execute(
            "INSERT INTO snippets (id, name, command, target, default_exec_mode, group_id, sort_order, created_at, updated_at) \
             VALUES ('s1', 'My Script', 'echo hi', 'local', 'terminal', 'sg1', 0, ?1, ?1)",
            rusqlite::params![now],
        )
        .unwrap();
        conn.execute(
            "UPDATE snippets SET group_id=NULL WHERE group_id='sg1'",
            [],
        )
        .unwrap();
        conn.execute(
            "DELETE FROM snippet_groups WHERE id='sg1'",
            [],
        )
        .unwrap();
        let group_id: Option<String> = conn
            .query_row(
                "SELECT group_id FROM snippets WHERE id='s1'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert!(group_id.is_none());
    }

    #[test]
    fn snippets_reorder_updates_sort_order() {
        let conn = init_test_db();
        let now = 1_000_000i64;
        for (id, name, order) in &[("s1", "Alpha", 0i64), ("s2", "Beta", 1)] {
            conn.execute(
                "INSERT INTO snippets (id, name, command, target, default_exec_mode, sort_order, created_at, updated_at) \
                 VALUES (?1, ?2, 'echo', 'local', 'terminal', ?3, ?4, ?4)",
                rusqlite::params![id, name, order, now],
            )
            .unwrap();
        }
        // Reorder: swap sort orders
        conn.execute(
            "UPDATE snippets SET sort_order=?1 WHERE id='s1'",
            rusqlite::params![10i64],
        )
        .unwrap();
        conn.execute(
            "UPDATE snippets SET sort_order=?1 WHERE id='s2'",
            rusqlite::params![0i64],
        )
        .unwrap();
        let orders: Vec<(String, i64)> = {
            let mut stmt = conn
                .prepare("SELECT id, sort_order FROM snippets ORDER BY sort_order ASC")
                .unwrap();
            stmt.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?)))
                .unwrap()
                .collect::<Result<_, _>>()
                .unwrap()
        };
        assert_eq!(orders[0].0, "s2");
        assert_eq!(orders[1].0, "s1");
    }
}
