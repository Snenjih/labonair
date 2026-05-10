# Task 04.2 — SFTP Backend Commands & Context Menus
**Phase:** 4 — SFTP File Manager
**Status:** completed
**Priority:** High
**Dependencies:** TASK_03_1, TASK_04_1

## Background & Context
This task implements the actual SFTP backend commands in Rust (listing remote directories, rename, delete, mkdir, chmod) and wires them to the frontend. It also adds a right-click context menu to the file list for file operations. After this task, the remote pane in the SFTP UI is fully functional with real data from the server.

## Work Instructions

### 1. Define Rust `FileNode` Struct
In `src-tauri/src/modules/ssh/sftp.rs`, define a `FileNode` struct that mirrors the TypeScript interface:

```rust
#[derive(Debug, serde::Serialize, serde::Deserialize)]
pub struct FileNode {
    pub name: String,
    pub path: String,
    pub size: u64,
    pub modified_at: i64,  // Unix timestamp in seconds
    pub is_dir: bool,
    pub is_symlink: bool,
    pub symlink_target: Option<String>,
    pub permissions: String, // e.g. "rwxr-xr-x"
}
```

Add a helper function `fn mode_to_string(mode: u32) -> String` that converts a Unix mode integer to a 9-character permission string (e.g., `0o755` → `"rwxr-xr-x"`).

### 2. Implement `sftp_read_dir`
```rust
#[tauri::command]
pub async fn sftp_read_dir(
    tab_id: String,
    path: String,
    state: tauri::State<'_, crate::modules::ssh::SshState>,
) -> Result<Vec<FileNode>, String> {
    // Must use spawn_blocking because ssh2 SFTP is blocking I/O
    let state_inner = state.inner() as *const crate::modules::ssh::SshState;
    // SAFETY: SshState lives for 'static (managed state). The pointer is valid.
    // However, passing raw pointers across threads requires care.
    // RECOMMENDED PATTERN: Clone the session handle or use a channel.
    //
    // PRACTICAL APPROACH for MVP (accept the blocking approach):
    // Lock the mutex, open SFTP, readdir, collect results, drop everything.
    // Since ssh2 is not Send for channels, do all work inside the lock.
    
    tokio::task::spawn_blocking(move || {
        // This will NOT work directly because State<SshState> is not Send.
        // Use the approach below instead.
    });
    
    // CORRECT APPROACH: Do not use spawn_blocking for ssh2.
    // Instead, call the synchronous ssh2 operations directly in the async command body.
    // Tauri commands run on a blocking thread pool thread so this is acceptable.
    
    let map = state.0.lock().map_err(|e| e.to_string())?;
    let session_entry = map.get(&tab_id).ok_or("no session for tab")?;
    
    // Open SFTP subsystem
    let sftp = session_entry.session.sftp().map_err(|e| e.to_string())?;
    
    // Read the directory
    let path_buf = std::path::Path::new(&path);
    let entries = sftp.readdir(path_buf).map_err(|e| e.to_string())?;
    
    let mut files: Vec<FileNode> = entries
        .into_iter()
        .map(|(pb, stat)| {
            let name = pb.file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| pb.to_string_lossy().to_string());
            let is_dir = stat.is_dir();
            let is_symlink = stat.file_type().map(|ft| ft.is_symlink()).unwrap_or(false);
            let size = stat.size.unwrap_or(0);
            let modified_at = stat.mtime.unwrap_or(0) as i64;
            let perm = stat.perm.unwrap_or(0);
            FileNode {
                path: pb.to_string_lossy().to_string(),
                name,
                size,
                modified_at,
                is_dir,
                is_symlink,
                symlink_target: None, // resolving symlinks is expensive; skip for now
                permissions: mode_to_string(perm),
            }
        })
        .collect();
    
    // Sort: dirs first, then alphabetical
    files.sort_by(|a, b| {
        b.is_dir.cmp(&a.is_dir).then(a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    
    Ok(files)
}
```

**Note on blocking:** ssh2 operations are synchronous. Tauri's `#[tauri::command]` annotated async functions run on `tokio::task::spawn_blocking` internally when invoked. Do not double-wrap in another `spawn_blocking`. The direct locking approach above is correct.

