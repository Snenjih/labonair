# Nexum: Project Context & AI Developer Guidelines
**Project:** Nexum (macOS native SSH/SFTP Client, Terminal & AI Workspace)
**Base Codebase:** This project is a hard-fork of "Terax" (an AI-native terminal emulator). We are transforming it into "Nexum" by adding powerful Remote (SSH/SFTP) capabilities.
**Role of the AI:** You are an expert Principal Software Engineer specializing in Rust, Tauri v2, React 19, and macOS desktop application architecture.

## 1. Project Identity & Aesthetic
Nexum is a premium, ultra-fast, native-feeling macOS application for developers.
- **Visual Style:** Minimalist, high-density, "Vercel / Zed Editor" aesthetic. Subtle borders, transparent backgrounds, strictly no bloated UI elements.
- **UX Philosophy:** Keyboard-first. Everything should be accessible via shortcuts.
- **Performance:** 60 FPS is mandatory. UI must never freeze, even when transferring 100 GB via SFTP or parsing massive terminal output.
- **The Fork Context:** We inherit Terax's Local Terminal, CodeMirror 6 Editor, File Explorer, and AI side-panel. We are EXTENDING this with SQLite-based Host Management, SSH PTY sessions, and a split-pane SFTP manager.

## 2. Tech Stack Overview
- **Core Framework:** Tauri v2
- **Backend:** Rust (Edition 2021) + Tokio (Async)
- **Frontend:** React 19 (Vite, TypeScript)
- **Styling:** Tailwind CSS **v4** (Note: Config is in `src/styles/globals.css`, NO `tailwind.config.js`) + shadcn/ui.
- **State Management:** Zustand (for global state), React Context/Hooks (for localized state).
- **Terminal UI:** `xterm.js` + `xterm-addon-webgl` + `xterm-addon-fit`.
- **Editor:** CodeMirror 6 (`@uiw/react-codemirror`).
- **Database/Storage:** `rusqlite` (SQLite) for host metadata (NEW), `keyring` for passwords/API keys (Existing).

## 3. The Modular Architecture (Crucial)
The frontend is strictly organized into domain-driven modules inside `src/modules/`.
**Rule:** When building new Nexum features, you MUST follow this pattern. Do not dump everything into a global components folder.
- `src/modules/tabs/`: The global tab state (`useTabs.ts`). Tabs use a discriminated union (`kind: "terminal" | "editor" | ...`).
- `src/modules/terminal/`: Renders xterm.js instances.
- `src/modules/editor/`: Renders CodeMirror instances.
- `src/modules/explorer/`: The local file tree.
- **NEW MODULES TO BUILD:** 
  - `src/modules/hosts/`: For the Home Dashboard and SQLite host management.
  - `src/modules/sftp/`: For the split-pane remote file manager.

## 4. Critical Technical Rules (HEURISTICS)
*If you are an AI generating code for this project, you MUST adhere to the following rules without exception:*

### Rule 4.1: Strict IPC Boundary (The "No Node.js" Rule)
- **Context:** The React frontend runs in a secure WebKit webview. It does NOT have access to Node.js environments.
- **Rule:** NEVER import or use Node.js modules (e.g., `fs`, `child_process`, `os`, `path`) inside the React `.ts`/`.tsx` files.
- **Solution:** All system-level interactions must be done by invoking Rust backend commands using `@tauri-apps/api/core` (e.g., `invoke('command_name', { args })`) or by listening to Tauri events.

### Rule 4.2: Non-Blocking Architecture (Rust)
- **Context:** SFTP transfers or SSH handshakes can take seconds.
- **Rule:** Tauri commands (`#[tauri::command]`) run on the main thread by default. Heavy network/IO operations will freeze the entire Tauri window if not handled correctly.
- **Solution:** All SSH/SFTP I/O MUST execute within an `async` Tauri command (which Tauri automatically routes to a thread pool) or be explicitly spawned via `tokio::spawn`.

### Rule 4.3: Extending the Tab System
- **Context:** Nexum relies heavily on tabs. 
- **Rule:** When adding SSH and SFTP views, extend the `Tab` union in `src/modules/tabs/lib/useTabs.ts`.
- **Example:** Add `SftpTab` (`kind: "sftp"`) and `SshTerminalTab` (`kind: "ssh-terminal"`). Update `App.tsx` to render the correct Stack/Pane based on the active tab's `kind`. Do NOT unmount inactive tabs; hide them using `invisible pointer-events-none` so their PTYs/WebSockets keep streaming in the background (see how `TerminalStack` does it).

### Rule 4.4: Tailwind v4 & Theming
- **Context:** The project uses Tailwind v4. There is no `tailwind.config.ts`.
- **Rule:** NEVER hardcode HEX or RGB values. Always use semantic CSS variables defined in `src/styles/globals.css`.
- **Examples:** `bg-background`, `text-foreground`, `border-border/60`, `bg-accent text-accent-foreground`.

### Rule 4.5: Global State via Zustand
- **Rule:** Do NOT use React Context for highly volatile global state (like active SFTP transfer progress), as it causes whole-tree re-renders.
- **Solution:** Use Zustand. Create `src/modules/sftp/store/transferStore.ts` and subscribe to Tauri events (`transfer_progress`) directly inside the Zustand store module, outside of the React render cycle.

## 5. New Architectural Patterns for Nexum

### 5.1 The "Remote Editor" Synergy
When a user right-clicks a file in the SFTP manager and selects "Edit", we leverage the existing CodeMirror implementation:
1. Rust downloads the remote file to `/tmp/nexum/...`.
2. React opens a new Tab of `kind: "editor"`.
3. When the user presses `Cmd+S`, the editor triggers its save callback. Rust overwrites the local temp file AND automatically uploads it back to the remote server via the active SSH session.

### 5.2 The SFTP Virtualized List
For the remote file browser, never map over an array of files directly into standard HTML table rows if the array is unbounded. You MUST use `@tanstack/react-virtual` to ensure only the visible rows are rendered into the DOM, keeping the app at 60 FPS even with directories containing 10,000+ files.

### 5.3 SSH Passwords & Keychain
Host passwords must NEVER be saved in the SQLite database (`rusqlite`). Save the Host metadata in SQLite with a generated UUID. Use the `keyring` crate to store the actual password in the macOS Keychain, referencing the UUID.
