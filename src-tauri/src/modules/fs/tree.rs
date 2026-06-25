use std::collections::HashSet;
use std::path::PathBuf;
use std::time::UNIX_EPOCH;

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
#[serde(rename_all = "lowercase")]
pub enum EntryKind {
    File,
    Dir,
    Symlink,
}

#[derive(Serialize)]
pub struct DirEntry {
    pub name: String,
    pub kind: EntryKind,
    pub size: u64,
    /// Milliseconds since UNIX epoch; 0 if unavailable.
    pub mtime: u64,
    pub is_ignored: bool,
}

/// Lists immediate children of `path`. Dirs first, then files, each sorted
/// case-insensitively. When `show_hidden` is false (default), dot-prefix
/// entries are filtered. The SFTP file manager passes `true` so React can
/// handle filtering reactively.
#[tauri::command]
pub async fn fs_read_dir(path: String, show_hidden: Option<bool>) -> Result<Vec<DirEntry>, String> {
    let show_hidden = show_hidden.unwrap_or(false);
    tokio::task::spawn_blocking(move || {
        let root = expand_home(&path)?;
        let read = std::fs::read_dir(&root).map_err(|e| {
            log::debug!("fs_read_dir({}) failed: {e}", root.display());
            e.to_string()
        })?;

        let mut entries: Vec<DirEntry> = read
            .filter_map(Result::ok)
            .filter_map(|entry| {
                let name = entry.file_name().into_string().ok()?;
                if !show_hidden && name.starts_with('.') {
                    return None;
                }

                // `metadata()` follows symlinks → it returns the target's stat in
                // one syscall (file_type + size + mtime all derived from it). We
                // fall back to `symlink_metadata` for broken symlinks so we don't
                // silently drop them from the listing.
                let (meta, was_symlink) = match std::fs::metadata(entry.path()) {
                    Ok(m) => (Some(m), false),
                    Err(_) => (entry.metadata().ok(), true),
                };
                let meta = meta?;

                let kind = if was_symlink {
                    EntryKind::Symlink
                } else if meta.is_dir() {
                    EntryKind::Dir
                } else {
                    EntryKind::File
                };

                let size = meta.len();
                let mtime = meta
                    .modified()
                    .ok()
                    .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                    .map(|d| d.as_millis() as u64)
                    .unwrap_or(0);

                Some(DirEntry {
                    name,
                    kind,
                    size,
                    mtime,
                    is_ignored: false,
                })
            })
            .collect();

        entries.sort_by(|a, b| {
            let rank = |k: &EntryKind| match k {
                EntryKind::Dir => 0,
                EntryKind::Symlink => 1,
                EntryKind::File => 2,
            };
            rank(&a.kind)
                .cmp(&rank(&b.kind))
                .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
        });

        // Determine which entries are gitignored using the `ignore` crate.
        // WalkBuilder respects .gitignore, parent .gitignores, .git/info/exclude,
        // and global ignore rules. In non-git directories it returns all entries
        // unchanged, so is_ignored stays false for everything.
        let not_ignored: HashSet<String> = WalkBuilder::new(&root)
            .hidden(false)
            .max_depth(Some(1))
            .git_ignore(true)
            .git_global(true)
            .git_exclude(true)
            .ignore(true)
            .parents(true)
            .follow_links(false)
            .build()
            .flatten()
            .filter(|e| e.depth() == 1)
            .filter_map(|e| e.file_name().to_str().map(|s| s.to_owned()))
            .collect();

        for entry in &mut entries {
            // Never mark the internal .git directory as ignored — it is excluded
            // from WalkBuilder traversal for structural reasons, not gitignore rules.
            entry.is_ignored =
                !not_ignored.contains(&entry.name) && entry.name != ".git";
        }

        Ok(entries)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Returns the absolute expanded path for a given input (expands `~`).
/// Used by the frontend to normalise the local base path before storing it.
#[tauri::command]
pub async fn fs_resolve_path(path: String) -> Result<String, String> {
    expand_home(&path).map(|p| p.to_string_lossy().to_string())
}

/// Lists immediate subdirectories of `path`. Kept for the CwdBreadcrumb.
///
/// Symlinks to directories are included (matches shell `cd` semantics).
/// Hidden entries are filtered by dot-prefix only.
#[tauri::command]
pub async fn list_subdirs(path: String) -> Result<Vec<String>, String> {
    tokio::task::spawn_blocking(move || {
        let root = PathBuf::from(&path);
        let read = std::fs::read_dir(&root).map_err(|e| {
            log::debug!("list_subdirs({}) read_dir failed: {e}", root.display());
            e.to_string()
        })?;

        let mut dirs: Vec<String> = read
            .filter_map(Result::ok)
            .filter(|entry| match entry.file_type() {
                Ok(t) if t.is_dir() => true,
                Ok(t) if t.is_symlink() => std::fs::metadata(entry.path())
                    .map(|m| m.is_dir())
                    .unwrap_or(false),
                _ => false,
            })
            .filter_map(|entry| entry.file_name().into_string().ok())
            .filter(|name| !name.starts_with('.'))
            .collect();

        dirs.sort_by_key(|a| a.to_lowercase());
        Ok(dirs)
    })
    .await
    .map_err(|e| e.to_string())?
}
