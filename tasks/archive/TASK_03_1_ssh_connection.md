# Task 03.1 — SSH Connection & known_hosts Validation (Backend)
**Phase:** 3 — Interactive SSH Terminal
**Status:** completed
**Priority:** Critical
**Dependencies:** TASK_02_1

## Background & Context
This task implements the Rust backend for establishing SSH connections. It handles the full authentication lifecycle: TCP connect → SSH handshake → known_hosts verification → authentication (password or private key). Security events (unknown hosts, auth failures) are emitted as Tauri events to the frontend so the user can make trust decisions. Connected sessions are stored in a managed `SshState` map keyed by tab ID, so subsequent PTY commands (Task 03.2) can retrieve the live session.

## Work Instructions

### 1. Add Dependencies to `Cargo.toml`
Open `src-tauri/Cargo.toml`. Add:
```toml
ssh2 = "0.9"
dirs = "5"
```
`ssh2` provides the SSH protocol implementation. `dirs` gives us the platform-appropriate home directory for `~/.ssh/known_hosts`.

### 2. Create `src-tauri/src/modules/ssh/mod.rs`
Create `src-tauri/src/modules/ssh/mod.rs`.

```rust
pub mod client;
pub mod pty;     // will be created in Task 03.2 — declare now to avoid future breakage
// pub mod sftp; // will be created in Task 04.2

use std::collections::HashMap;
use std::sync::Mutex;

/// A live SSH session associated with one tab.
pub struct SshSession {
    pub session: ssh2::Session,
    pub channel: Option<ssh2::Channel>,
}

// SAFETY: ssh2::Session uses raw pointers internally but is used from a single
// thread at a time via the Mutex. We assert Send + Sync manually.
unsafe impl Send for SshSession {}
unsafe impl Sync for SshSession {}

/// Global map of tab_id → SshSession, managed by Tauri.
pub struct SshState(pub Mutex<HashMap<String, SshSession>>);

impl Default for SshState {
    fn default() -> Self {
        SshState(Mutex::new(HashMap::new()))
    }
}
```

### 3. Create `src-tauri/src/modules/ssh/client.rs`
Create `src-tauri/src/modules/ssh/client.rs`.

This file contains two Tauri commands: `ssh_connect` and `ssh_disconnect`.

**`ssh_connect` command:**

Signature:
```rust
#[tauri::command]
pub async fn ssh_connect(
    tab_id: String,
    host_id: String,
    state: tauri::State<'_, super::SshState>,
    hosts_db: tauri::State<'_, crate::modules::hosts::HostsDb>,
    app: tauri::AppHandle,
) -> Result<(), String>
```

Implementation steps (all in order, each step must succeed before the next):

**Step 1: Fetch host from SQLite**
```rust
let host = {
    let conn = hosts_db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn.prepare(
        "SELECT id, name, host_address, port, username, auth_method, private_key_path FROM hosts WHERE id = ?1"
    ).map_err(|e| e.to_string())?;
    stmt.query_row(rusqlite::params![host_id], |row| {
        Ok(/* Host struct fields */)
    }).map_err(|e| e.to_string())?
};
```

**Step 2: Fetch password from keychain (if auth_method == "password")**
```rust
let password: Option<String> = if host.auth_method == "password" {
    keyring::Entry::new("nexum-app", &host.id)
        .ok()
        .and_then(|e| e.get_password().ok())
} else {
    None
};
```

**Step 3: TCP connect (use spawn_blocking for the blocking socket work)**
```rust
let tcp = tokio::task::spawn_blocking({
    let addr = format!("{}:{}", host.host_address, host.port);
    move || std::net::TcpStream::connect(&addr).map_err(|e| e.to_string())
}).await.map_err(|e| e.to_string())??;
```

**Step 4: SSH handshake**
```rust
let mut session = ssh2::Session::new().map_err(|e| e.to_string())?;
session.set_tcp_stream(tcp);
session.handshake().map_err(|e| e.to_string())?;
```

**Step 5: known_hosts check**
```rust
// Get the server's host key fingerprint (MD5 hex)
let (host_key, _key_type) = session.host_key().ok_or("no host key")?;
let fingerprint = session.host_key_hash(ssh2::HashType::Md5)
    .map(|h| h.iter().map(|b| format!("{:02x}", b)).collect::<Vec<_>>().join(":"))
    .unwrap_or_else(|| "unknown".to_string());

// Read ~/.ssh/known_hosts
let known_hosts_path = dirs::home_dir()
    .map(|h| h.join(".ssh").join("known_hosts"));

let known_host_status = if let Some(path) = known_hosts_path {
    let mut kh = session.known_hosts().map_err(|e| e.to_string())?;
    if path.exists() {
        let _ = kh.read_file(&path, ssh2::KnownHostFileKind::OpenSSH);
    }
    kh.check(&host.host_address, host_key)
} else {
    ssh2::CheckResult::NotFound
};

match known_host_status {
    ssh2::CheckResult::Match => { /* proceed */ }
    ssh2::CheckResult::Mismatch => {
        app.emit("known_hosts_warning", serde_json::json!({
            "tab_id": tab_id,
            "fingerprint": fingerprint,
            "host": host.host_address,
            "is_mismatch": true
        })).map_err(|e| e.to_string())?;
        return Err("known_hosts mismatch".to_string());
    }
    ssh2::CheckResult::NotFound | ssh2::CheckResult::Failure => {
        app.emit("known_hosts_warning", serde_json::json!({
            "tab_id": tab_id,
            "fingerprint": fingerprint,
            "host": host.host_address,
            "is_mismatch": false
        })).map_err(|e| e.to_string())?;
        // Do NOT return error here — wait for frontend decision.
        // In MVP, treat "not found" as user-confirmed (proceed).
        // A full implementation would wait for a oneshot channel response.
        // For now: proceed but log a warning.
    }
}
```

