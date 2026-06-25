use super::{Group, Host, HostsDb, ReorderItem};
use crate::modules::errors::LabonairError;
use crate::modules::secrets::{delete_password, get_password, store_password, SecretsState};

pub fn initialize_db(
    app_local_data_dir: std::path::PathBuf,
) -> Result<rusqlite::Connection, String> {
    std::fs::create_dir_all(&app_local_data_dir).map_err(|e| e.to_string())?;
    // Migrate nexum.db → labonair.db on first launch after rename
    let labonair_path = app_local_data_dir.join("labonair.db");
    let nexum_path = app_local_data_dir.join("nexum.db");
    if nexum_path.exists() && !labonair_path.exists() {
        let _ = std::fs::rename(&nexum_path, &labonair_path);
    }
    let db_path = app_local_data_dir.join("labonair.db");
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
        );
        CREATE TABLE IF NOT EXISTS snippet_groups (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            icon TEXT,
            color TEXT,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS snippets (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            command TEXT NOT NULL,
            target TEXT NOT NULL DEFAULT 'local',
            host_id TEXT REFERENCES hosts(id) ON DELETE SET NULL,
            default_exec_mode TEXT NOT NULL DEFAULT 'terminal',
            working_dir TEXT,
            group_id TEXT REFERENCES snippet_groups(id) ON DELETE SET NULL,
            tags TEXT,
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        );",
    )
    .map_err(|e| e.to_string())?;

    // Idempotent migrations — ignore errors if column already exists
    for sql in &[
        "ALTER TABLE hosts ADD COLUMN tags TEXT",
        "ALTER TABLE hosts ADD COLUMN private_key_path TEXT",
        "ALTER TABLE hosts ADD COLUMN last_connected_at INTEGER",
        "ALTER TABLE hosts ADD COLUMN default_path_ssh TEXT",
        "ALTER TABLE hosts ADD COLUMN default_path_sftp TEXT",
        "ALTER TABLE hosts ADD COLUMN pin_to_top INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE hosts ADD COLUMN sudo_password_set INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE hosts ADD COLUMN keep_alive_interval INTEGER",
        "ALTER TABLE hosts ADD COLUMN keep_alive_tries INTEGER",
        "ALTER TABLE hosts ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE hosts ADD COLUMN tunnels TEXT",
        "ALTER TABLE hosts ADD COLUMN startup_snippet_id TEXT",
        "ALTER TABLE hosts ADD COLUMN startup_snippet_mode TEXT",
        // groups migrations
        "ALTER TABLE groups ADD COLUMN icon TEXT",
        "ALTER TABLE groups ADD COLUMN color TEXT",
        "ALTER TABLE groups ADD COLUMN created_at INTEGER NOT NULL DEFAULT 0",
        // credentials table
        "CREATE TABLE IF NOT EXISTS credentials (\
            id TEXT PRIMARY KEY,\
            name TEXT NOT NULL,\
            cred_type TEXT NOT NULL DEFAULT 'password',\
            key_path TEXT,\
            key_type TEXT,\
            public_key TEXT,\
            has_secret INTEGER NOT NULL DEFAULT 0,\
            created_at INTEGER NOT NULL\
        )",
        // hosts: reference to a credential
        "ALTER TABLE hosts ADD COLUMN credential_id TEXT REFERENCES credentials(id) ON DELETE SET NULL",
        // jump host support and free-text notes
        "ALTER TABLE hosts ADD COLUMN jump_host_id TEXT REFERENCES hosts(id) ON DELETE SET NULL",
        "ALTER TABLE hosts ADD COLUMN notes TEXT",
        // backfill keepalive defaults for hosts that were created before defaults existed
        "UPDATE hosts SET keep_alive_interval = 25 WHERE keep_alive_interval IS NULL",
        "UPDATE hosts SET keep_alive_tries = 3 WHERE keep_alive_tries IS NULL",
    ] {
        let _ = conn.execute_batch(sql);
    }

    Ok(conn)
}

fn now_millis() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

fn row_to_host(row: &rusqlite::Row) -> rusqlite::Result<Host> {
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
        default_path_ssh: row.get(11)?,
        default_path_sftp: row.get(12)?,
        pin_to_top: row.get::<_, i64>(13).map(|v| v != 0).unwrap_or(false),
        sudo_password_set: row.get::<_, i64>(14).map(|v| v != 0).unwrap_or(false),
        keep_alive_interval: row.get(15)?,
        keep_alive_tries: row.get(16)?,
        sort_order: row.get(17).unwrap_or(0),
        tunnels: row.get(18)?,
        startup_snippet_id: row.get(19)?,
        startup_snippet_mode: row.get(20)?,
        credential_id: row.get(21)?,
        jump_host_id: row.get(22)?,
        notes: row.get(23)?,
    })
}

