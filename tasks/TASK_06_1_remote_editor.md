# Task 06.1 — Remote In-App Editing (CodeMirror Synergy)
**Phase:** 6 — Remote In-App Editing
**Status:** not_started
**Priority:** Normal
**Dependencies:** TASK_04_2

## Background & Context
Users need to edit remote files without leaving Nexum. The workflow is: right-click a remote file → "Edit" → the file is downloaded to a temp path → opened in the existing CodeMirror editor as a new tab → Cmd+S uploads it back to the server. This reuses the existing editor module completely; the only additions are the IPC commands for temp-file download/upload and a save hook in the editor.

## Work Instructions

### 1. Add Backend Commands to `src-tauri/src/modules/ssh/sftp.rs`
Open `src-tauri/src/modules/ssh/sftp.rs` (created in Task 04.2).

**`prepare_remote_edit` command:**
```rust
#[tauri::command]
pub async fn prepare_remote_edit(
    tab_id: String,
    remote_path: String,
    state: tauri::State<'_, crate::modules::ssh::SshState>,
) -> Result<String, String> {
    // 1. Stat the remote file to check size
    let (file_size, file_data) = {
        let map = state.0.lock().map_err(|e| e.to_string())?;
        let sess = map.get(&tab_id).ok_or("no session for tab")?;
        let sftp = sess.session.sftp().map_err(|e| e.to_string())?;
        
        let stat = sftp.stat(std::path::Path::new(&remote_path))
            .map_err(|e| e.to_string())?;
        let size = stat.size.unwrap_or(0);
        
        // Refuse files larger than 5 MB
        if size > 5 * 1024 * 1024 {
            return Err(format!(
                "File is too large for in-app editing ({} bytes). Max 5 MB.",
                size
            ));
        }
        
        let mut remote_file = sftp.open(std::path::Path::new(&remote_path))
            .map_err(|e| e.to_string())?;
        
        use std::io::Read;
        let mut buf = Vec::with_capacity(size as usize);
        remote_file.read_to_end(&mut buf).map_err(|e| e.to_string())?;
        (size, buf)
    };
    
    // 2. Create temp directory if needed
    let temp_dir = std::env::temp_dir().join("nexum_remote_edits");
    std::fs::create_dir_all(&temp_dir).map_err(|e| e.to_string())?;
    
    // 3. Build temp file path: {uuid}_{original_filename}
    let file_name = std::path::Path::new(&remote_path)
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| "file".to_string());
    let unique_id = uuid::Uuid::new_v4().to_string();
    let temp_path = temp_dir.join(format!("{}_{}", unique_id, file_name));
    
    // 4. Write data to temp file
    std::fs::write(&temp_path, &file_data).map_err(|e| e.to_string())?;
    
    Ok(temp_path.to_string_lossy().to_string())
}
```

**`save_remote_edit` command:**
```rust
#[tauri::command]
pub async fn save_remote_edit(
    tab_id: String,
    remote_path: String,
    local_temp_path: String,
    state: tauri::State<'_, crate::modules::ssh::SshState>,
) -> Result<(), String> {
    // 1. Read the (potentially modified) local temp file
    let data = std::fs::read(&local_temp_path).map_err(|e| e.to_string())?;
    
    // 2. Upload to remote via SFTP (overwrite)
    let map = state.0.lock().map_err(|e| e.to_string())?;
    let sess = map.get(&tab_id).ok_or("no session for tab")?;
    let sftp = sess.session.sftp().map_err(|e| e.to_string())?;
    
    use std::io::Write;
    let mut remote_file = sftp.create(std::path::Path::new(&remote_path))
        .map_err(|e| e.to_string())?;
    remote_file.write_all(&data).map_err(|e| e.to_string())?;
    
    Ok(())
}
```

Register both commands in `src-tauri/src/lib.rs`'s `generate_handler![]`:
```
prepare_remote_edit, save_remote_edit
```

### 2. Extend `EditorTab` Type in `src/modules/tabs/lib/useTabs.ts`
Open `src/modules/tabs/lib/useTabs.ts`.

Find the `EditorTab` type definition. Add two optional fields:
```typescript
export type EditorTab = {
  id: number;
  kind: "editor";
  title: string;
  filePath: string;
  // Remote editing metadata (optional — undefined for local files)
  remoteHostTabId?: string;   // SSH session tab ID to use for save_remote_edit
  remotePath?: string;        // Original remote path (to upload back to)
};
```

Add a new action `openRemoteEditorTab` to the `useTabs` hook:
```typescript
openRemoteEditorTab: async (
  sftpTabId: string,         // The SSH/SFTP tab's ID (used as ssh session tab_id)
  remotePath: string
) => Promise<void>;
```

