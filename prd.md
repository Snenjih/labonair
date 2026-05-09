# Product Requirements Document (PRD)
**Project Name:** Nexum (Hard-fork of Terax)
**Target Platform:** macOS (Native Desktop Application via Tauri v2)
**Distribution:** `.dmg` installer and Homebrew Cask (Not Mac App Store)

## 1. Product Vision & Scope
**Nexum** is an evolution of the open-source "Terax" AI-terminal project. While Terax provides an incredible foundation for local terminal emulation, local file exploring, an integrated CodeMirror editor, and AI assistance, **Nexum transforms it into the ultimate Remote Workspace for Sysadmins and Backend Developers.**

Nexum introduces powerful, secure, and native remote capabilities (SSH and SFTP) without compromising the lightweight nature and 60-FPS performance of the base application. It directly competes with commercial tools like Termius and bloated Electron apps like Tabby, but completely open-source and natively integrated with macOS.

### 1.1 Out of Scope (Version 1.0 of Nexum)
- Cloud-syncing of hosts across multiple devices (keep it local for now).
- Plugin/Extension marketplace.
- Cross-platform optimizations (Windows/Linux work technically, but macOS UX is the absolute priority).

---

## 2. Technical Architecture & Stack
Nexum inherits Terax's highly optimized, modular stack, and extends it with specific remote-networking crates.

- **Frontend:** React 19, TypeScript, Vite.
- **Styling:** Tailwind CSS **v4** (No tailwind.config.js, using `app.css`/`globals.css` with `@theme`), shadcn/ui.
- **State Management:** Zustand (strictly used for cross-component global state like Transfer Queues).
- **Core UI Components:** `xterm.js` (WebGL), `@uiw/react-codemirror`, `@tanstack/react-virtual`.
- **Backend (Rust + Tokio):**
  - *Inherited:* `portable-pty` (Local shell), AI agent runtimes.
  - *New Core Crates:* 
    - `rusqlite` (Host and group metadata storage).
    - `keyring` (macOS Keychain for SSH passwords & passphrases).
    - `ssh2` / `russh` (SSH protocol, PTY management, and SFTP subsystem).

---

## 3. Core Features & Functional Requirements

### 3.1 Rebranding & Clean-Up
- **Identity:** Rename all "Terax" references in `tauri.conf.json`, `package.json`, and the UI to "Nexum".
- **Identifier:** Change bundle identifier from `app.crynta.terax` to `com.nexum.app`.

### 3.2 Host & Credential Management (The "Home" Module)
- **Home View:** Replaces the default empty state. Displays a searchable grid/list of saved SSH/SFTP hosts.
- **Storage:** Host metadata (UUID, Name, IP, Port, Username, Auth Method, Group) is stored in a local SQLite database (`~/.local/share/com.nexum.app/nexum.db`).
- **Security:** Passwords and Private Key Passphrases are **NEVER** stored in SQLite. They are securely saved in the macOS Keychain (`keyring` crate) using the Host's UUID as the account identifier.
- **Slide-out Drawer:** Creating or editing a host triggers a right-side drawer (using shadcn `Sheet`) containing the configuration form.

### 3.3 Interactive SSH Terminal Engine
- **Tab Integration:** Extend the existing `Tab` union with `SshTerminalTab` (`kind: "ssh-terminal"`).
- **Interactive Connection Lifecycle:** 
  - When opening an SSH tab, a branded `LoadingScreen` is shown instead of a blank terminal.
  - If authentication fails (wrong password, missing key, 2FA required), the `LoadingScreen` transforms into an inline input form. Submitted credentials update the Keychain automatically.
  - **`known_hosts` Security:** Rust MUST validate the server's fingerprint against `~/.ssh/known_hosts`. Mismatches pause the connection and show a security warning prompt in the UI to prevent MITM attacks.
- **Rendering:** Once connected, it pipes the SSH channel into the *existing* Terax `xterm.js` wrapper. Window resizes must trigger SSH window-change packets via IPC to prevent text wrapping artifacts.

### 3.4 SFTP File Manager (The USP)
- **Tab Integration:** Add `SftpTab` (`kind: "sftp"`).
- **Layout:** Resizable split-pane (using shadcn `ResizablePanelGroup`). Left side: Local, Right side: Remote. The divider is proportionally draggable.
- **List View:** High-density virtualized lists (`@tanstack/react-virtual`). Required to handle 10,000+ files without DOM lag. Columns: Name, Date Modified, Size, Type.
- **Toolbar:** Each pane has an editable path breadcrumb/input, a local in-memory filter search bar, and action icons.
- **Interactions:**
  - Drag and drop between panes (Local ↔ Remote).
  - Bulk actions (Shift+Click, Cmd+Click).
  - Right-click context menu: Rename, Delete, Chmod (Permissions), Copy Path.
- **"Open Terminal Here":** A button in the SFTP toolbar that opens a new SSH Terminal tab, automatically `cd`'d into the current remote directory.

### 3.5 Global Transfer Queue
- **Background Execution:** Handled entirely by a Rust `tokio` background task. Transfers continue even if the specific SFTP tab is closed.
- **UI Tracking:** A dropdown menu in the global titlebar shows active jobs, transfer speeds, progress bars, and pause/cancel controls.
- **Conflict Resolution:** If a file exists, the transfer pauses and a modal prompts: "Overwrite, Skip, or Rename?".

### 3.6 Remote In-App Editing (CodeMirror Synergy)
- **Concept:** Leverage the existing Terax CodeMirror editor to edit remote files seamlessly.
- **Workflow:** 
  1. User right-clicks a file in the SFTP pane and selects "Edit".
  2. Rust downloads the file to `/tmp/nexum_edits/<uuid>_<filename>`.
  3. React opens an `EditorTab` (existing Terax component) mapped to this temp file.
  4. When the user hits `Cmd+S`, the editor saves the temp file. Rust detects this save and **automatically uploads** the file back via SFTP to the remote server.
- **Safety Limits:** Refuse to open binary files or files > 5MB in the editor.

### 3.7 Retaining the AI & Sidebar
- **Local File Explorer & AI Panel:** Ensure the existing Terax AI side-panel and Local Explorer sidebar (`src/modules/explorer`) remain fully functional and visually cohesive with the new Nexum tabs.

---

## 4. Key UX & Interaction Rules
- **Non-Destructive Tab Switching:** Just like in Terax, switching away from an SSH or SFTP tab must NOT unmount it. It must be hidden via `invisible pointer-events-none` so the underlying PTY/SSH connection doesn't drop.
- **Keyboard First:** Honor the existing Terax global shortcut manager (`src/modules/shortcuts/`).
- **Styling Consistency:** Always use Tailwind classes mapped to CSS variables (e.g., `bg-background`, `text-muted-foreground`). Do not introduce arbitrary HEX colors.

## 5. Technical Heuristics for AI Coding Agents
*CRITICAL: If you are an AI Code Agent reading this document, adhere to these strict rules during implementation:*

1. **Follow the Module Structure:** Place new features into `src/modules/hosts/` and `src/modules/sftp/`. Do not pollute the existing modules unless extending their functionality (like adding tab types to `src/modules/tabs/`).
2. **No Node APIs:** Since this is a Tauri app, NEVER import Node.js native modules in the frontend. All OS interactions go through Tauri IPC.
3. **No Blocking Rust Commands:** SFTP listings and SQLite queries must not freeze the UI. Use `tokio::task::spawn_blocking` or async commands for all heavy lifting.