const SELECT_HOSTS: &str = "SELECT id, name, host_address, port, username, auth_method, \
    private_key_path, group_id, tags, created_at, last_connected_at, \
    default_path_ssh, default_path_sftp, pin_to_top, sudo_password_set, \
    keep_alive_interval, keep_alive_tries, sort_order, tunnels, \
    startup_snippet_id, startup_snippet_mode, credential_id, \
    jump_host_id, notes FROM hosts";

#[tauri::command]
pub async fn hosts_get_all(db: tauri::State<'_, HostsDb>) -> Result<Vec<Host>, LabonairError> {
    let conn = db.0.lock().map_err(|e| LabonairError::Internal(e.to_string()))?;
    let mut stmt = conn
        .prepare(&format!("{} ORDER BY pin_to_top DESC, sort_order ASC, name ASC", SELECT_HOSTS))?;
    let hosts = stmt
        .query_map([], row_to_host)?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(hosts)
}

#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn hosts_create(
    app: tauri::AppHandle,
    db: tauri::State<'_, HostsDb>,
    secrets: tauri::State<'_, SecretsState>,
    name: String,
    host_address: String,
    port: i64,
    username: String,
    auth_method: String,
    private_key_path: Option<String>,
    group_id: Option<String>,
    tags: Option<String>,
    password: Option<String>,
    sudo_password: Option<String>,
    default_path_ssh: Option<String>,
    default_path_sftp: Option<String>,
    pin_to_top: Option<bool>,
    keep_alive_interval: Option<i64>,
    keep_alive_tries: Option<i64>,
    sort_order: Option<i64>,
    tunnels: Option<String>,
    startup_snippet_id: Option<String>,
    startup_snippet_mode: Option<String>,
    credential_id: Option<String>,
    jump_host_id: Option<String>,
    notes: Option<String>,
) -> Result<Host, LabonairError> {
    let id = uuid::Uuid::new_v4().to_string();
    let created_at = now_millis();
    let pin = pin_to_top.unwrap_or(false) as i64;
    let order = sort_order.unwrap_or(0);
    let sudo_set = sudo_password.is_some() as i64;

    {
        let conn = db.0.lock().map_err(|e| LabonairError::Internal(e.to_string()))?;
        let snippet_id: Option<&str> = startup_snippet_id.as_deref().filter(|s| !s.is_empty());
        conn.execute(
            "INSERT INTO hosts (id, name, host_address, port, username, auth_method, \
             private_key_path, group_id, tags, created_at, default_path_ssh, default_path_sftp, \
             pin_to_top, sudo_password_set, keep_alive_interval, keep_alive_tries, sort_order, tunnels, \
             startup_snippet_id, startup_snippet_mode, credential_id, jump_host_id, notes) \
             VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21,?22,?23)",
            rusqlite::params![
                id, name, host_address, port, username, auth_method,
                private_key_path, group_id, tags, created_at,
                default_path_ssh, default_path_sftp, pin, sudo_set,
                keep_alive_interval, keep_alive_tries, order, tunnels,
                snippet_id, startup_snippet_mode, credential_id,
                jump_host_id, notes
            ],
        )?;
    }
    if let Some(pw) = password {
        if !pw.is_empty() {
            store_password(&app, &secrets, "labonair-app", &id, &pw).map_err(LabonairError::Internal)?;
        }
    }
    if let Some(sp) = sudo_password {
        if !sp.is_empty() {
            store_password(&app, &secrets, "labonair-sudo", &id, &sp).map_err(LabonairError::Internal)?;
        }
    }
    let conn = db.0.lock().map_err(|e| LabonairError::Internal(e.to_string()))?;
    conn.query_row(
        &format!("{} WHERE id=?1", SELECT_HOSTS),
        rusqlite::params![id],
        row_to_host,
    ).map_err(LabonairError::from)
}

