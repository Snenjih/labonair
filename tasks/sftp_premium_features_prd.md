# PRD: Nexum Premium Features (SFTP & Host Manager Enhancements)
**Project:** Nexum
**Component:** Host Manager (Dashboard) & SFTP File Manager
**Goal:** Implement "Gold Standard" power-user features including Live Host Status (Ping), OS-Native Transfers, IP-based Bookmarks, Symlink traversal, Deep Server Search, and an Advanced Properties Dialog.

## 1. Feature 1: Live Host Status (Ping Indicator)
**Location:** `HomeDashboard.tsx` & `HostCard.tsx`
**Concept:** A visual indicator (glowing dot) on each host card showing if the server is currently reachable.
**Implementation Rules:**
- **Backend (Rust):** Create `ping_host(host_address: String, port: u16) -> Result<bool, String>`.
  - *CRITICAL:* Do NOT use ICMP pings. Use a TCP connection attempt to the specific port.
  - *CRITICAL:* To avoid macOS `EHOSTUNREACH` (Error 65) with local IPs, run a synchronous `std::net::TcpStream::connect` wrapped in a 1500ms timeout inside a dedicated background thread or `tokio::task::spawn_blocking`.
- **State Management:** Extend `hostsStore.ts` or create `usePingStore.ts`.
  - State: `statuses: Record<string, "checking" | "online" | "offline">`.
  - *Optimization:* Group hosts by `host_address:port`. Only ping each unique IP:Port combination once per cycle, then apply the result to all `host.id`s that share this address.
  - Loop: Run the check on mount, then every 60 seconds. Do not reset status to `"checking"` during the 60s refresh (prevents UI flickering).
- **UI:** Add a dot indicator to the `HostCard`.
  - Online: `bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]`
  - Offline: `bg-destructive`
  - Checking: `bg-muted animate-pulse`

## 2. Feature 2: OS-Native Upload & Download
**Location:** `SftpContextMenu.tsx`
**Concept:** Allow users to upload files from their Mac or download files to a specific Mac folder without using the split-pane drag-and-drop.
**Implementation Rules:**
- **Context Menu Items:** 
  - `Download to...` (Visible when 1+ remote items are selected).
  - `Upload files here...` (Visible when right-clicking the remote pane background/directory).
- **API:** Use `@tauri-apps/plugin-dialog` (`open` for upload, `save` or `open({ directory: true })` for download).
- **Wiring:** Pass the OS-selected paths to the existing `enqueue_transfer` Tauri command.

## 3. Feature 3: Symlink Resolution
**Location:** `sftp.rs` & `VirtualizedFileList.tsx`
**Concept:** Correctly display and traverse Linux symbolic links.
**Implementation Rules:**
- **Backend:** In `sftp_read_dir`, if `stat.file_type().is_symlink()` is true, call `sftp.readlink(path)`. Store the result in the `symlink_target` field of `FileNode`.
- **UI:** Show symlink names in *italic*. Show the target path in a faded color next to the permissions or in a tooltip.
- **Interaction:** If the user double-clicks a symlink, and the target is a directory, `loadRemoteDir` must navigate to the target path.

## 4. Feature 4: IP-Based Bookmark System
**Location:** `SftpToolbar.tsx`, `SftpContextMenu.tsx`, `useBookmarksStore.ts`
**Concept:** Quick-access saved paths. Remote bookmarks are tied to the server IP, so different hosts pointing to the same server share bookmarks.
**Implementation Rules:**
- **Store (`useBookmarksStore.ts`):** Backed by `tauri-plugin-store` (`nexum-bookmarks.json`).
  - Schema: `Record<string, string[]>` (Key is `host_address` or `"local"`, Value is an array of absolute paths).
- **UI Context Menu:** Add `Bookmark this path`.
- **UI Toolbar:** Add a Bookmark Icon (`Bookmark02Icon`). Clicking it opens a `DropdownMenu` listing saved paths for the current context (Local or Remote IP).
- **Interaction:** Clicking a bookmark navigates to it. Each item has an `X` button on the right edge (visible on hover) to delete the bookmark.

## 5. Feature 5: Deep Server Search (`find`)
**Location:** `SftpToolbar.tsx` & `sftp.rs`
**Concept:** Recursive search on the server, bypassing the local frontend-only filter.
**Implementation Rules:**
- **UI Trigger:** If the user types in the SFTP search bar and presses `Enter`, trigger a deep search instead of standard local filtering.
- **Backend Command:** `sftp_deep_search(tab_id, start_path, query)`.
  - Uses `ssh_exec_command` to execute: `find <start_path> -iname "*<query>*" -maxdepth 5 -print 2>/dev/null | head -n 200`.
  - Returns a list of paths.
- **UI Results:** Display the results either by replacing the `VirtualizedFileList` content with the search hits (showing full relative paths), or in a dedicated modal overlay. Double-clicking a hit navigates to its parent folder.

## 6. Feature 6: Advanced Properties Dialog (Eigenschaften)
**Location:** `PropertiesDialog.tsx`, `sftp.rs`, `SftpContextMenu.tsx`
**Concept:** A unified, OS-like properties window to manage ownership, permissions, and calculate true directory sizes.
**Implementation Rules:**
- **Trigger:** `Properties` in the Context Menu. Opens a shadcn `Dialog`.
- **Layout (Tabs):**
  - **Tab 1: General:** Displays Name, Absolute Path, Type, and Size. If it is a directory, show a `Calculate Size` button.
  - **Tab 2: Permissions:** Checkboxes and inputs for User/Group ownership and read/write/execute bits.
- **Backend Size Calculation:** Command `sftp_calculate_size(tab_id, path)`. Runs `du -sh "<path>"` via `ssh_exec_command`. Returns the human-readable string (e.g., `1.2G`). Updates the UI live.
- **Permission Matrix (Crucial Logic):** 
  - Render a grid: Rows (Owner, Group, Public), Columns (Read, Write, Execute).
  - Checkboxes must perfectly sync with an Octal text input field (e.g., `755`).
  - Math logic: Read = 4, Write = 2, Execute = 1.
- **Ownership (Chown):** 
  - Text inputs for `Owner` and `Group`.
  - Backend Command: `sftp_chown(tab_id, path, owner, group)`. Executes `chown owner:group "<path>"` via `ssh_exec_command` (Note: may require sudo, handle "Permission denied" gracefully).
- **Apply Action:** An "Apply" button sends `sftp_chmod` and `sftp_chown` sequentially.

## 7. Global AI Heuristics & Rules
- **No Blocking the Main Thread:** All new Rust commands (`ping_host`, `sftp_deep_search`, `sftp_calculate_size`, `sftp_chown`) perform network I/O. They MUST be wrapped in `tokio::task::spawn_blocking` or be async to prevent Tauri UI freezes.
- **Error Handling:** SSH commands like `du` or `find` might return `stderr` (e.g., "Permission denied"). The Rust command must parse `exit_code`. If the code is non-zero but `stdout` contains data, handle it gracefully. Do not use `unwrap()`.
- **Design Integrity:** Use `shadcn/ui` components for all new UI elements (Dialog, Tabs, Checkbox, DropdownMenu). Adhere to the `bg-background`, `text-muted-foreground` semantic variables from Tailwind v4.
