# Nexum — CLAUDE.md
**AI Developer Guidelines & Project Reference**

## Session START Protocol
Whenever a new conversation/session starts, you MUST:
1. Read `handshake.md` to understand exactly where the last session left off.
2. Check `tasks/README.md` to identify the current `in_progress` task.
3. Read the specific active `tasks/TASK_*.md` file before writing any code.
4. Briefly summarize to the user what you are going to do next based on this state.

## Quick Context Links
Before working on any area, read the relevant context file:
- **Architecture & Rules** → [`context.md`](./context.md) — Strict coding heuristics, IPC rules, no-Node.js rule, non-blocking architecture
- **Product Requirements** → [`prd.md`](./prd.md) — Feature requirements, UX philosophy, out-of-scope items
- **Implementation Plan** → [`plan-overview.md`](./plan-overview.md) — All phases with detailed work instructions
- **SSH/SFTP Architecture** → [`sftp_ssh_context.md`](./sftp_ssh_context.md) — Connection lifecycle, PTY, transfer manager IPC contracts
- **Host Manager UI** → [`hosts_manager_context.md`](./hosts_manager_context.md) — Master-Detail layout, TitleBar dropdown, Inspector pane, Zustand store shape
- **Host Manager Overhaul** → [`host_manager_overhaul_context.md`](./host_manager_overhaul_context.md) — Full implementation reference: new data model, IPC contracts, HostFormPanel tabs, dnd-kit reorder, multi-select, context menu, loading fix, future work

## Architecture Summary
```
Nexum (Tauri v2)
├── Frontend: React 19 + TypeScript + Vite
│   ├── Tailwind CSS v4 + shadcn/ui (config in src/styles/globals.css, NO tailwind.config.ts)
│   ├── Zustand (global state: tabs, transfers, hosts)
│   ├── xterm.js + WebGL addon (terminal)
│   └── @tanstack/react-virtual (SFTP file lists)
└── Backend: Rust (Tokio async)
    ├── portable-pty → local terminal sessions
    ├── rusqlite (bundled) → host/group storage (SQLite at app_local_data_dir)
    ├── keyring → passwords in macOS Keychain (NEVER store passwords in SQLite)
    ├── ssh2 → SSH + SFTP protocol
    └── tokio mpsc → background transfer queue worker
```

## New Module Locations
- `src/modules/hosts/` — Home Dashboard, HostInspector, Zustand hostsStore
- `src/modules/sftp/` — SftpPane, VirtualizedFileList, transferStore
- `src-tauri/src/modules/hosts/` — SQLite CRUD commands
- `src-tauri/src/modules/ssh/` — SSH connect, PTY, SFTP backend
- `src-tauri/src/modules/sftp/` — Transfer worker

## Critical Rules (NEVER Violate)
1. **No Node.js in frontend** — All system calls via `invoke()` / Tauri events only
2. **No hardcoded colors** — Always use semantic Tailwind vars: `bg-background`, `text-foreground`, `bg-accent`
3. **No blocking Rust commands** — Use `async` or `tokio::spawn` for all I/O
4. **No `unwrap()` on predictable errors** — Return `Result<T, String>` with descriptive messages
5. **Global state in Zustand** — Never use React context for volatile data (transfer progress, tabs)
6. **No hardcoded HEX values** — Theme engine provides all colors via CSS variables
7. **Verify before completing:** NEVER mark a task as `completed` unless you have run `cargo check` (for Rust) or `npx tsc --noEmit` (for TypeScript) to verify that your changes actually compile without breaking the build.


## Task Tracking
All implementation tasks live in [`tasks/`](./tasks/). Each task file contains:
- Status (not_started / in_progress / completed)
- Detailed work instructions
- Files to create/modify
- Expected outcome

**Current Phase: 2 — Database & Host Management**
Next task: [`tasks/TASK_02_1_sqlite_backend.md`](./tasks/TASK_02_1_sqlite_backend.md)

Full task registry: [`tasks/README.md`](./tasks/README.md)

## Session End Protocol
At the end of every session you MUST:
1. **Update task statuses** in the relevant `tasks/TASK_*.md` files
2. **Write/update memory files** in `~/.claude/projects/.../memory/` for progress, bugs fixed, decisions made
3. **Update `handshake.md`** with: what was done, current state, what's next, any blockers
4. **Commit all changes** with a descriptive conventional commit message
5. **Self-optimize**: Add a bug memory entry for any error encountered to prevent repeating it