#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn hosts_update(
    app: tauri::AppHandle,
    db: tauri::State<'_, HostsDb>,
    secrets: tauri::State<'_, SecretsState>,
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
    sudo_password: Option<String>,
    default_path_ssh: Option<String>,
    default_path_sftp: Option<String>,
    pin_to_top: Option<bool>,
    keep_alive_interval: Option<i64>,
    keep_alive_tries: Option<i64>,
    sort_order: Option<i64>,
    tunnels: Option<String>,
    startup_snippet_id: Option<String>,
    startup_snippet_mode: Option<String>,
    credential_id: Option<String>,
    jump_host_id: Option<String>,
    notes: Option<String>,
) -> Result<Host, LabonairError> {
    {
        let conn = db.0.lock().map_err(|e| LabonairError::Internal(e.to_string()))?;
        if let Some(v) = &name {
            conn.execute("UPDATE hosts SET name=?1 WHERE id=?2", rusqlite::params![v, id])?;
        }
        if let Some(v) = &host_address {
            conn.execute("UPDATE hosts SET host_address=?1 WHERE id=?2", rusqlite::params![v, id])?;
        }
        if let Some(v) = port {
            conn.execute("UPDATE hosts SET port=?1 WHERE id=?2", rusqlite::params![v, id])?;
        }
        if let Some(v) = &username {
            conn.execute("UPDATE hosts SET username=?1 WHERE id=?2", rusqlite::params![v, id])?;
        }
        if let Some(v) = &auth_method {
            conn.execute("UPDATE hosts SET auth_method=?1 WHERE id=?2", rusqlite::params![v, id])?;
        }
        if private_key_path.is_some() {
            conn.execute("UPDATE hosts SET private_key_path=?1 WHERE id=?2", rusqlite::params![private_key_path, id])?;
        }
        if group_id.is_some() {
            conn.execute("UPDATE hosts SET group_id=?1 WHERE id=?2", rusqlite::params![group_id, id])?;
        }
        if tags.is_some() {
            conn.execute("UPDATE hosts SET tags=?1 WHERE id=?2", rusqlite::params![tags, id])?;
        }
        if default_path_ssh.is_some() {
            conn.execute("UPDATE hosts SET default_path_ssh=?1 WHERE id=?2", rusqlite::params![default_path_ssh, id])?;
        }
        if default_path_sftp.is_some() {
            conn.execute("UPDATE hosts SET default_path_sftp=?1 WHERE id=?2", rusqlite::params![default_path_sftp, id])?;
        }
        if let Some(v) = pin_to_top {
            let pin = v as i64;
            conn.execute("UPDATE hosts SET pin_to_top=?1 WHERE id=?2", rusqlite::params![pin, id])?;
        }
        if let Some(v) = keep_alive_interval {
            conn.execute("UPDATE hosts SET keep_alive_interval=?1 WHERE id=?2", rusqlite::params![v, id])?;
        }
        if let Some(v) = keep_alive_tries {
            conn.execute("UPDATE hosts SET keep_alive_tries=?1 WHERE id=?2", rusqlite::params![v, id])?;
        }
        if let Some(v) = sort_order {
            conn.execute("UPDATE hosts SET sort_order=?1 WHERE id=?2", rusqlite::params![v, id])?;
        }
        if tunnels.is_some() {
            conn.execute("UPDATE hosts SET tunnels=?1 WHERE id=?2", rusqlite::params![tunnels, id])?;
        }
        if let Some(ref v) = startup_snippet_id {
            let db_val: Option<&str> = if v.is_empty() { None } else { Some(v.as_str()) };
            conn.execute("UPDATE hosts SET startup_snippet_id=?1 WHERE id=?2", rusqlite::params![db_val, id])?;
        }
        if startup_snippet_mode.is_some() {
            conn.execute("UPDATE hosts SET startup_snippet_mode=?1 WHERE id=?2", rusqlite::params![startup_snippet_mode, id])?;
        }
        if credential_id.is_some() {
            let val: Option<String> = credential_id.filter(|s| !s.is_empty());
            conn.execute("UPDATE hosts SET credential_id=?1 WHERE id=?2", rusqlite::params![val, id])?;
        }
        // jump_host_id: pass None to clear, Some("") also clears
        if jump_host_id.is_some() {
            let val: Option<String> = jump_host_id.filter(|s| !s.is_empty());
            conn.execute("UPDATE hosts SET jump_host_id=?1 WHERE id=?2", rusqlite::params![val, id])?;
        }
        if notes.is_some() {
            conn.execute("UPDATE hosts SET notes=?1 WHERE id=?2", rusqlite::params![notes, id])?;
        }
    }
    if let Some(pw) = password {
        if pw.is_empty() {
            let _ = delete_password(&app, &secrets, "labonair-app", &id);
        } else {
            store_password(&app, &secrets, "labonair-app", &id, &pw).map_err(LabonairError::Internal)?;
        }
    }
    if let Some(sp) = sudo_password {
        if sp.is_empty() {
            let _ = delete_password(&app, &secrets, "labonair-sudo", &id);
            let conn = db.0.lock().map_err(|e| LabonairError::Internal(e.to_string()))?;
            let _ = conn.execute("UPDATE hosts SET sudo_password_set=0 WHERE id=?1", rusqlite::params![id]);
        } else {
            store_password(&app, &secrets, "labonair-sudo", &id, &sp).map_err(LabonairError::Internal)?;
            let conn = db.0.lock().map_err(|e| LabonairError::Internal(e.to_string()))?;
            let _ = conn.execute("UPDATE hosts SET sudo_password_set=1 WHERE id=?1", rusqlite::params![id]);
        }
    }
    let conn = db.0.lock().map_err(|e| LabonairError::Internal(e.to_string()))?;
    conn.query_row(
        &format!("{} WHERE id=?1", SELECT_HOSTS),
        rusqlite::params![id],
        row_to_host,
    ).map_err(LabonairError::from)
}

