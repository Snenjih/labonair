# Task 02.1 — SQLite Integration (Backend)
**Phase:** 2 — Database & Host Management
**Status:** not_started
**Priority:** Critical
**Dependencies:** TASK_01_2

## Background & Context
Nexum stores SSH host configurations (addresses, ports, usernames, auth methods, group membership) in a local SQLite database managed entirely by the Rust backend. Passwords are NEVER stored in SQLite — they go into the OS keychain via the `keyring` crate. This task establishes the full database layer: schema initialization, CRUD commands, and Tauri managed state registration.

## Work Instructions

### 1. Add Dependencies to `Cargo.toml`
Open `src-tauri/Cargo.toml`. In the `[dependencies]` section, add:
```toml
rusqlite = { version = "0.32", features = ["bundled"] }
uuid = { version = "1", features = ["v4"] }
```
`bundled` bundles the SQLite C library directly — no system SQLite dependency needed.

### 2. Create `src-tauri/src/modules/hosts/` Directory and `mod.rs`
Create `src-tauri/src/modules/hosts/mod.rs`.

This file should:
- Declare `pub mod db;`
- Re-export key types: `pub use db::{Host, Group, HostsDb};`
- Define the `Host` struct:
  ```rust
  #[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
  pub struct Host {
      pub id: String,
      pub name: String,
      pub host_address: String,
      pub port: i64,
      pub username: String,
      pub auth_method: String,        // "password" | "key"
      pub private_key_path: Option<String>,
      pub group_id: Option<String>,
      pub tags: Option<String>,       // JSON array stored as text
      pub created_at: i64,            // Unix timestamp millis
      pub last_connected_at: Option<i64>,
  }
  ```
- Define the `Group` struct:
  ```rust
  #[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
  pub struct Group {
      pub id: String,
      pub name: String,
      pub icon: Option<String>,
      pub color: Option<String>,
      pub created_at: i64,
  }
  ```
- Define `HostsDb`:
  ```rust
  pub struct HostsDb(pub std::sync::Mutex<rusqlite::Connection>);
  ```

### 3. Create `src-tauri/src/modules/hosts/db.rs`
Create `src-tauri/src/modules/hosts/db.rs`.

Implement `pub fn initialize_db(app_local_data_dir: std::path::PathBuf) -> Result<rusqlite::Connection, String>`:
- Creates the directory at `app_local_data_dir` if it does not exist (`std::fs::create_dir_all`).
- Opens (or creates) a SQLite file at `app_local_data_dir.join("nexum.db")`.
- Enables WAL mode: `conn.execute_batch("PRAGMA journal_mode=WAL;")?`
- Executes `CREATE TABLE IF NOT EXISTS groups (...)` and `CREATE TABLE IF NOT EXISTS hosts (...)` using the schema:
  ```sql
  CREATE TABLE IF NOT EXISTS groups (
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
  ```
- Returns `Ok(conn)` on success, `Err(String)` on any failure.

### 4. Implement Tauri Commands in `db.rs`
Add the following async Tauri commands at the bottom of `db.rs`. All commands must use `tokio::task::spawn_blocking` to avoid blocking the async runtime:

**`hosts_get_all`**
```rust
#[tauri::command]
pub async fn hosts_get_all(db: tauri::State<'_, HostsDb>) -> Result<Vec<Host>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    // SELECT * FROM hosts ORDER BY name
    // Map rows to Host structs
}
```

**`hosts_create`**
- Accepts: `name`, `host_address`, `port: i64`, `username`, `auth_method`, `private_key_path: Option<String>`, `group_id: Option<String>`, `tags: Option<String>`, `password: Option<String>`
- Generates a new UUID v4 id: `uuid::Uuid::new_v4().to_string()`
- Sets `created_at` to current Unix timestamp in milliseconds: `std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis() as i64`
- Inserts into `hosts` table
- If `password` is `Some`, stores it in the OS keychain: `keyring::Entry::new("nexum-app", &id).map_err(|e| e.to_string())?.set_password(&pw).map_err(|e| e.to_string())?`
- Returns the created `Host` struct (re-query by id or construct from inputs)