### 3. Implement `sftp_rename`
```rust
#[tauri::command]
pub async fn sftp_rename(
    tab_id: String,
    old_path: String,
    new_path: String,
    state: tauri::State<'_, crate::modules::ssh::SshState>,
) -> Result<(), String> {
    let map = state.0.lock().map_err(|e| e.to_string())?;
    let session_entry = map.get(&tab_id).ok_or("no session for tab")?;
    let sftp = session_entry.session.sftp().map_err(|e| e.to_string())?;
    sftp.rename(
        std::path::Path::new(&old_path),
        std::path::Path::new(&new_path),
        None,
    ).map_err(|e| e.to_string())
}
```

### 4. Implement `sftp_delete`
Handle both files and non-empty directories. For directories, recurse:
```rust
#[tauri::command]
pub async fn sftp_delete(
    tab_id: String,
    paths: Vec<String>,
    state: tauri::State<'_, crate::modules::ssh::SshState>,
) -> Result<(), String> {
    let map = state.0.lock().map_err(|e| e.to_string())?;
    let session_entry = map.get(&tab_id).ok_or("no session for tab")?;
    let sftp = session_entry.session.sftp().map_err(|e| e.to_string())?;
    
    for path in &paths {
        let p = std::path::Path::new(path);
        // Try file unlink first; fall back to rmdir for directories
        if sftp.unlink(p).is_err() {
            // If it's a directory, it may need recursive deletion.
            // For MVP: use SSH exec to run `rm -rf` on the remote.
            // This avoids having to implement recursive SFTP traversal.
            let mut channel = session_entry.session.channel_session()
                .map_err(|e| e.to_string())?;
            channel.exec(&format!("rm -rf '{}'", path.replace('\'', "'\\''")))
                .map_err(|e| e.to_string())?;
            channel.wait_close().map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}
```

### 5. Implement `sftp_mkdir`
```rust
#[tauri::command]
pub async fn sftp_mkdir(
    tab_id: String,
    path: String,
    state: tauri::State<'_, crate::modules::ssh::SshState>,
) -> Result<(), String> {
    let map = state.0.lock().map_err(|e| e.to_string())?;
    let session_entry = map.get(&tab_id).ok_or("no session for tab")?;
    let sftp = session_entry.session.sftp().map_err(|e| e.to_string())?;
    sftp.mkdir(std::path::Path::new(&path), 0o755)
        .map_err(|e| e.to_string())
}
```

### 6. Implement `sftp_chmod`
```rust
#[tauri::command]
pub async fn sftp_chmod(
    tab_id: String,
    path: String,
    permissions: u32,
    state: tauri::State<'_, crate::modules::ssh::SshState>,
) -> Result<(), String> {
    let map = state.0.lock().map_err(|e| e.to_string())?;
    let session_entry = map.get(&tab_id).ok_or("no session for tab")?;
    let sftp = session_entry.session.sftp().map_err(|e| e.to_string())?;
    let mut stat = sftp.stat(std::path::Path::new(&path)).map_err(|e| e.to_string())?;
    stat.perm = Some(permissions);
    sftp.setstat(std::path::Path::new(&path), stat)
        .map_err(|e| e.to_string())
}
```

### 7. Register Commands in `lib.rs`
In `src-tauri/src/modules/ssh/mod.rs`, add:
```rust
pub mod sftp;
```

In `src-tauri/src/lib.rs`, add to `generate_handler![]`:
```
sftp_read_dir, sftp_rename, sftp_delete, sftp_mkdir, sftp_chmod
```

### 8. Wire Real `sftp_read_dir` in `sftpStore.ts`
Open `src/modules/sftp/store/sftpStore.ts`. Replace the mock implementation in `loadRemoteDir`:
```typescript
loadRemoteDir: async (tabId, path) => {
  set((s) => ({
    tabs: { ...s.tabs, [tabId]: { ...s.tabs[tabId], isLoadingRemote: true, error: null } },
  }));
  try {
    const files = await invoke<FileNode[]>("sftp_read_dir", { tab_id: tabId, path });
    set((s) => ({
      tabs: {
        ...s.tabs,
        [tabId]: { ...s.tabs[tabId], remoteFiles: files, remotePath: path, isLoadingRemote: false },
      },
    }));
  } catch (e) {
    set((s) => ({
      tabs: {
        ...s.tabs,
        [tabId]: { ...s.tabs[tabId], isLoadingRemote: false, error: String(e) },
      },
    }));
  }
},
```