#[tauri::command]
pub async fn hosts_delete(
    app: tauri::AppHandle,
    db: tauri::State<'_, HostsDb>,
    secrets: tauri::State<'_, SecretsState>,
    id: String,
) -> Result<(), LabonairError> {
    {
        let conn = db.0.lock().map_err(|e| LabonairError::Internal(e.to_string()))?;
        conn.execute("DELETE FROM hosts WHERE id=?1", rusqlite::params![id])?;
    }
    let _ = delete_password(&app, &secrets, "labonair-app", &id);
    let _ = delete_password(&app, &secrets, "labonair-sudo", &id);
    Ok(())
}

#[tauri::command]
pub async fn hosts_reorder(
    db: tauri::State<'_, HostsDb>,
    items: Vec<ReorderItem>,
) -> Result<(), LabonairError> {
    let conn = db.0.lock().map_err(|e| LabonairError::Internal(e.to_string()))?;
    for item in &items {
        conn.execute(
            "UPDATE hosts SET sort_order=?1 WHERE id=?2",
            rusqlite::params![item.sort_order, item.id],
        )?;
    }
    Ok(())
}

#[tauri::command]
pub async fn get_sudo_password(
    app: tauri::AppHandle,
    db: tauri::State<'_, HostsDb>,
    secrets: tauri::State<'_, SecretsState>,
    host_id: String,
) -> Result<Option<String>, LabonairError> {
    let sudo_set: bool = {
        let conn = db.0.lock().map_err(|e| LabonairError::Internal(e.to_string()))?;
        conn.query_row(
            "SELECT sudo_password_set FROM hosts WHERE id=?1",
            rusqlite::params![host_id],
            |row| row.get::<_, i64>(0),
        )
        .map(|v| v != 0)
        .unwrap_or(false)
    };
    if !sudo_set {
        return Ok(None);
    }
    get_password(&app, &secrets, "labonair-sudo", &host_id).map_err(LabonairError::Internal)
}

#[tauri::command]
pub async fn groups_get_all(db: tauri::State<'_, HostsDb>) -> Result<Vec<Group>, LabonairError> {
    let conn = db.0.lock().map_err(|e| LabonairError::Internal(e.to_string()))?;
    let mut stmt = conn
        .prepare("SELECT id, name, icon, color, created_at FROM groups ORDER BY name")?;
    let groups = stmt
        .query_map([], |row| {
            Ok(Group {
                id: row.get(0)?,
                name: row.get(1)?,
                icon: row.get(2)?,
                color: row.get(3)?,
                created_at: row.get(4)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(groups)
}

#[tauri::command]
pub async fn groups_create(
    db: tauri::State<'_, HostsDb>,
    name: String,
    icon: Option<String>,
    color: Option<String>,
) -> Result<Group, LabonairError> {
    let id = uuid::Uuid::new_v4().to_string();
    let created_at = now_millis();
    {
        let conn = db.0.lock().map_err(|e| LabonairError::Internal(e.to_string()))?;
        conn.execute(
            "INSERT INTO groups (id, name, icon, color, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params![id, name, icon, color, created_at],
        )?;
    }
    Ok(Group { id, name, icon, color, created_at })
}

#[tauri::command]
pub async fn groups_delete(db: tauri::State<'_, HostsDb>, id: String) -> Result<(), LabonairError> {
    let conn = db.0.lock().map_err(|e| LabonairError::Internal(e.to_string()))?;
    conn.execute("DELETE FROM groups WHERE id=?1", rusqlite::params![id])?;
    Ok(())
}

#[tauri::command]
pub async fn groups_update(
    db: tauri::State<'_, HostsDb>,
    id: String,
    name: String,
) -> Result<Group, LabonairError> {
    let conn = db.0.lock().map_err(|e| LabonairError::Internal(e.to_string()))?;
    conn.execute(
        "UPDATE groups SET name=?1 WHERE id=?2",
        rusqlite::params![name, id],
    )?;
    let group = conn.query_row(
        "SELECT id, name, icon, color, created_at FROM groups WHERE id=?1",
        rusqlite::params![id],
        |row| Ok(Group {
            id: row.get(0)?,
            name: row.get(1)?,
            icon: row.get(2)?,
            color: row.get(3)?,
            created_at: row.get(4)?,
        }),
    )?;
    Ok(group)
}
