use super::{Group, Host, HostsDb};

pub fn initialize_db(
    app_local_data_dir: std::path::PathBuf,
) -> Result<rusqlite::Connection, String> {
    std::fs::create_dir_all(&app_local_data_dir).map_err(|e| e.to_string())?;
    let db_path = app_local_data_dir.join("nexum.db");
    let conn = rusqlite::Connection::open(&db_path).map_err(|e| e.to_string())?;
    conn.execute_batch("PRAGMA journal_mode=WAL;")
        .map_err(|e| e.to_string())?;
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS groups (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            icon TEXT,
            color TEXT,
            created_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS hosts (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            host_address TEXT NOT NULL,
            port INTEGER NOT NULL DEFAULT 22,
            username TEXT NOT NULL,
            auth_method TEXT NOT NULL DEFAULT 'password',
            private_key_path TEXT,
            group_id TEXT REFERENCES groups(id) ON DELETE SET NULL,
            tags TEXT,
            created_at INTEGER NOT NULL,
            last_connected_at INTEGER
        );",
    )
    .map_err(|e| e.to_string())?;
    Ok(conn)
}

fn now_millis() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

#[tauri::command]
pub async fn hosts_get_all(db: tauri::State<'_, HostsDb>) -> Result<Vec<Host>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT id, name, host_address, port, username, auth_method, private_key_path, group_id, tags, created_at, last_connected_at FROM hosts ORDER BY name",
        )
        .map_err(|e| e.to_string())?;
    let hosts = stmt
        .query_map([], |row| {
            Ok(Host {
                id: row.get(0)?,
                name: row.get(1)?,
                host_address: row.get(2)?,
                port: row.get(3)?,
                username: row.get(4)?,
                auth_method: row.get(5)?,
                private_key_path: row.get(6)?,
                group_id: row.get(7)?,
                tags: row.get(8)?,
                created_at: row.get(9)?,
                last_connected_at: row.get(10)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(hosts)
}

#[tauri::command]
pub async fn hosts_create(
    db: tauri::State<'_, HostsDb>,
    name: String,
    host_address: String,
    port: i64,
    username: String,
    auth_method: String,
    private_key_path: Option<String>,
    group_id: Option<String>,
    tags: Option<String>,
    password: Option<String>,
) -> Result<Host, String> {
    let id = uuid::Uuid::new_v4().to_string();
    let created_at = now_millis();
    {
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT INTO hosts (id, name, host_address, port, username, auth_method, private_key_path, group_id, tags, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            rusqlite::params![id, name, host_address, port, username, auth_method, private_key_path, group_id, tags, created_at],
        )
        .map_err(|e| e.to_string())?;
    }
    if let Some(pw) = password {
        keyring::Entry::new("nexum-app", &id)
            .map_err(|e| e.to_string())?
            .set_password(&pw)
            .map_err(|e| e.to_string())?;
    }
    Ok(Host {
        id,
        name,
        host_address,
        port,
        username,
        auth_method,
        private_key_path,
        group_id,
        tags,
        created_at,
        last_connected_at: None,
    })
}

#[tauri::command]
pub async fn hosts_update(
    db: tauri::State<'_, HostsDb>,
    id: String,
    name: Option<String>,
    host_address: Option<String>,
    port: Option<i64>,
    username: Option<String>,
    auth_method: Option<String>,
    private_key_path: Option<String>,
    group_id: Option<String>,
    tags: Option<String>,
    password: Option<String>,
) -> Result<Host, String> {
    {
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        if let Some(v) = &name {
            conn.execute("UPDATE hosts SET name=?1 WHERE id=?2", rusqlite::params![v, id])
                .map_err(|e| e.to_string())?;
        }
        if let Some(v) = &host_address {
            conn.execute("UPDATE hosts SET host_address=?1 WHERE id=?2", rusqlite::params![v, id])
                .map_err(|e| e.to_string())?;
        }
        if let Some(v) = port {
            conn.execute("UPDATE hosts SET port=?1 WHERE id=?2", rusqlite::params![v, id])
                .map_err(|e| e.to_string())?;
        }
        if let Some(v) = &username {
            conn.execute("UPDATE hosts SET username=?1 WHERE id=?2", rusqlite::params![v, id])
                .map_err(|e| e.to_string())?;
        }
        if let Some(v) = &auth_method {
            conn.execute("UPDATE hosts SET auth_method=?1 WHERE id=?2", rusqlite::params![v, id])
                .map_err(|e| e.to_string())?;
        }
        if private_key_path.is_some() {
            conn.execute("UPDATE hosts SET private_key_path=?1 WHERE id=?2", rusqlite::params![private_key_path, id])
                .map_err(|e| e.to_string())?;
        }
        if group_id.is_some() {
            conn.execute("UPDATE hosts SET group_id=?1 WHERE id=?2", rusqlite::params![group_id, id])
                .map_err(|e| e.to_string())?;
        }
        if tags.is_some() {
            conn.execute("UPDATE hosts SET tags=?1 WHERE id=?2", rusqlite::params![tags, id])
                .map_err(|e| e.to_string())?;
        }
    }
    if let Some(pw) = password {
        keyring::Entry::new("nexum-app", &id)
            .map_err(|e| e.to_string())?
            .set_password(&pw)
            .map_err(|e| e.to_string())?;
    }
    let host = {
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        conn.query_row(
            "SELECT id, name, host_address, port, username, auth_method, private_key_path, group_id, tags, created_at, last_connected_at FROM hosts WHERE id=?1",
            rusqlite::params![id],
            |row| Ok(Host {
                id: row.get(0)?,
                name: row.get(1)?,
                host_address: row.get(2)?,
                port: row.get(3)?,
                username: row.get(4)?,
                auth_method: row.get(5)?,
                private_key_path: row.get(6)?,
                group_id: row.get(7)?,
                tags: row.get(8)?,
                created_at: row.get(9)?,
                last_connected_at: row.get(10)?,
            }),
        )
        .map_err(|e| e.to_string())?
    };
    Ok(host)
}

#[tauri::command]
pub async fn hosts_delete(db: tauri::State<'_, HostsDb>, id: String) -> Result<(), String> {
    {
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM hosts WHERE id=?1", rusqlite::params![id])
            .map_err(|e| e.to_string())?;
    }
    let _ = keyring::Entry::new("nexum-app", &id).and_then(|e| e.delete_credential());
    Ok(())
}

#[tauri::command]
pub async fn groups_get_all(db: tauri::State<'_, HostsDb>) -> Result<Vec<Group>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, name, icon, color, created_at FROM groups ORDER BY name")
        .map_err(|e| e.to_string())?;
    let groups = stmt
        .query_map([], |row| {
            Ok(Group {
                id: row.get(0)?,
                name: row.get(1)?,
                icon: row.get(2)?,
                color: row.get(3)?,
                created_at: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(groups)
}

#[tauri::command]
pub async fn groups_create(
    db: tauri::State<'_, HostsDb>,
    name: String,
    icon: Option<String>,
    color: Option<String>,
) -> Result<Group, String> {
    let id = uuid::Uuid::new_v4().to_string();
    let created_at = now_millis();
    {
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        conn.execute(
            "INSERT INTO groups (id, name, icon, color, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params![id, name, icon, color, created_at],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(Group {
        id,
        name,
        icon,
        color,
        created_at,
    })
}

#[tauri::command]
pub async fn groups_delete(db: tauri::State<'_, HostsDb>, id: String) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM groups WHERE id=?1", rusqlite::params![id])
        .map_err(|e| e.to_string())?;
    Ok(())
}