Implementation:
```typescript
openRemoteEditorTab: async (sftpTabId, remotePath) => {
  try {
    // 1. Download to temp path
    const localTempPath = await invoke<string>("prepare_remote_edit", {
      tab_id: sftpTabId,
      remote_path: remotePath,
    });
    
    // 2. Get filename for tab title
    const fileName = remotePath.split("/").pop() ?? "remote-file";
    
    // 3. Create editor tab with remote metadata
    const newId = get().nextId;
    const newTab: EditorTab = {
      id: newId,
      kind: "editor",
      title: `✦ ${fileName}`, // prefix to distinguish remote files visually
      filePath: localTempPath,
      remoteHostTabId: sftpTabId,
      remotePath,
    };
    
    set((s) => ({
      tabs: [...s.tabs, newTab],
      activeTabId: newId,
      nextId: s.nextId + 1,
    }));
  } catch (e) {
    // Surface the error — e.g., file too large
    console.error("Failed to open remote file for editing:", e);
    throw e;
  }
},
```

**Note:** If `useTabs` does not have a `nextId` counter pattern, adapt to use whatever ID generation mechanism the existing code uses (look at how other tabs are created and follow the same pattern exactly).

### 3. Update the Editor to Save Back to Remote on Cmd+S
Study the existing editor files. The most likely candidates are:
- `src/modules/editor/EditorPane.tsx`
- `src/modules/editor/EditorStack.tsx`
- Or wherever `Cmd+S` / save is handled in the editor module.

Find where the save action is triggered (look for `"Mod-s"` in CodeMirror keybindings or a save button handler).

Add remote save logic after the local file write:
```typescript
// After the existing local save (write to disk via Tauri fs commands):
if (tab.remoteHostTabId && tab.remotePath) {
  try {
    await invoke("save_remote_edit", {
      tab_id: tab.remoteHostTabId,
      remote_path: tab.remotePath,
      local_temp_path: tab.filePath, // the temp file path
    });
    // Show a brief toast: "Saved to server"
    // Use whatever toast/notification mechanism the project uses.
    // If none exists, console.log is acceptable for MVP.
    console.info(`Saved ${tab.remotePath} to remote server.`);
  } catch (e) {
    console.error("Failed to save to remote:", e);
    // Show error toast
  }
}
```

**To show a toast:** Check if `sonner` or any toast library is already in `package.json`. If `sonner` is present, use `toast.success("Saved to server")` and `toast.error("Save failed: " + e)`. If not, skip the toast — the MVP behavior is acceptable without it.

### 4. Wire "Edit" in `SftpContextMenu.tsx`
Open `src/modules/sftp/components/SftpContextMenu.tsx` (created in Task 04.2).

Import `useTabs` and call `openRemoteEditorTab`:
```typescript
import { useTabs } from "@/modules/tabs";

// Inside the component:
const { openRemoteEditorTab } = useTabs();

// In the "Edit" menu item handler (replace the TODO comment):
onClick: async () => {
  const filePath = [...selectedPaths][0];
  if (!filePath) return;
  try {
    await openRemoteEditorTab(tabId, filePath);
  } catch (e) {
    // Show error (file too large, etc.)
    alert(String(e)); // Replace with proper toast in production
  }
}
```

Remove the `disabled` state from the "Edit" menu item.

Only show "Edit" for single file selection (not dirs, not multi-select). Add the guard:
```typescript
// Only show Edit for single non-directory file
const canEdit = selectedPaths.size === 1 &&
  !([...selectedPaths][0] && remoteFiles.find(f => f.path === [...selectedPaths][0])?.is_dir);
```

Pass `remoteFiles` as a prop to `SftpContextMenu` or derive `canEdit` differently based on available props.

### 5. Export New Actions from Tabs Module
Open `src/modules/tabs/index.ts` (or wherever the module barrel is). Ensure `openRemoteEditorTab` is accessible via `useTabs()`.

## Files to Modify
- `src-tauri/src/modules/ssh/sftp.rs` (add two new commands)
- `src-tauri/src/lib.rs` (register new commands)
- `src/modules/tabs/lib/useTabs.ts` (extend EditorTab, add openRemoteEditorTab)
- `src/modules/editor/EditorPane.tsx` or `EditorStack.tsx` (remote save on Cmd+S)
- `src/modules/sftp/components/SftpContextMenu.tsx` (wire Edit action)

## Expected Outcome
- Right-clicking a remote file in the SFTP pane and selecting "Edit" opens it in the CodeMirror editor as a new tab.
- The tab title is prefixed with `✦` to indicate a remote file.
- Pressing Cmd+S in the remote editor saves the file to the local temp path AND uploads it back to the remote server.
- Files larger than 5 MB show an error and do not open.
- `cargo check` and `pnpm exec tsc --noEmit` pass.

## Additional Information
- **Verify:** Run both `cargo check` and `pnpm exec tsc --noEmit` before marking complete.
- The `prepare_remote_edit` command downloads the file synchronously. This is acceptable for files ≤ 5 MB. The 5 MB limit exists to prevent blocking the main thread for too long.
- Temp files accumulate in `/tmp/nexum_remote_edits/`. A cleanup routine (e.g., delete on app exit or on tab close) is a future improvement, not required for this task.
- The remote save uses the same SSH session as the SFTP tab. If the session has disconnected since the tab was opened, `save_remote_edit` will return an error. Handle this gracefully in the editor (show error, do NOT silently succeed).
- The `✦` prefix in the tab title is a visual hint only. It does not affect any logic.
- If the existing editor codebase does not have a clean save hook location, look for `keymap.of([{ key: "Mod-s", run: ... }])` in the CodeMirror extensions configuration and add the remote save call there.