**`hosts_update`**
- Accepts: `id: String`, optional fields for `name`, `host_address`, `port`, `username`, `auth_method`, `private_key_path`, `group_id`, `tags`, `password: Option<String>`
- Updates only the provided non-None fields (use a dynamic SQL approach or update all fields)
- If `password` is `Some`, updates keychain entry for that host id
- Returns updated `Host`

**`hosts_delete`**
- Accepts: `id: String`
- Deletes row from `hosts`
- Attempts to delete keychain entry: `let _ = keyring::Entry::new("nexum-app", &id).and_then(|e| e.delete_credential());` (ignore errors if no credential was stored)
- Returns `Ok(())`

**`groups_get_all`**
- Returns `Vec<Group>` ordered by name

**`groups_create`**
- Accepts: `name: String`, `icon: Option<String>`, `color: Option<String>`
- Generates UUID, inserts, returns `Group`

**`groups_delete`**
- Accepts: `id: String`
- Deletes from `groups` (ON DELETE SET NULL cascade handles host foreign keys)
- Returns `Ok(())`

**IMPORTANT**: Since `HostsDb` wraps a `Mutex<Connection>` which is not `Send`, you cannot move the guard across `.await`. Use the following pattern to interact with the database inside async commands without `spawn_blocking` issues:
```rust
// Lock, do work synchronously, release before any await
let result = {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    // do all sync rusqlite work here
    // return owned data (Vec<Host>, etc.)
}?;
Ok(result)
```
This is acceptable because these are fast, local SQLite operations. Do NOT use `spawn_blocking` for commands that take `State<HostsDb>` — the `MutexGuard` cannot cross thread boundaries.

### 5. Register the Module in `src-tauri/src/modules/mod.rs`
Open `src-tauri/src/modules/mod.rs`. Add:
```rust
pub mod hosts;
```

### 6. Register State and Commands in `src-tauri/src/lib.rs`
Open `src-tauri/src/lib.rs`.

- Add `use crate::modules::hosts::{HostsDb, db::{initialize_db, hosts_get_all, hosts_create, hosts_update, hosts_delete, groups_get_all, groups_create, groups_delete}};` (adjust path if you prefer to re-export from `mod.rs`).
- In the `tauri::Builder` setup hook (`.setup(|app| { ... })`), initialize the database:
  ```rust
  let data_dir = app.path().app_local_data_dir()
      .expect("failed to resolve app local data dir");
  let conn = initialize_db(data_dir)
      .expect("failed to initialize database");
  app.manage(HostsDb(std::sync::Mutex::new(conn)));
  ```
- In `.invoke_handler(tauri::generate_handler![...])`, add all seven commands: `hosts_get_all, hosts_create, hosts_update, hosts_delete, groups_get_all, groups_create, groups_delete`.

## Files to Create
- `src-tauri/src/modules/hosts/mod.rs`
- `src-tauri/src/modules/hosts/db.rs`

## Files to Modify
- `src-tauri/Cargo.toml`
- `src-tauri/src/modules/mod.rs`
- `src-tauri/src/lib.rs`

## Expected Outcome
- `cargo check` passes with zero errors.
- The app starts without panic.
- Calling `invoke("hosts_get_all")` from the frontend returns an empty array `[]`.
- Calling `invoke("hosts_create", { name: "Test", host_address: "192.168.1.1", port: 22, username: "root", auth_method: "password" })` returns a `Host` object with a UUID `id`.
- Calling `invoke("hosts_get_all")` after create returns that host.

## Additional Information
- **Verify:** Run `cargo check` in `src-tauri/` before marking complete.
- The `keyring` crate should already be in `Cargo.toml` from the previous secrets module. If not, add `keyring = "2"`.
- Never store passwords in the SQLite database. The keychain is the only place passwords live.
- The service name for keyring MUST be `"nexum-app"` and the account key MUST be the host UUID.