**Step 6: Authentication**
```rust
let auth_result = if host.auth_method == "key" {
    let key_path = host.private_key_path
        .as_deref()
        .map(std::path::Path::new);
    session.userauth_pubkey_file(&host.username, None, key_path.unwrap(), None)
        .map_err(|e| e.to_string())
} else {
    let pw = password.as_deref().unwrap_or("");
    session.userauth_password(&host.username, pw)
        .map_err(|e| e.to_string())
};

if let Err(err) = auth_result {
    app.emit("auth_required", serde_json::json!({
        "tab_id": tab_id,
        "prompt_message": err,
        "is_2fa": false
    })).map_err(|e| e.to_string())?;
    return Err(format!("authentication failed: {}", err));
}

if !session.authenticated() {
    app.emit("auth_required", serde_json::json!({
        "tab_id": tab_id,
        "prompt_message": "Authentication failed",
        "is_2fa": false
    })).map_err(|e| e.to_string())?;
    return Err("not authenticated".to_string());
}
```

**Step 7: Store session and emit session_established**
```rust
{
    let mut map = state.0.lock().map_err(|e| e.to_string())?;
    map.insert(tab_id.clone(), super::SshSession { session, channel: None });
}

// Update last_connected_at in SQLite
{
    let conn = hosts_db.0.lock().map_err(|e| e.to_string())?;
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64;
    let _ = conn.execute(
        "UPDATE hosts SET last_connected_at = ?1 WHERE id = ?2",
        rusqlite::params![now, host_id],
    );
}

app.emit("session_established", serde_json::json!({ "tab_id": tab_id }))
    .map_err(|e| e.to_string())?;

Ok(())
```

**`ssh_disconnect` command:**
```rust
#[tauri::command]
pub async fn ssh_disconnect(
    tab_id: String,
    state: tauri::State<'_, super::SshState>,
) -> Result<(), String> {
    let mut map = state.0.lock().map_err(|e| e.to_string())?;
    if let Some(mut sess) = map.remove(&tab_id) {
        // Close channel if open
        if let Some(mut ch) = sess.channel.take() {
            let _ = ch.close();
        }
        // Disconnect session gracefully
        let _ = sess.session.disconnect(
            None,
            "User disconnected",
            None,
        );
    }
    Ok(())
}
```

### 4. Create Stub for `src-tauri/src/modules/ssh/pty.rs`
Create an empty `src-tauri/src/modules/ssh/pty.rs` now to satisfy the `pub mod pty;` declaration in `mod.rs`. This file will be fully implemented in Task 03.2:
```rust
// SSH PTY commands — implemented in Task 03.2
```

### 5. Register Module in `src-tauri/src/modules/mod.rs`
Add to `src-tauri/src/modules/mod.rs`:
```rust
pub mod ssh;
```

### 6. Register State and Commands in `src-tauri/src/lib.rs`
- Add `use crate::modules::ssh::{SshState, client::{ssh_connect, ssh_disconnect}};`
- In the `.setup(|app| {...})` hook, register `SshState`:
  ```rust
  app.manage(SshState::default());
  ```
- Add `ssh_connect, ssh_disconnect` to `generate_handler![]`.

## Files to Create
- `src-tauri/src/modules/ssh/mod.rs`
- `src-tauri/src/modules/ssh/client.rs`
- `src-tauri/src/modules/ssh/pty.rs` (stub)

## Files to Modify
- `src-tauri/Cargo.toml`
- `src-tauri/src/modules/mod.rs`
- `src-tauri/src/lib.rs`

## Expected Outcome
- `cargo check` passes with zero errors.
- Calling `invoke("ssh_connect", { tab_id: "1", host_id: "<uuid>" })` from the frontend (with a reachable host configured) triggers either `session_established`, `known_hosts_warning`, or `auth_required` events.
- Calling `invoke("ssh_disconnect", { tab_id: "1" })` closes the session cleanly.
- No `unwrap()` panics on connection failure — all errors are returned as `Err(String)` or emitted as events.

## Additional Information
- **Verify:** Run `cargo check` in `src-tauri/` before marking complete.
- `ssh2` performs blocking I/O. All blocking code is wrapped in `tokio::task::spawn_blocking` or kept synchronous inside the command body that runs on Tauri's thread pool.
- The known_hosts "not found" case in MVP proceeds without user confirmation. A future task can add a proper trust dialog by holding a `tokio::sync::oneshot` channel.
- The `unsafe impl Send/Sync for SshSession` is required because `ssh2::Session` contains raw pointers. This is safe as long as sessions are only accessed through the `Mutex`.
- keyring crate import: `use keyring;` — ensure it's in `Cargo.toml` and `lib.rs` already (from Phase 1 secrets module).
