# Handshake — Session State

## Last Session: 2026-05-10

### What Was Done
- Completed **TASK_04_2 — SFTP Backend Commands & Context Menus**

  **Rust (`src-tauri/src/modules/ssh/sftp.rs`):**
  - Defined `FileNode` struct with serde Serialize/Deserialize
  - `mode_to_string(u32) → String` helper for Unix permission bits
  - `sftp_read_dir` — opens SFTP subsystem, reads dir, maps to FileNode[], sorts dirs first
  - `sftp_rename`, `sftp_delete` (with `rm -rf` fallback for dirs), `sftp_mkdir`, `sftp_chmod`
  - All commands use synchronous ssh2 calls directly (no spawn_blocking — correct for Tauri's blocking thread)
  - Fix: `stat.file_type()` returns `FileType` directly (not `Option`) — removed `.map()` wrapper
  - Registered all 5 commands in `lib.rs`

  **Frontend:**
  - `sftpStore.ts`: replaced mock `loadRemoteDir` with real `invoke("sftp_read_dir", { tab_id, path })`
  - `SftpContextMenu.tsx`: shadcn ContextMenu with New Folder, Rename, Delete (AlertDialog), Copy Path, Permissions/chmod (inline dialog), Edit Remote File (disabled, Task 06.1)
  - `VirtualizedFileList.tsx`: added inline rename props (`isRenaming`, `renameValue`, callbacks) — renders `<input>` over the name cell when renaming
  - `SftpPane.tsx`: wired Context Menu wrapping both panes, `NewFolderInput` inline bar, rename/commit logic using `sftp_rename` / `fs_rename`, `sftp_mkdir` / `fs_create_dir`
  - `cargo check` ✅ `tsc --noEmit` ✅

### Current State
- **Phase 4 complete.** Full SFTP UI: local pane (real data), remote pane (real SFTP data), context menus, rename, delete, new folder, chmod.
- **TASK_05_1 is next** — Background Transfer Worker (Rust)

### What's Next
- **TASK_05_1** — Rust tokio mpsc transfer queue worker
  - `enqueue_transfer`, `cancel_transfer`, `resolve_conflict` commands
  - Background worker that streams `transfer_progress` events to frontend
- Read `tasks/TASK_05_1_transfer_worker.md` before starting

### Blockers
- `~` path for local dir: Rust `std::fs::read_dir` does not expand `~`. If local pane fails to load home dir, call `homeDir()` from `@tauri-apps/api/path` first and pass the resolved absolute path to `loadLocalDir`.
- `fs_rename` IPC: not verified to exist in Rust — check `src-tauri/src/modules/fs/mutate.rs` before using it in SftpPane.
