# SFTP Enhancements & Premium Features Context
**Project:** Nexum
**Component:** SFTP File Manager (Phase 4 / Extensions)

## 1. Feature Overview
This document specifies the exact architecture for a set of premium enhancements to the SFTP manager. These features elevate the UX to a "Gold Standard" power-user tool.

### Out of Scope (Deferred)
- Smart Archive Handling (Zip/Tar compress & extract) is explicitly deferred for a future update. Keep architecture clean but do not implement compression yet.

---

## 2. Feature Definitions & Architecture

### 2.1 OS-Native Upload & Download (Context Menu)
**Concept:** Users must be able to upload or download files via the OS file picker, even without using the split-pane drag & drop.
**Implementation:**
- **Context Menu Additions:** 
  - `Download to...` (Visible when right-clicking remote files/folders).
  - `Upload here...` (Visible when right-clicking the background or a folder).
- **API:** Use `@tauri-apps/plugin-dialog` (`open` and `save`).
- **Wiring:** After the user selects a local destination via the dialog, invoke the existing `enqueue_transfer` IPC command.

### 2.2 Symlink Resolution
**Concept:** The file manager must intelligently handle symbolic links.
**Implementation (Rust):**
- In `sftp_read_dir`, if `stat.file_type().is_symlink()` is true, attempt to resolve the target using `sftp.readlink(path)`.
- Attach the resolved path to the `FileNode.symlink_target` string.
**Implementation (React):**
- If a user double-clicks a symlink, check if its target is a directory. If yes, navigate into it via `loadRemoteDir(target)`.

### 2.3 IP-Based Bookmark System
**Concept:** Users can bookmark specific local or remote paths. Remote bookmarks are shared across all hosts that use the same IP address.
**Storage:** 
- Create a new Zustand store `useBookmarksStore.ts` backed by `tauri-plugin-store` (file: `nexum-bookmarks.json`).
- Data Structure: `Record<string, string[]>` where the key is the `host_address` (e.g., `"192.168.1.37"`) or `"local"` for the local filesystem.
**UI (Context Menu):** Add `Bookmark this path` to the context menu.
**UI (Toolbar):** 
- Add a Bookmark Icon button (`Bookmark02Icon`) to the `<SftpToolbar>`.
- Clicking it opens a `DropdownMenu`.
- It lists all saved paths for the current pane's context (Local vs. specific IP).
- Clicking a path navigates to it.
- Each row has a hoverable `X` button (`Cancel01Icon`) aligned to the right to delete the bookmark.

### 2.4 Deep Server Search (`find`)
**Concept:** The current filter only searches the loaded React array. We need true recursive server search.
**Implementation:**
- Extend the toolbar search input. If the user presses `Enter` while typing a query, trigger a deep search.
- **Rust Backend:** Create `sftp_deep_search(tab_id, start_path, query)`. Use `ssh_exec_command` under the hood to run `find <start_path> -iname "*<query>*" -maxdepth 5 -print` on the remote server.
- **Frontend:** Render the results in the `VirtualizedFileList` (or a dedicated modal). Clicking a result navigates to its parent directory and highlights the file.

### 2.5 Properties Dialog (Eigenschaften) - The Core Feature
**Concept:** A unified dialog to view metadata, calculate real folder sizes, and manage Unix permissions and ownership.
**Trigger:** `Properties` in the right-click Context Menu. Opens a shadcn `Dialog`.
**Content / Tabs:**
1. **Metadata:** 
   - File Name, Absolute Path, Type.
   - **Dates:** Created (if available by OS), Last Modified.
2. **Size & Calculation:**
   - Files show standard size.
   - Folders show a `Calculate Size` button.
   - Clicking it invokes a Rust command that runs `du -sh "<path>"` via SSH, returning the human-readable size (e.g., "4.2 GB") and updating the dialog live.
3. **Permissions & Ownership:**
   - **Owner/Group:** Inputs to change user/group (e.g., `www-data`).
   - **Permissions:** Octal input (e.g., `755`) alongside a grid of checkboxes (Read/Write/Execute for Owner/Group/Public).
   - **Apply:** An `Apply` button that triggers Rust to execute `chmod` (via SFTP) and `chown` (via SSH exec: `sudo chown user:group path` or standard `chown`).
   - **OS Fallback:** If the backend detects the server does not support standard Unix `chmod/chown` (e.g., Windows OpenSSH), gracefully disable these inputs.

---

## 3. IPC Contracts & Backend Guidelines

The AI agent must implement or extend the following Rust commands:
- `sftp_get_properties(tab_id, path)`: Returns detailed stat info (uid, gid, permissions).
- `sftp_calculate_size(tab_id, path)`: Runs `du -sh` via `ssh_exec_command`.
- `sftp_chown(tab_id, path, owner, group)`: Runs `chown owner:group path` via `ssh_exec_command`.

**Heuristics for the AI:**
- Never block the Tauri main thread. Use `tokio::task::spawn_blocking` for all SSH/SFTP calls.
- In the Properties Dialog, changes to checkboxes must automatically update the Octal text input, and vice versa. Use standard bitwise logic (4=Read, 2=Write, 1=Execute).
