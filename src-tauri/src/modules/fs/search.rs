use std::path::PathBuf;

use ignore::WalkBuilder;
use serde::Serialize;

fn expand_home(path: &str) -> Result<PathBuf, String> {
    if path == "~" {
        dirs::home_dir().ok_or("could not determine home directory".to_string())
    } else if let Some(stripped) = path.strip_prefix("~/") {
        let mut home = dirs::home_dir().ok_or("could not determine home directory".to_string())?;
        home.push(stripped);
        Ok(home)
    } else {
        Ok(PathBuf::from(path))
    }
}

#[derive(Serialize)]
pub struct SearchHit {
    /// Absolute path of the matched file.
    pub path: String,
    /// Path relative to the search root, for display.
    pub rel: String,
    /// File name only.
    pub name: String,
    pub is_dir: bool,
}

/// Walks `root` honoring `.gitignore` / `.ignore` / hidden rules and returns
/// entries whose path contains `query` (case-insensitive substring on the
/// path relative to root). Returns up to `limit` hits. An empty query returns
/// nothing — callers should short-circuit before invoking.
#[tauri::command]
pub fn fs_search(
    root: String,
    query: String,
    limit: Option<usize>,
    show_hidden: Option<bool>,
) -> Result<Vec<SearchHit>, String> {
    let q = query.trim().to_lowercase();
    if q.is_empty() {
        return Ok(Vec::new());
    }
    let cap = limit.unwrap_or(200).min(1000);
    let root_path = expand_home(&root)?;
    if !root_path.is_dir() {
        return Err(format!("not a directory: {root}"));
    }

    let mut out: Vec<SearchHit> = Vec::with_capacity(cap.min(64));

    let walker = WalkBuilder::new(&root_path)
        .hidden(!show_hidden.unwrap_or(false))
        .git_ignore(true)
        .git_global(true)
        .git_exclude(true)
        .ignore(true)
        .parents(true)
        .follow_links(false)
        .build();

    for dent in walker.flatten() {
        if out.len() >= cap {
            break;
        }
        let path = dent.path();
        if path == root_path {
            continue;
        }
        let rel = match path.strip_prefix(&root_path) {
            Ok(r) => r.to_string_lossy().into_owned(),
            Err(_) => continue,
        };
        if !rel.to_lowercase().contains(&q) {
            continue;
        }
        let name = path
            .file_name()
            .map(|s| s.to_string_lossy().into_owned())
            .unwrap_or_default();
        let is_dir = dent.file_type().map(|t| t.is_dir()).unwrap_or(false);
        out.push(SearchHit {
            path: path.to_string_lossy().into_owned(),
            rel,
            name,
            is_dir,
        });
    }

    // Rank: filename matches first, then shorter relative paths.
    out.sort_by(|a, b| {
        let an = a.name.to_lowercase().contains(&q);
        let bn = b.name.to_lowercase().contains(&q);
        bn.cmp(&an).then(a.rel.len().cmp(&b.rel.len()))
    });

    Ok(out)
}
