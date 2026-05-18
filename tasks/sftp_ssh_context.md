# SSH, SFTP & Remote Editor Context
**Project:** Nexum (Hard-fork of Terax)
**Purpose:** This document defines the exact architecture, layout, design, and functional behavior for the SSH Terminal, SFTP File Manager, and the Remote In-App Editor synergy. AI agents must follow these architectural guidelines strictly to ensure smooth integration with the existing Terax codebase.

## 1. SSH Terminal Architecture (Extending Terax)

### 1.1 Tab Integration & Loading State
- **Tab Type:** Extend Terax's `Tab` union in `src/modules/tabs/lib/useTabs.ts` with a new `SshTerminalTab` (`kind: "ssh-terminal"`). Include `hostId: string` in its payload.
- **Initial Mount:** When an SSH tab opens, do NOT mount the `xterm.js` instance immediately. Instead, mount a `SshLoadingScreen` component.
- **Connection Loop (Rust `ssh2`):**
  1. React invokes `ssh_connect(tab_id, host_id)`.
  2. Rust fetches the host IP/Port from SQLite and the password from the macOS Keychain (`keyring`).
  3. **Security Check:** Rust compares the server's fingerprint against `~/.ssh/known_hosts`. If it mismatches, emit `known_hosts_warning` to React. The UI must prompt the user to "Trust" or "Abort".
  4. If authentication fails, Rust emits `auth_required`. The `SshLoadingScreen` morphs into an input form for the password/passphrase.
  5. Upon success, Rust emits `session_established(tab_id)`. React unmounts the loading screen and mounts the `TerminalPane`.

### 1.2 PTY & Window Management
- **Reusing Terax's Terminal:** We reuse the existing `src/modules/terminal/TerminalPane.tsx`.
- **Data Piping:** Instead of routing to `portable-pty` (local), the `TerminalPane` must detect if it's an SSH tab and route its `xterm.onData` to a new `ssh_pty_write` IPC command. Rust forwards this to the `ssh2` channel.
- **Resize Logic (Critical):** Terax uses `xterm-addon-fit`. When the window resizes, React MUST send `ssh_pty_resize(tab_id, cols, rows)`. Rust must send an SSH window-change packet to the server to prevent text wrapping artifacts.

---

## 2. SFTP File Manager Layout & Design

