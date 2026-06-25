


Das ist der entscheidende Masterplan. Da wir nun Terax als Basis nutzen, überspringen wir all die mühsamen Basis-Setups (Tauri-Init, React-Setup, Theme-Engine, CodeMirror, xterm.js). Wir konzentrieren uns in diesem Plan zu 100% darauf, die Terax-Codebase zu "Labonair" umzubauen und unsere genialen Remote-Features in die modulare Architektur (`src/modules/`) zu injizieren.

Hier ist die komplett neue, maßgeschneiderte **`plan-overview.md`** (auf Englisch, gemäß meinen Systemvorgaben). Speichere diesen Text in deinem Root-Ordner ab.

***

```markdown
# Labonair: Implementation Plan

## 1. Project Overview
- **Project Name**: Labonair
- **Project Purpose**: Transform the open-source "Terax" AI-terminal into a powerful, secure, and native remote workspace for Sysadmins and Developers. Adds SQLite-based host management, native SSH connections with macOS Keychain security, a virtualized split-pane SFTP manager, and remote in-app editing capabilities, while retaining Terax's 60-FPS performance and AI integrations.
- **Architecture Overview**:
  - **Framework**: Tauri v2, React 19, Vite.
  - **Backend**: Rust (Edition 2021) + Tokio.
  - **Modules Structure**: Domain-driven frontend structure (`src/modules/tabs`, `src/modules/terminal`, `src/modules/hosts`, `src/modules/sftp`).
- **Technology Stack**:
  - `rusqlite`, `ssh2`, `keyring`, `tokio` (Rust).
  - Tailwind CSS v4, shadcn/ui, Zustand, `@tanstack/react-virtual`, `@uiw/react-codemirror`, `xterm.js`.

## 2. TODO Management Instructions
This TODO section serves as the central tracking system for the complete rewrite project. It must be kept current at all times:
- **Always Updated**: Add new tasks as they arise during implementation
- **Progress Tracking**: Mark tasks as in_progress when starting, completed when finished
- **Context for Future Sessions**: Provides complete project state for continuation
- **Detailed Tasks**: Each task includes file paths, purpose, and implementation details
- **Phase-Based Organization**: Tasks grouped by implementation phases
- **Keep Claudes TODO updated**: Keep the session's todo list always up to date and provide the tasks and what you still have to do from the current phase.
- **Do not summarise**: Do not summarise Informations of tasks and Todos

## 3. Project Status
- **Current Phase**: Phase 1
- **Overall Progress**: 0%
- **Last Updated**: 2026-05-09
- **Active Tasks**: 1.1 Rebranding & Project Configuration

## 4. Phases and Subphases

### Phase 1 - Rebranding & Foundation
Status: not_started

#### Subphase 1.1 - Rebranding & Project Configuration
Status: not_started

**Background & Context:**
The codebase is currently branded as "Terax". We need to safely rename all references, update bundle identifiers, and adjust the `package.json` and `tauri.conf.json` to reflect "Labonair" before adding new features.

**Work Instructions:**
1. Update `tauri.conf.json`: Change `productName` to "Labonair" and `identifier` to `com.labonair.app`.
2. Update `package.json`: Change name to `labonair`.
3. Update `src/app/App.tsx` and other UI files (like `AiMiniWindow.tsx` and `AboutSection.tsx`) to replace "Terax" with "Labonair".
4. Update `src-tauri/Cargo.toml`: Change package name and descriptions to Labonair. Update binary/lib names appropriately.

**Files to Create/Modify:**
- `src-tauri/tauri.conf.json`
- `package.json`
- `src-tauri/Cargo.toml`
- `src-tauri/src/main.rs` (update `terax_lib::run()` to `labonair_lib::run()`)
- `src/app/App.tsx`
- `src/modules/settings/sections/AboutSection.tsx`

**Expected Outcome:**
The application builds and runs as "Labonair". Window titles, about sections, and bundle identifiers are updated.

#### Subphase 1.2 - Tab System Extension & Home View Setup
Status: not_started

**Background & Context:**
Terax opens a local terminal by default. Labonair should open a "Home" dashboard (Host Manager) by default. We need to extend Terax's tab system to support the new Labonair specific tabs (`home`, `ssh-terminal`, `sftp`).

**Work Instructions:**
1. Update `src/modules/tabs/lib/useTabs.ts` to include `HomeTab`, `SshTerminalTab`, and `SftpTab` in the `Tab` discriminated union.
2. Modify the default startup state in `useTabs.ts` to spawn a `HomeTab` instead of a local terminal.
3. Update `TabBar.tsx` to render the correct icons for the new tab kinds.
4. Update `App.tsx` to conditionally render placeholders for `<HomeStack />`, `<SshStack />`, and `<SftpStack />` using the `invisible pointer-events-none` pattern (just like `TerminalStack`).

**Files to Create/Modify:**
- `src/modules/tabs/lib/useTabs.ts`
- `src/modules/tabs/TabBar.tsx`
- `src/app/App.tsx`

**Expected Outcome:**
Launching the app opens a "Home" tab by default. The tab infrastructure is ready to receive the new SSH and SFTP components.

### Phase 2 - Database & Host Management
Status: not_started

#### Subphase 2.1 - SQLite Integration (Backend)
Status: not_started

**Background & Context:**
Labonair requires robust, relational storage for Host configurations (IP, Port, Username) and Groups. Passwords will NOT be stored here.

**Work Instructions:**
1. Add `rusqlite` to `src-tauri/Cargo.toml`.
2. Create `src-tauri/src/modules/hosts/mod.rs` and `db.rs`.
3. Implement SQLite initialization (creating tables: `groups`, `hosts`). Use Tauri's `app_local_data_dir()` for the DB path.
4. Implement Tauri commands for CRUD operations: `hosts_get_all`, `hosts_create`, `hosts_update`, `hosts_delete`.
5. Register these commands in `src-tauri/src/lib.rs`.

**Files to Create/Modify:**
- `src-tauri/Cargo.toml`
- `src-tauri/src/modules/hosts/mod.rs`
- `src-tauri/src/modules/hosts/db.rs`
- `src-tauri/src/lib.rs`

**Expected Outcome:**
Rust backend can perform full CRUD operations on SQLite tables for hosts and groups.

#### Subphase 2.2 - Host Management UI (Home Dashboard)
Status: not_started

**Background & Context:**
The Home Tab is the central hub for users to connect to their servers. It requires a searchable list of hosts and a slide-out drawer to create/edit connections.

**Work Instructions:**
1. Create `src/modules/hosts/store/hostsStore.ts` using Zustand to fetch and cache hosts via IPC.
2. Create `src/modules/hosts/components/HomeDashboard.tsx` displaying a searchable grid/list of hosts.
3. Create `src/modules/hosts/components/HostDrawer.tsx` using `shadcn/ui` `Sheet`. Include form inputs for Name, Address, Port, Username, and Auth Method.
4. Integrate Keychain saving: When creating/updating a host with a password, invoke the *existing* `secrets_set` command (from `src-tauri/src/modules/secrets.rs`) using the Host UUID.
5. Mount `HomeDashboard` in `App.tsx` for the `home` tab type.

**Files to Create/Modify:**
- `src/modules/hosts/store/hostsStore.ts`
- `src/modules/hosts/components/HomeDashboard.tsx`
- `src/modules/hosts/components/HostDrawer.tsx`
- `src/app/App.tsx`

**Expected Outcome:**
Users can create, edit, delete, and search hosts. Passwords are transparently routed to the OS keychain.

### Phase 3 - Interactive SSH Terminal
Status: not_started

#### Subphase 3.1 - SSH Connection & known_hosts Validation
Status: not_started

**Background & Context:**
To connect to remote servers securely, we need to implement the SSH protocol in Rust, validating host keys against `~/.ssh/known_hosts` to prevent MITM attacks.

**Work Instructions:**
1. Add `ssh2` to `Cargo.toml`.
2. Create `src-tauri/src/modules/ssh/client.rs`. Implement TCP connect and SSH handshake.
3. Implement `known_hosts` validation using `ssh2::KnownHosts`. If mismatch/unknown, return a specific error enum.
4. Implement authentication via password (fetched from keyring via UUID) or local private key.
5. Provide a Tauri command `ssh_connect(tab_id, host_id)` that executes asynchronously (`tokio::task::spawn_blocking`).

**Files to Create/Modify:**
- `src-tauri/Cargo.toml`
- `src-tauri/src/modules/ssh/mod.rs`
- `src-tauri/src/modules/ssh/client.rs`
- `src-tauri/src/lib.rs`

**Expected Outcome:**
Rust can successfully negotiate SSH connections, validate fingerprints, and authenticate using the OS keychain.

#### Subphase 3.2 - SSH PTY & Interactive Loading Screen
Status: not_started

**Background & Context:**
Instead of failing silently on bad passwords, the SSH tab should show an interactive UI prompt, then pipe the connection into Terax's existing `xterm.js` implementation.

**Work Instructions:**
1. Create `src/modules/terminal/components/SshLoadingScreen.tsx`. It listens to IPC events for `auth_required` or `known_hosts_warning`.
2. Create `src/modules/terminal/SshTerminalPane.tsx`. Initially mounts the `SshLoadingScreen`. Upon successful connection event, unmounts the screen and renders the standard `xterm.js` component.
3. In Rust, once connected, request a PTY from the SSH session. Spawn threads to forward SSH stdout/stderr to the frontend (reusing Terax's `PtyEvent::Data` format) and forward frontend input to SSH stdin.
4. Implement window-change packets via IPC for terminal resizing.

**Files to Create/Modify:**
- `src/modules/terminal/components/SshLoadingScreen.tsx`
- `src/modules/terminal/SshTerminalPane.tsx`
- `src/app/App.tsx` (Add SshStack)
- `src-tauri/src/modules/ssh/pty.rs`

**Expected Outcome:**
Double-clicking a host opens a new tab. It shows a loading screen, prompts for a password if missing, and then displays a fully functional remote terminal at 60 FPS.

### Phase 4 - SFTP File Manager
Status: not_started

#### Subphase 4.1 - Virtualized Split-Pane UI
Status: not_started

**Background & Context:**
The ultimate power-user feature: a split-pane local/remote file browser that can handle massive directories.

**Work Instructions:**
1. Create `src/modules/sftp/SftpPane.tsx`. Use `shadcn` `ResizablePanelGroup` (horizontal).
2. Left panel shows local files, Right panel shows remote files.
3. Create `VirtualizedFileList.tsx` using `@tanstack/react-virtual`. Display columns: Name, Size, Modified, Type.
4. Add editable breadcrumb/path toolbars for both panes.

**Files to Create/Modify:**
- `src/modules/sftp/SftpPane.tsx`
- `src/modules/sftp/components/VirtualizedFileList.tsx`
- `src/modules/sftp/components/SftpToolbar.tsx`

**Expected Outcome:**
The SFTP tab displays two resizable panels. The UI handles thousands of mock items smoothly via virtualization.

#### Subphase 4.2 - SFTP Backend Commands & Context Menus
Status: not_started

**Background & Context:**
Wiring the virtualized UI to actual SSH/SFTP backend commands and adding right-click context actions.

**Work Instructions:**
1. In Rust, implement commands using `ssh2::Sftp`: `sftp_read_dir`, `sftp_rename`, `sftp_delete`, `sftp_mkdir`, `sftp_chmod`.
2. In React, build `SftpContextMenu.tsx` using `shadcn` ContextMenu.
3. Wire the context menu to the backend commands (Rename opens inline input, Chmod opens modal, Delete shows alert dialog).

**Files to Create/Modify:**
- `src-tauri/src/modules/ssh/sftp.rs`
- `src/modules/sftp/components/SftpContextMenu.tsx`
- `src/modules/sftp/components/VirtualizedFileList.tsx`

**Expected Outcome:**
Users can navigate the remote filesystem, create folders, rename files, and change permissions entirely from the GUI.

### Phase 5 - Global Transfer Manager
Status: not_started

#### Subphase 5.1 - Background Tokio Worker
Status: not_started

**Background & Context:**
Transfers must not block the UI or die if the SFTP tab is closed. We need a background queue.

**Work Instructions:**
1. In Rust, create `src-tauri/src/modules/sftp/worker.rs`.
2. Initialize an `mpsc` channel and spawn a `tokio` background task on app startup.
3. Implement `enqueue_transfer` IPC command. The worker reads/writes in 64KB chunks and emits `transfer_progress` Tauri events every ~100ms.
4. Implement Conflict Resolution: If a file exists, emit `file_conflict` and wait for UI response (Overwrite/Skip/Rename).

**Files to Create/Modify:**
- `src-tauri/src/modules/sftp/worker.rs`
- `src-tauri/src/modules/sftp/commands.rs`
- `src-tauri/src/lib.rs` (Spawn worker)

**Expected Outcome:**
Rust can process file uploads and downloads asynchronously in the background.

#### Subphase 5.2 - Transfer UI Dropdown & Drag and Drop
Status: not_started

**Background & Context:**
Visualizing the background transfers globally and initiating them via drag & drop.

**Work Instructions:**
1. Create `src/modules/sftp/store/transferStore.ts` (Zustand) to listen to `transfer_progress` events.
2. Add a `TransferDropdown` component to the `TitleBar` (Header.tsx). It shows active jobs, speed, and pause/cancel buttons.
3. Implement HTML5 Drag and Drop in the `VirtualizedFileList.tsx`. Dragging from Local to Remote invokes `enqueue_transfer(upload)`.

**Files to Create/Modify:**
- `src/modules/sftp/store/transferStore.ts`
- `src/modules/header/components/TransferDropdown.tsx`
- `src/modules/header/Header.tsx`
- `src/modules/sftp/components/VirtualizedFileList.tsx`

**Expected Outcome:**
Dragging a file across the split-pane queues a transfer. The global Titlebar shows progress visually.

### Phase 6 - Remote In-App Editing
Status: not_started

#### Subphase 6.1 - EditorTab Synergy
Status: not_started

**Background & Context:**
Leverage Terax's existing `EditorStack` to edit remote files.

**Work Instructions:**
1. Update `Tab` union: Ensure `EditorTab` has a property `remoteHostId?: string`.
2. Implement right-click -> "Edit" in `SftpContextMenu`.
3. Rust command `prepare_remote_edit`: Downloads file to `/tmp/labonair/...` and returns the local path.
4. React opens `EditorTab` pointing to this local path.
5. Intercept the save action (`Cmd+S`) in `EditorPane.tsx`. If `remoteHostId` is present, call Rust `upload_remote_edit` to push the saved temp file back via SFTP.

**Files to Create/Modify:**
- `src/modules/tabs/lib/useTabs.ts`
- `src/modules/sftp/components/SftpContextMenu.tsx`
- `src/modules/editor/EditorPane.tsx`
- `src-tauri/src/modules/ssh/sftp.rs`

**Expected Outcome:**
Clicking "Edit" on a remote file opens CodeMirror. Saving automatically syncs the file back to the server.
```

***

**Was hältst du von dieser neuen Aufteilung?**
Anstatt 20 Tasks für Dinge zu schreiben, die Terax schon hat, führt dieser Plan die KI wie ein Skalpell genau dorthin, wo der Terax-Code **erweitert** werden muss (Neue Module, Rust-Crates für SSH/SQLite, State-Updates für Transfer-Queues).

Wenn du bereit bist, generiere ich dir im nächsten Schritt die detaillierten **`TASK_*.md`** Dateien (für den `tasks/` Ordner), damit wir den Agenten direkt auf Subphase 1.1 (Das Rebranding von Terax zu Labonair) ansetzen können!