### 9. Create `src/modules/sftp/components/SftpContextMenu.tsx`
A right-click context menu wrapping the file list. Uses shadcn `ContextMenu`.

```typescript
interface SftpContextMenuProps {
  tabId: string;
  side: "local" | "remote";
  selectedPaths: Set<string>;
  currentPath: string;
  onRefresh: () => void;
  children: React.ReactNode;
}
```

Menu items:
- **New Folder**: calls a local state setter `setCreatingFolder(true)` which shows an inline `<input>` at the top of the file list. On Enter, `invoke("sftp_mkdir", { tab_id, path: currentPath + "/" + folderName })` then `onRefresh()`. Local-side uses existing fs commands.
- **Rename**: only shown when exactly 1 file is selected. Opens an inline rename input in the row (set a `renamingPath` state, render input over the name cell).
- **Delete**: opens shadcn `AlertDialog` ("Delete X items? This cannot be undone."). On confirm: `invoke("sftp_delete", { tab_id, paths: [...selectedPaths] })` then `onRefresh()`.
- **Permissions (chmod)**: only for remote side. Opens a `Dialog` with a text input for octal permissions (e.g., `755`). On confirm: `invoke("sftp_chmod", { tab_id, path: selectedPath, permissions: parseInt(value, 8) })`.
- **Copy Path**: `navigator.clipboard.writeText([...selectedPaths].join("\n"))`.
- **Edit** (remote, single file only): calls `openRemoteEditorTab` from `useTabs` — this is implemented in Task 06.1. For now, show the item but keep it disabled with a `// TODO: Task 06.1` comment.

**Separator logic:** Group items logically. Use `<ContextMenuSeparator />` between groups.

**Wrap `VirtualizedFileList`:** In `SftpPane.tsx`, wrap each `VirtualizedFileList` with `SftpContextMenu`:
```tsx
<SftpContextMenu
  tabId={tabId}
  side="remote"
  selectedPaths={tabState.selectedRemotePaths}
  currentPath={tabState.remotePath}
  onRefresh={() => loadRemoteDir(tabId, tabState.remotePath)}
>
  <VirtualizedFileList ... />
</SftpContextMenu>
```

## Files to Create
- `src-tauri/src/modules/ssh/sftp.rs`
- `src/modules/sftp/components/SftpContextMenu.tsx`

## Files to Modify
- `src-tauri/src/modules/ssh/mod.rs` (add `pub mod sftp;`)
- `src-tauri/src/lib.rs` (register commands)
- `src/modules/sftp/store/sftpStore.ts` (replace mock `loadRemoteDir`)
- `src/modules/sftp/SftpPane.tsx` (wrap lists with SftpContextMenu)

## Expected Outcome
- The remote file pane loads and displays real files from the SSH server.
- Double-clicking a remote directory navigates into it.
- Right-clicking shows context menu. "New Folder" creates a directory on the remote. "Delete" removes files. "Rename" renames in place.
- `cargo check` and `pnpm exec tsc --noEmit` pass.

## Additional Information
- **Verify:** Run `cargo check` and `pnpm exec tsc --noEmit` before marking complete.
- `ssh2::Sftp` and `ssh2::Session` are not `Send`. All SFTP operations MUST happen while holding the `SshState` mutex, in the async command body (which runs on a blocking thread). Do NOT try to send them across threads.
- The `tab_id` passed to SFTP commands is the SSH session's tab ID. For SFTP tabs, this is the tab ID of the SSH session that was established — in the `SftpTab` type, `hostId` identifies which host's session to use. The store may need a mapping from SFTP tab ID → SSH session tab ID. Consider adding `sshTabId: string` to `SftpTab` type, or using `hostId` to look up the active session in a future refactor.
- For the MVP, assume the SFTP tab's own `id` corresponds to the SSH session `tab_id`. This requires that `ssh_connect` was called with that same tab ID.