## Task Transition Protocol
When you finish all work instructions in a `tasks/TASK_*.md` file, you MUST immediately:
1. Update the status in the task file to `completed`.
2. Update the status in `tasks/README.md` to `completed`.
3. Change the status of the NEXT logical task to `in_progress`.
4. Create a Git Commit using conventional commits referencing the task (e.g., `feat(sftp): implement FileList virtual scroll (Task 06.1)`).
5. Update `handshake.md` with the new state.

## Language Protocol
- **Code, Comments, Commits & Documentation:** ALWAYS in English.

## Bug & Error Memory Rule
If you encounter a build error, unexpected behavior, or have to debug something non-obvious:
→ Write a memory entry in `~/.claude/projects/.../memory/bugs_and_fixes.md`
→ Include: what failed, why it failed, how it was fixed

## IPC Contract Quick Reference
See [`sftp_ssh_context.md`](./sftp_ssh_context.md) Section 6 for the full list.

**Key Rust commands:** `hosts_get_all`, `hosts_create`, `hosts_update`, `hosts_delete`, `groups_get_all`, `groups_create`, `groups_delete`, `ssh_connect`, `ssh_disconnect`, `ssh_pty_write`, `ssh_pty_resize`, `sftp_read_dir`, `sftp_rename`, `sftp_delete`, `sftp_mkdir`, `sftp_chmod`, `enqueue_transfer`, `cancel_transfer`, `resolve_conflict`, `prepare_remote_edit`, `save_remote_edit`

**Key Tauri events (Rust → React):** `transfer_progress`, `file_conflict`, `ssh_pty_output` `{tab_id, data}`, `auth_required` `{tab_id, prompt_message, is_2fa}`, `session_established` `{tab_id}`, `known_hosts_warning` `{tab_id, fingerprint, host, is_mismatch}`

## Project

**Nexum** — macOS-native remote workspace (hard-fork of "Terax"). Tauri 2 + Rust backend, React 19 + TypeScript + xterm.js (webgl) client, BYOK AI via Vercel AI SDK.

Bundle id: `com.nexum.app`. Package manager: **pnpm**.

Type-check the frontend without bundling: `pnpm exec tsc --noEmit`.
Rust checks: `cd src-tauri && cargo check` / `cargo clippy`.

## Architecture

### Two-process model

**Rust (`src-tauri/`)** owns all OS access. Frontend never touches the FS, processes, or shells directly — everything goes through `invoke()` calls to commands registered in `src-tauri/src/lib.rs`:

- `pty::pty_open / pty_write / pty_resize / pty_close` — long-lived interactive PTY sessions (xterm <-> portable-pty), managed by `PtyState` (an `RwLock<HashMap<id, Session>>`). Output is streamed back via a Tauri `Channel<PtyEvent>`.
- `fs::tree::*`, `fs::file::*`, `fs::mutate::*` — file explorer + editor IO.
- `shell::shell_run_command` — **one-shot** subshell exec used by the AI's `run_command` tool. Distinct from PTY sessions; not the user's interactive terminal.

PTY shells are bootstrapped via injected init scripts in `src-tauri/src/modules/pty/scripts/` (`zshrc.zsh`, `bashrc.bash`, …) — these wire up OSC sequences for cwd reporting / shell integration.

**Frontend (`src/`)** is a single-window React app. Path alias `@/*` → `src/*`.

### Module layout (`src/modules/`)

Each module is self-contained, exports a thin barrel via `index.ts`, and owns its hooks under `lib/`. The shell of `App.tsx` wires modules together — it should stay a coordinator, not a feature host.

