# SFTP UI Context — Task 04.1 / 04.2 Reference

## What Was Built (Task 04.1)

### Module: `src/modules/sftp/`

```
src/modules/sftp/
├── types.ts                         — FileNode, TransferDirection
├── index.ts                         — barrel: SftpPane, FileNode, TransferDirection, useSftpStore
├── SftpPane.tsx                     — top-level split-pane component
├── store/
│   └── sftpStore.ts                 — Zustand per-tab SFTP state
└── components/
    ├── VirtualizedFileList.tsx      — @tanstack/react-virtual file list
    └── SftpToolbar.tsx              — path input + navigation toolbar
```

### Key Design Decisions

- **Tab ID**: always `String(tab.id)` (number → string) as the Zustand key.
- **Local dir loading**: uses existing `fs_read_dir` Rust command (returns `DirEntry[]` with `kind: "file"|"dir"|"symlink"`, `mtime` in ms). Mapped to `FileNode` in store.
- **Remote dir loading**: mock (300ms delay, empty array) in Task 04.1. Replace with real `sftp_read_dir` in Task 04.2.
- **`~` path**: passed directly to `fs_read_dir`. Rust `std::fs::read_dir` does NOT expand `~` — if this breaks, add a Rust helper or use `homeDir()` from `@tauri-apps/api/path` before invoking.
- **ResizablePanelGroup**: uses `orientation` prop (not `direction`) — react-resizable-panels v4 API.
- **Selection**: `Set<string>` in Zustand. Always create `new Set(...)` on update to trigger re-renders.

### IPC Used
- `fs_read_dir({ path: string }) → DirEntry[]` — local filesystem listing

### IPC Needed (Task 04.2)
- `sftp_read_dir({ tab_id: string, path: string }) → FileNode[]`
- `sftp_rename`, `sftp_delete`, `sftp_mkdir`, `sftp_chmod`
- `enqueue_transfer`, `cancel_transfer`, `resolve_conflict`

## Task 04.2 — What Still Needs To Be Done

### Frontend
- Wire `loadRemoteDir` to real `invoke("sftp_read_dir", { tab_id: tabId, path })` in `sftpStore.ts`
- Context menus on file rows (right-click): rename, delete, mkdir, copy path, permissions
- Drag-and-drop between panes (uploads/downloads) — `onDragStart` / `onDrop` props already exist on `VirtualizedFileList`
- "Open Terminal Here" button in remote toolbar should open an SSH terminal tab at the current remote path

### Rust Backend
- `sftp_read_dir` command: requires an active SSH session (from `SshState`), opens SFTP subsystem, reads dir, returns `Vec<FileNode>` with permissions string
- See `sftp_ssh_context.md` Section 6 for full IPC contract

## `FileNode` Shape
```typescript
interface FileNode {
  name: string;
  path: string;        // absolute path
  size: number;        // bytes (0 for dirs)
  modified_at: number; // Unix timestamp seconds
  is_dir: boolean;
  is_symlink: boolean;
  symlink_target?: string;
  permissions: string; // e.g. "rwxr-xr-x" (empty string for local files)
}
```

## `DirEntry` Shape (from existing Rust `fs_read_dir`)
```typescript
interface DirEntry {
  name: string;
  kind: "file" | "dir" | "symlink";
  size: number;
  mtime: number; // milliseconds since epoch
}
```
Note: path must be constructed as `${parentPath}/${entry.name}`.

## Styling Notes
- Pane label bar: `h-7 bg-muted/20 border-b border-border`
- Toolbar: `h-9 bg-card border-b border-border`
- Column header: `h-7 bg-card border-b border-border`
- FileRow: `h-7`, zebra `bg-muted/10` on even rows, selected `bg-primary/20 ring-1 ring-inset ring-primary/40`
- All colors via semantic Tailwind vars — no hardcoded hex