### 2.1 The Split-Pane Blueprint
Add a new tab type `SftpTab` (`kind: "sftp"`).
- **Component:** `src/modules/sftp/SftpPane.tsx` utilizing `shadcn/ui`'s `ResizablePanelGroup`.
- **Orientation:** Horizontal.
- **Left Panel (Local):** Browses the macOS local file system (can utilize logic from Terax's existing `src/modules/explorer`).
- **Right Panel (Remote):** Browses the SSH server's file system via `ssh2::Sftp`.
- **Divider:** Draggable `ResizableHandle`.

### 2.2 The Toolbar (Per Pane)
Each pane has a toolbar containing:
1. **Breadcrumb / Path Bar:** Editable input showing the absolute path. Pressing Enter navigates.
2. **Local Filter:** Text input that instantly filters the *currently loaded* React state array. No new network request.
3. **"Open Terminal Here" (Remote only):** Button that opens a new `ssh-terminal` tab, automatically injecting `cd [current_path] \n`.

### 2.3 The Virtualized File List
- **Engine:** `@tanstack/react-virtual` is MANDATORY. Directories might contain 10,000+ files.
- **Columns:** `Name` (with icon), `Size` (formatted), `Date Modified`, `Type` (or Unix Permissions).
- **Design:** High-density, minimal padding (`py-1`). Zebra striping (e.g., `bg-muted/10` on even rows). Sticky column headers.

---

## 3. SFTP Functions & Actions

### 3.1 Selection & Context Menu
- **Multi-Selection:** Support `Cmd+Click` and `Shift+Click`.
- **Context Menu:** Use `shadcn` `ContextMenu`.
  - `New Folder` / `New File` -> Opens an inline rename input.
  - `Rename` -> Morphs the Name cell into an `<input>`.
  - `Delete` -> Shows `AlertDialog`. Invokes `sftp_delete(paths)`.
  - `Chmod` -> Opens a modal with numeric input (e.g., `755`) or checkboxes.

### 3.2 Drag & Drop
- Dragging from Local Pane to Remote Pane -> Triggers **Upload**.
- Dragging from Remote Pane to Local Pane -> Triggers **Download**.
- Invokes `enqueue_transfer` IPC command.

---

## 4. Remote In-App Editing (CodeMirror Synergy)

**Context:** We will reuse Terax's existing `EditorStack` (`src/modules/editor/EditorPane.tsx`) to edit remote server files natively.

### 4.1 The "Remote Edit" Workflow
1. User right-clicks a text file in the SFTP remote pane and selects "Edit".
2. **Download:** React calls `prepare_remote_edit(host_id, remote_path)`.
3. Rust downloads the file to a secure temp directory (e.g., `/tmp/nexum_remote_edits/<uuid>_<filename>`) and returns the local path.
4. **Mount:** React opens a standard Terax `EditorTab`, but passes a special prop: `remoteHostId` and `remotePath`.
5. **Save (`Cmd+S`):** When the user presses Save, Terax's editor saves the local temp file. React intercepts this (via the `onSaved` callback) and invokes `save_remote_edit(host_id, remote_path, local_temp_path)`.
6. Rust automatically uploads the modified temp file back to the server via SFTP. React flashes a "Saved to server" toast.

---

## 5. The Global Transfer Manager

### 5.1 Rust Background Worker (tokio)
- **Rule:** Transfers must NOT block the UI or the active SSH/PTY thread.
- Rust maintains a global `tokio::mpsc` channel.
- `enqueue_transfer` pushes a `TransferJob` to the worker.
- The worker processes files in chunks (e.g., 64KB) via `ssh2` SFTP.
- Emits `transfer_progress` Tauri events every ~100ms containing `job_id`, `bytes_transferred`, and `speed`.

### 5.2 Conflict Resolution
- If the destination file exists, the worker pauses and emits `file_conflict(job_id, filename)`.
- React displays a Modal: "File already exists. [Overwrite] [Skip] [Rename]".
- Response is sent via `resolve_conflict` IPC, and the worker resumes.

### 5.3 UI Representation
- **State:** Handled by a new Zustand store: `src/modules/sftp/store/transferStore.ts`.
- **View:** A Dropdown/Popover component in Terax's existing `Header.tsx` (TitleBar). Displays active progress bars, speeds, and Cancel (`X`) buttons.

---

## 6. IPC Data Contracts (Crucial for AI Implementation)

When generating Rust commands and React fetchers, adhere to these signatures:

**React to Rust (Commands):**
- `invoke("sftp_read_dir", { host_id: string, path: string })` -> Returns `Array<FileNode>`
- `invoke("enqueue_transfer", { host_id: string, src: string, dest: string, direction: "upload" | "download" })` -> Returns `job_id: string`
- `invoke("cancel_transfer", { job_id: string })`
- `invoke("resolve_conflict", { job_id: string, resolution: "overwrite" | "skip" | "rename", new_name?: string })`
- `invoke("sftp_delete", { host_id: string, paths: string })` -> Returns `void`
- `invoke("sftp_rename", { host_id: string, old_path: string, new_path: string })` -> Returns `void`
- `invoke("sftp_chmod", { host_id: string, path: string, permissions: number })` -> Returns `void`
- `invoke("sftp_mkdir", { host_id: string, path: string })` -> Returns `void`

**Rust to React (Events via Tauri `emit`):**
- `listen("transfer_progress", (event) => ...)`
  - **Payload:** `{ job_id: string, bytes_transferred: number, total_bytes: number, speed_bytes_per_sec: number, status: "queued" | "running" | "paused" | "completed" | "error" }`
- `listen("file_conflict", (event) => ...)`
  - **Payload:** `{ job_id: string, filename: string, dest_path: string }`
- `listen("ssh_pty_output", (event) => ...)`
  - **Payload:** `{ tab_id: string, data: string }` // Raw ANSI string mapped to xterm.js
- `listen("auth_required", (event) => ...)`
  - **Payload:** `{ tab_id: string, prompt_message: string, is_2fa: boolean }`
- `listen("known_hosts_warning", (event) => ...)`
  - **Payload:** `{ tab_id: string, fingerprint: string, host: string, is_mismatch: boolean }`

**Crucial TypeScript / Rust Struct Mapping (`FileNode`):**
```typescript
type FileNode = {
  name: string;
  path: string;
  size: number; // in bytes
  modified_at: number; // Unix timestamp
  is_dir: boolean;
  is_symlink: boolean;
  symlink_target?: string; // Populated if is_symlink
  permissions: string; // e.g., "drwxr-xr-x" or numeric "755"
}
```

## 7. Heuristics for AI Implementation of SSH/SFTP
1. **Never block the main thread:** Standard Tauri `#[tauri::command]` runs on the main thread. A slow SFTP `read_dir` will freeze the whole UI (including the CodeMirror editor). You MUST use `async` commands or `tokio::task::spawn_blocking` for all `ssh2` calls!
2. **Chunking in SFTP:** When implementing the file transfer logic in Rust, read and write files in chunks (e.g., 64KB or 128KB). Emitting an IPC event to React on *every single byte* will overload the IPC bridge and crash the frontend. Only emit progress events periodically (e.g., every 100ms).
3. **No React Re-renders on PTY Keystrokes:** Do NOT store `xterm.js` terminal output inside a React `useState`. It will cause massive performance issues. `xterm.js` manages its own internal canvas state. React is solely used to mount the `<div ref={terminalRef} />` and pass the raw data from the Rust event directly into `term.write(data)`.
4. **Terax Integration:** Always check how `src/modules/terminal/TerminalPane.tsx` is built. When you create `SshTerminalPane.tsx`, mimic its structure (using refs for the xterm instance) so it fits perfectly into the existing ecosystem.
```

***