- **terminal/** — `TerminalStack` keeps one mounted xterm instance per tab (via `useTerminalSession` + `pty-bridge`). `osc-handlers.ts` parses shell-integration OSC codes (cwd updates, etc.). Tabs are not unmounted on switch — they're hidden via `invisible pointer-events-none` so PTYs keep streaming in the background.
- **editor/** — CodeMirror 6 stack (`EditorStack` mirrors `TerminalStack`). `extensions.ts` and `languageResolver.ts` configure language modes + themes.
- **explorer/** — file tree (Material Icons via `material-icon-theme` resolved in `iconResolver.ts`), context actions, inline rename input.
- **tabs/** — `useTabs` is the source of truth for tab list + active id. Tabs are tagged-union `{ kind: "terminal" | "editor" | "preview" | "ai-diff" | "home" | "ssh-terminal" | "sftp", … }`. `useWorkspaceCwd` derives the explorer root and inherited cwd for new tabs.
- **header/** — top bar + inline search (`SearchInline` adapts to terminal vs editor via `SearchTarget`).
- **statusbar/** — bottom bar, cwd breadcrumb, AI tools indicator.
- **shortcuts/** — keymap registry (`shortcuts.ts`) + `useGlobalShortcuts` hook. Handlers live in `App.tsx` and are passed in by id (`tab.new`, `ai.toggle`, …).
- **theme/** — `next-themes` provider.
- **ai/** — see below.

### AI subsystem (`src/modules/ai/`)

BYOK. Currently OpenAI-only via `@ai-sdk/openai`; default model in `config.ts` (`DEFAULT_MODEL_ID`). When adding providers, branch in `lib/agent.ts` and keep the `Agent` / `DirectChatTransport` shape — the rest of the system depends on AI SDK v6 chat semantics.

- **Key storage**: OS keychain via `keyring`. Service/account constants in `config.ts` (`KEYRING_SERVICE = "nexum-ai"`). Never persist keys to disk, settings store, or `localStorage`.
- **Agent**: `lib/agent.ts` builds a `Experimental_Agent` with `stopWhen: stepCountIs(MAX_AGENT_STEPS)` and the system prompt from `config.ts`.
- **Sessions** (`lib/sessions.ts` + `store/chatStore.ts`): conversations are organized into named sessions, persisted via `tauri-plugin-store` at `terax-ai-sessions.json` (list + `activeId` + per-session `messages:<id>` keys). `chatStore.ts` keeps a module-scoped `Map<sessionId, Chat<UIMessage>>`; `getOrCreateChat(apiKey, sessionId)` lazily constructs a `Chat`, seeded with persisted messages from a hydration map populated by `hydrateSessions()` (called once from `App.tsx`). `AgentRunBridge` mirrors the active session's messages back to disk on every change and auto-derives the title from the first user message. Switching the API key wipes the chat map; sessions persist. Session UI (switch / new / delete) lives in `AiMiniWindow`'s header.
- **Composer** (`lib/composer.tsx`): a React context providing the shared input state (text, attachments, voice) for both the docked `AiInputBar` and any other surface. Attachments include image, text-file, and `selection` kinds — selections come from `useChatStore.attachSelection(text, source)` (drained into chips, not pasted into the textarea) and are wrapped as `<selection source="terminal|editor">…</selection>` blocks at submit. Composer doesn't run `useChat` itself — it derives `isBusy` from `agentMeta.status` so it can mount safely before sessions hydrate.
- **Live context bridge**: `App.tsx` calls `setLive({ getCwd, getTerminalContext, … })` so tools can read the *currently active* terminal's cwd + last 300 lines of buffer. Keep this lazy — don't pre-snapshot, the active tab changes.
- **Tools** (`tools/tools.ts`): `read_file`, `list_directory` auto-execute; `write_file`, `create_directory`, `run_command` set `needsApproval: true` and the AI SDK pauses for an in-UI confirmation card. `lib/security.ts` is a deny-list that refuses obvious secret paths (`.env*`, `.ssh/`, credentials) — apply it on **both** read and write paths and don't bypass it. Auto-send after approval response uses `lastAssistantMessageIsCompleteWithApprovalResponses`.

### UI conventions

- **shadcn/ui** is configured (`components.json`, style `radix-luma`, base `mist`, icon lib **hugeicons**). Generated primitives live in `src/components/ui/` — don't hand-edit them; re-run `pnpm dlx shadcn add` if a primitive needs an upgrade.
- **AI Elements** (AI Vercel SDK) live in `src/components/ai-elements/` and come from the `@ai-elements` registry declared in `components.json`. Same rule: regenerate, don't hand-patch — but composition wrappers belong in `modules/ai/components/`.
- Tailwind v4 (no `tailwind.config.*` — config is in `src/App.css` via `@theme`). Use `cn()` from `@/lib/utils` for class merging.
- Animation: `motion` (Framer Motion successor). Resizable layout: `react-resizable-panels`.
- Path imports: always `@/…`, never relative across modules.

### Tauri capabilities

`src-tauri/capabilities/default.json` is the allowlist for plugin APIs available to the webview. New plugins (dialog, keyring, store, opener, os, log are already wired in `lib.rs`) usually need both a `Cargo.toml` dep, a `.plugin(...)` line in `lib.rs`, and a capability entry.
