use serde::Serialize;

#[derive(Debug, Clone, Serialize, serde::Deserialize)]
pub struct SshConfigEntry {
    pub alias: String,
    pub host_address: String,
    pub port: i64,
    pub username: Option<String>,
    pub auth_method: String,
    pub private_key_path: Option<String>,
    pub proxy_jump: Option<String>,
}

fn flush_entry(
    alias: String,
    map: &std::collections::HashMap<String, String>,
) -> Option<SshConfigEntry> {
    if alias.contains('*') || alias.contains('?') {
        return None;
    }
    let host_address = map.get("hostname").cloned().unwrap_or_else(|| alias.clone());
    let port: i64 = map
        .get("port")
        .and_then(|p| p.parse().ok())
        .filter(|&p: &i64| p > 0 && p < 65536)
        .unwrap_or(22);
    let username = map.get("user").cloned();
    let (auth_method, private_key_path) = if let Some(key) = map.get("identityfile") {
        let expanded = if key.starts_with("~/") {
            dirs::home_dir()
                .map(|h| h.join(&key[2..]).to_string_lossy().to_string())
                .unwrap_or_else(|| key.clone())
        } else {
            key.clone()
        };
        ("key".to_string(), Some(expanded))
    } else {
        ("password".to_string(), None)
    };
    let proxy_jump = map.get("proxyjump").cloned().and_then(|pj| {
        let pj = pj.trim().to_string();
        if pj.eq_ignore_ascii_case("none") {
            None
        } else {
            Some(pj)
        }
    });
    Some(SshConfigEntry {
        alias,
        host_address,
        port,
        username,
        auth_method,
        private_key_path,
        proxy_jump,
    })
}

pub fn parse_ssh_config(content: &str) -> Vec<SshConfigEntry> {
    let mut entries: Vec<SshConfigEntry> = Vec::new();
    let mut current_alias: Option<String> = None;
    let mut current: std::collections::HashMap<String, String> = std::collections::HashMap::new();

    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }

        let sep = match trimmed.find(|c: char| c.is_whitespace() || c == '=') {
            Some(p) => p,
            None => continue,
        };
        let key = trimmed[..sep].to_lowercase();
        let value = trimmed[sep..]
            .trim_start_matches(|c: char| c.is_whitespace() || c == '=')
            .trim()
            .to_string();
        if value.is_empty() {
            continue;
        }

        if key == "host" {
            if let Some(alias) = current_alias.take() {
                if let Some(entry) = flush_entry(alias, &current) {
                    entries.push(entry);
                }
            }
            current.clear();
            current_alias = Some(value);
        } else if current_alias.is_some() {
            // Only store first occurrence of each key (SSH config precedence)
            current.entry(key).or_insert(value);
        }
    }
    if let Some(alias) = current_alias {
        if let Some(entry) = flush_entry(alias, &current) {
            entries.push(entry);
        }
    }
    entries
}

#[tauri::command]
pub async fn parse_ssh_config_cmd() -> Result<Vec<SshConfigEntry>, String> {
    let path = dirs::home_dir()
        .map(|h| h.join(".ssh").join("config"))
        .ok_or("Could not determine home directory")?;
    if !path.exists() {
        return Ok(vec![]);
    }
    let content = std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read ~/.ssh/config: {}", e))?;
    Ok(parse_ssh_config(&content))
}

#[tauri::command]
pub async fn import_ssh_config_entries(
    entries: Vec<SshConfigEntry>,
    hosts_db: tauri::State<'_, crate::modules::hosts::HostsDb>,
) -> Result<Vec<String>, String> {
    use uuid::Uuid;
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64;

    // First pass: insert all hosts, collect alias→id mapping
    let mut alias_to_id: std::collections::HashMap<String, String> = std::collections::HashMap::new();
    let mut created_ids: Vec<String> = Vec::new();

    for entry in &entries {
        let id = Uuid::new_v4().to_string();
        let conn = hosts_db.0.lock().map_err(|e| e.to_string())?;
        // Get current max sort_order
        let sort_order: i64 = conn
            .query_row(
                "SELECT COALESCE(MAX(sort_order), 0) + 1 FROM hosts",
                [],
                |r| r.get(0),
            )
            .unwrap_or(0);
        conn.execute(
            "INSERT INTO hosts (id, name, host_address, port, username, auth_method, private_key_path, created_at, sort_order) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            rusqlite::params![
                id,
                entry.alias,
                entry.host_address,
                entry.port,
                entry.username.as_deref().unwrap_or(""),
                entry.auth_method,
                entry.private_key_path,
                now,
                sort_order,
            ],
        )
        .map_err(|e| e.to_string())?;
        alias_to_id.insert(entry.alias.clone(), id.clone());
        created_ids.push(id);
    }

    // Second pass: resolve proxy_jump aliases to host_ids
    for (entry, host_id) in entries.iter().zip(created_ids.iter()) {
        if let Some(ref pj_alias) = entry.proxy_jump {
            // Extract just the host part from "user@host:port" format
            let pj_host = pj_alias
                .split('@')
                .next_back()
                .unwrap_or(pj_alias)
                .split(':')
                .next()
                .unwrap_or(pj_alias)
                .trim();
            if let Some(jump_id) = alias_to_id.get(pj_host) {
                let conn = hosts_db.0.lock().map_err(|e| e.to_string())?;
                let _ = conn.execute(
                    "UPDATE hosts SET jump_host_id = ?1 WHERE id = ?2",
                    rusqlite::params![jump_id, host_id],
                );
            }
        }
    }

    Ok(created_ids)
}
