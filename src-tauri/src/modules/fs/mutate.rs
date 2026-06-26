use std::path::PathBuf;

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

/// Creates a new empty file. Fails if the file already exists.
#[tauri::command]
pub fn fs_create_file(path: String) -> Result<(), String> {
    let p = expand_home(&path)?;
    if p.exists() {
        return Err(format!("already exists: {}", p.display()));
    }
    std::fs::write(&p, "").map_err(|e| {
        log::debug!("fs_create_file({}) failed: {e}", p.display());
        e.to_string()
    })
}

/// Creates a temporary empty file in the system temp dir and returns its path.
#[tauri::command]
pub fn fs_create_temp_file(prefix: String) -> Result<String, String> {
    let dir = std::env::temp_dir();
    let path = dir.join(format!("{}.txt", prefix));
    std::fs::write(&path, "").map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}

/// Creates a new directory. Fails if the directory already exists.
/// Parents are created as needed — matches the common "new folder" UX
/// where typing "a/b/c" creates the full chain.
#[tauri::command]
pub fn fs_create_dir(path: String) -> Result<(), String> {
    let p = expand_home(&path)?;
    if p.exists() {
        return Err(format!("already exists: {}", p.display()));
    }
    std::fs::create_dir_all(&p).map_err(|e| {
        log::debug!("fs_create_dir({}) failed: {e}", p.display());
        e.to_string()
    })
}

/// Renames (or moves) a path. Refuses to overwrite an existing target.
#[tauri::command]
pub fn fs_rename(from: String, to: String) -> Result<(), String> {
    let from_p = expand_home(&from)?;
    let to_p = expand_home(&to)?;
    if !from_p.exists() {
        return Err(format!("not found: {}", from_p.display()));
    }
    if to_p.exists() {
        return Err(format!("already exists: {}", to_p.display()));
    }
    std::fs::rename(&from_p, &to_p).map_err(|e| {
        log::debug!(
            "fs_rename({} -> {}) failed: {e}",
            from_p.display(),
            to_p.display()
        );
        e.to_string()
    })
}

/// Copies one or more source paths into a destination directory.
/// Files are copied with std::fs::copy; directories are copied recursively.
/// If a name conflict exists the copy is placed as "name (1).ext", "name (2).ext", etc.
/// Returns the list of final destination paths.
#[tauri::command]
pub fn fs_copy_into(src_paths: Vec<String>, dest_dir: String) -> Result<Vec<String>, String> {
    let dest = expand_home(&dest_dir)?;
    if !dest.is_dir() {
        return Err(format!("destination is not a directory: {}", dest.display()));
    }
    let mut results = Vec::new();
    for src_str in &src_paths {
        let src = expand_home(src_str)?;
        if !src.exists() {
            return Err(format!("source not found: {}", src.display()));
        }
        let name = src
            .file_name()
            .ok_or_else(|| format!("no filename: {}", src.display()))?
            .to_string_lossy()
            .to_string();
        let dest_path = resolve_conflict_path(&dest, &name);
        if src.is_dir() {
            copy_dir_recursive(&src, &dest_path)?;
        } else {
            std::fs::copy(&src, &dest_path)
                .map_err(|e| format!("copy failed: {e}"))?;
        }
        results.push(dest_path.to_string_lossy().into_owned());
    }
    Ok(results)
}

fn resolve_conflict_path(dest_dir: &std::path::Path, name: &str) -> std::path::PathBuf {
    let candidate = dest_dir.join(name);
    if !candidate.exists() {
        return candidate;
    }
    let stem = std::path::Path::new(name)
        .file_stem()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();
    let ext = std::path::Path::new(name)
        .extension()
        .map(|e| format!(".{}", e.to_string_lossy()))
        .unwrap_or_default();
    for i in 1..=99u32 {
        let candidate = dest_dir.join(format!("{stem} ({i}){ext}"));
        if !candidate.exists() {
            return candidate;
        }
    }
    dest_dir.join(format!("{stem} (99){ext}"))
}

fn copy_dir_recursive(src: &std::path::Path, dest: &std::path::Path) -> Result<(), String> {
    std::fs::create_dir_all(dest).map_err(|e| e.to_string())?;
    for entry in std::fs::read_dir(src).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let ty = entry.file_type().map_err(|e| e.to_string())?;
        let dest_child = dest.join(entry.file_name());
        if ty.is_dir() {
            copy_dir_recursive(&entry.path(), &dest_child)?;
        } else {
            std::fs::copy(entry.path(), &dest_child).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

/// Deletes a file or directory (recursively for dirs). Callers are
/// responsible for confirming destructive operations with the user.
#[tauri::command]
pub fn fs_delete(path: String) -> Result<(), String> {
    let p = expand_home(&path)?;
    let meta = std::fs::symlink_metadata(&p).map_err(|e| {
        log::debug!("fs_delete stat({}) failed: {e}", p.display());
        e.to_string()
    })?;

    let result = if meta.is_dir() {
        std::fs::remove_dir_all(&p)
    } else {
        std::fs::remove_file(&p)
    };

    result.map_err(|e| {
        log::warn!("fs_delete({}) failed: {e}", p.display());
        e.to_string()
    })
}
