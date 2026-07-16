# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Labonair — CLAUDE.md
**AI Developer Guidelines & Project Reference**
When implementing complex tasks, use the tasks feature and make yourself plans for the implementation. 

## Commands

| Task | Command |
|---|---|
| Dev (frontend only) | `pnpm dev` |
| Dev (full Tauri app) | `pnpm tauri dev` |
| Build | `pnpm tauri build` |
| TypeScript check | `pnpm check-types` (or `pnpm exec tsc --noEmit`) |
| Lint | `pnpm lint` / `pnpm lint:fix` |
| Format | `pnpm format` / `pnpm format:check` |
| Lint + format (combined) | `pnpm check` |
| Unused exports/deps | `pnpm knip` |
| Frontend tests | `pnpm test` (watch) / `pnpm test:run` / `pnpm test:coverage` |
| Rust check | `cd src-tauri && cargo check` |
| Rust lint | `cd src-tauri && cargo clippy` |
| Rust tests | `cd src-tauri && cargo test` |
| Add shadcn component | `pnpm dlx shadcn add <name>` |

Package manager: **pnpm**. Bundle id: `com.labonair.app`. Test runner: **Vitest** (frontend); `cargo test` (Rust) — see `*.test.ts`/`*.test.tsx` colocated next to source, and `#[cfg(test)]` modules in Rust files.

## Session START Protocol
Whenever a new conversation/session starts, you MUST:
1. Read `handshake.md` (repo root) to understand exactly where the last session left off — this is the authoritative continuity doc (what was done, current branch/PR state, what's next, blockers).
2. Check `git status` / `git log` on the current branch for any in-flight work not yet reflected in `handshake.md`.
3. Briefly summarize to the user what you are going to do next based on this state.

> The original `tasks/TASK_*.md` phase-by-phase workflow (Phases 1–6: rebranding through remote editing) is complete and archived under [`tasks/archive/`](./tasks/archive/) — it is a historical record, not an active tracker. Ongoing work is feature/PR-driven and tracked via `handshake.md` + git history, not a `tasks/` queue.

## Quick Context Links
The user-facing docs under [`docs/`](./docs/) (numbered `NN-topic/` folders, e.g. `04-ssh-terminal/`, `06-sftp-file-manager/`) are the closest thing to living documentation and a good first stop for *feature behavior*. For *contributor-facing* architecture, read:
- **Architecture Overview** → [`docs/19-contributing/architecture-overview.mdx`](./docs/19-contributing/architecture-overview.mdx) — two-process model, Rust module table, critical constraints. Note: still says the SSH backend is `ssh2` — it isn't (see Architecture Summary below); treat that one line as stale.
- **IPC Contract Reference** → [`docs/19-contributing/ipc-contract-reference.mdx`](./docs/19-contributing/ipc-contract-reference.mdx) — command/event tables per feature area (partial, not exhaustive — cross-check against `src-tauri/src/lib.rs`'s `generate_handler!` for the full ~150-command list).
- **Module Structure** → [`docs/19-contributing/module-structure.mdx`](./docs/19-contributing/module-structure.mdx) — frontend module map and conventions (missing `git-graph/` and `source-control/` as of this writing — see Module layout below for the current list).
- **Running & Building** → [`docs/19-contributing/running-and-building.mdx`](./docs/19-contributing/running-and-building.mdx)
- **Command Palette** → [`docs/memory/command_palette_context.md`](./docs/memory/command_palette_context.md) — how to add commands, sub-menus, callbacks, reactive labels

Historical, feature-specific implementation notes (data models, design rationale from when a feature was first built) live archived in [`tasks/archive/`](./tasks/archive/) (`context.md`, `prd.md`, `plan-overview.md`, `sftp_ssh_context.md`, `hosts_manager_context.md`, `host_manager_overhaul_context.md`, `macos_tcp_socket2_context.md`, etc.) — useful for "why was this built this way" archaeology, but not maintained, so verify against current code before trusting specifics.

## Pull Requests
Read `.github/PULL_REQUEST_TEMPLATE.md` and create PRs using that template via the `gh` command. - Add accurat testing infos including expected behavior, edge cases, and regression tests for the changed features.

### PR Creation Workflow (automatic)
When asked to create a PR for current changes, always follow this sequence without asking:
1. **Branch** — if currently on `main`, derive a branch name from the work (e.g. `feat/short-description`) and run `git checkout -b <branch>`.
2. **Commit** — stage and commit all relevant changes with a conventional commit message.
3. **Push** — `git push -u origin <branch>`.
4. **Open PR** — `gh pr create` using the PR template, targeting `main`.

## Architecture Summary
```
Labonair (Tauri v2)
├── Frontend: React 19 + TypeScript + Vite
│   ├── Tailwind CSS v4 + shadcn/ui (config in src/styles/globals.css, NO tailwind.config.ts)
│   ├── Zustand (global state: tabs, transfers, hosts, source control, snippets, providers, ...)
│   ├── xterm.js + WebGL addon (terminal)
│   └── @tanstack/react-virtual (SFTP file lists)
└── Backend: Rust (Tokio async)
    ├── portable-pty → local terminal sessions
    ├── rusqlite (bundled) → host/group/credential/snippet storage (SQLite at app_local_data_dir)
    ├── keyring → passwords + AI provider keys in macOS Keychain (NEVER store secrets in SQLite)
    ├── russh + russh-sftp → SSH + SFTP protocol (migrated off ssh2 on the `russh-migration` branch/PR #127)
    ├── git CLI (shelled out via `std::process::Command`, local and — over an SSH session — remote) → source control
    └── tokio mpsc → background transfer queue worker
```

> **russh migration note**: the SSH backend moved from `ssh2` (blocking, thread-per-session) to `russh`/`russh-sftp` (native async). This changed IPC shapes too — see IPC Contract Quick Reference below. If you see `ssh2` referenced anywhere (docs, old comments), treat it as stale.

## Critical Rules (NEVER Violate)
1. **No Node.js in frontend** — All system calls via `invoke()` / Tauri events only
2. **No hardcoded colors** — Always use semantic Tailwind vars: `bg-background`, `text-foreground`, `bg-accent`
3. **No blocking Rust commands** — Use `async` or `tokio::spawn` for all I/O
4. **No `unwrap()` on predictable errors** — Return `Result<T, String>` with descriptive messages
5. **Global state in Zustand** — Never use React context for volatile data (transfer progress, tabs)
6. **No hardcoded HEX values** — Theme engine provides all colors via CSS variables
7. **Verify before completing:** NEVER mark a task as `completed` unless you have run `cargo check` (for Rust) or `npx tsc --noEmit` (for TypeScript) to verify that your changes actually compile without breaking the build.


## Session End Protocol
At the end of every session you MUST:
1. **Write/update memory files** in `~/.claude/projects/.../memory/` for progress, bugs fixed, decisions made
2. **Update `handshake.md`** with: what was done, current state (branch/PR), what's next, any blockers
3. **Commit all changes** with a descriptive conventional commit message
4. **Self-optimize**: Add a bug memory entry for any error encountered to prevent repeating it

## Language Protocol
- **Code, Comments, Commits & Documentation:** ALWAYS in English.

## Bug & Error Memory Rule
If you encounter a build error, unexpected behavior, or have to debug something non-obvious:
→ Write a memory entry in `~/.claude/projects/.../memory/bugs_and_fixes.md`
→ Include: what failed, why it failed, how it was fixed

## IPC Contract Quick Reference
The full, authoritative command list is the `generate_handler![...]` call in `src-tauri/src/lib.rs` (~150 commands across hosts, groups, credentials, ssh, sftp, snippets, themes, backgrounds, scrollback, git, secrets, fs). `docs/19-contributing/ipc-contract-reference.mdx` covers the common ones per feature area but is not exhaustive — don't assume a command is missing just because it's not documented there.

**Representative Rust commands by area:** `hosts_get_all/create/update/delete/reorder`, `groups_get_all/create/update/delete`, `credentials_get_all/create/update/delete`, `ssh_connect`/`ssh_connect_quick`, `ssh_start_tunnels`/`ssh_stop_tunnels` (jump-host routing), `ssh_exec_command`, `ssh_pty_write`/`ssh_pty_resize`, `sftp_read_dir_page`, `sftp_rename/delete/mkdir/chmod/chown`, `enqueue_transfer`/`cancel_transfer`/`resolve_conflict`, `prepare_remote_edit`/`save_remote_edit`, `snippets_get_all/create/update/delete/reorder`, `snippet_run_local`/`snippet_run_ssh`, `git_get_status/get_diff/commit/push/pull/stash_*` (~40 git commands, local or remote-over-SSH via `GitExecutor`), `themes_get_all`/`theme_import/export/delete`, `backgrounds_list/import/delete`, `scrollback_save/load/cleanup`.

**Key Tauri events (Rust → React), current field names:**
- `transfer_progress`, `file_conflict` — unchanged
- SSH PTY output is **not** a broadcast event anymore — since the russh migration it's delivered via a per-session `Channel<SshPtyEvent>` passed into `ssh_connect`/`ssh_connect_quick` (point-to-point, like local PTY's `Channel<PtyEvent>`). There is no more global `ssh_pty_output` event.
- `session_established` `{session_id, default_path_ssh}`
- `auth_required` `{session_id, prompt_message, is_2fa}`
- `passphrase_required` `{session_id}` — encrypted-key prompt, added during the russh migration
- `known_hosts_warning` `{session_id, fingerprint, host, is_mismatch}`

Field is `session_id`, not `tab_id` — a UI tab can outlive/rebind its underlying SSH session (jump-host reconnects, etc.), so don't conflate the two.

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
- **tabs/** — `useTabs` is the source of truth for tab list + active id. Tabs are a tagged union (see `types.ts`); current `kind`s: `"local" | "ssh"` (terminal, local vs SSH), `"workspace"` (split-pane container), `"editor"`, `"preview"`, `"ai-diff"`, `"home"`, `"sftp"`, `"git-graph"`, `"git-diff"`, `"commit-diff"`. `useWorkspaceCwd` derives the explorer root and inherited cwd for new tabs.
- **header/** — top bar + inline search (`SearchInline` adapts to terminal vs editor via `SearchTarget`).
- **statusbar/** — bottom bar, cwd breadcrumb, AI tools indicator, jump-host/live-connection badges.
- **shortcuts/** — keymap registry (`shortcuts.ts`) + `useGlobalShortcuts` hook. Handlers live in `App.tsx` and are passed in by id (`tab.new`, `ai.toggle`, …).
- **theme/** — `next-themes` provider.
- **command-palette/** — Cmd+K palette; `useCommandRegistry`/`useCommandStore` plus per-domain command hooks (`hooks/use*Commands.ts` — terminal, editor, explorer, sftp, hosts, snippets, source-control, settings, tabs, AI sessions, zoom, layout, system).
- **git-graph/** — commit graph canvas (`GitGraphCanvas`, `graphLayout.ts`, `laneColors.ts`) + commit/diff detail panels. Backed by the Rust `git` module's ~40 `git_*` commands.
- **source-control/** — VS Code-style staging UI (`SourceControlPanel`, `BranchBar`, `StashPanel`, side-by-side `DiffViewer`), `useGitStatus`, AI commit-message generation (`useAiCommitMessage`).
- **snippets/** — reusable command snippets, runnable locally or over SSH (`useSnippetExec`, `snippet_run_local`/`snippet_run_ssh`).
- **session/** — tab/session persistence and restore across app restarts (`capture.ts`, `restore.ts`, `scrollback.ts`, `useSessionLifecycle`).
- **settings/** — settings window, theme store, preferences, background images (`BackgroundImageLayer`).
- **notifications/**, **preview/**, **search/**, **updater/** — toast system, in-app URL preview tab, find-in-buffer widget, auto-update dialog, respectively.
- **ai/** — see below.

### AI subsystem (`src/modules/ai/`)

BYOK, multi-provider. `config.ts` defines `PROVIDERS` (OpenAI, Anthropic, Google, xAI, Cerebras, Groq, LM Studio, OpenAI-compatible, DeepSeek, Mistral, OpenRouter, MLX, Ollama) and `DEFAULT_MODEL_ID`. Users create named `ProviderInstance`s (`store/providersStore.ts`), each with its own keyring-stored key; `lib/agent.ts` branches per-provider (`case "openai": ...`) to build the right AI SDK client, keeping the `Agent` / `DirectChatTransport` shape the rest of the system depends on (AI SDK v6 chat semantics).

- **Key storage**: OS keychain via `keyring`, one entry per provider instance (`lib/keyring.ts` — `getAllKeys`/`getKey`/`setKey`/`clearKey`). Never persist keys to disk, settings store, or `localStorage`.
- **Agent**: `lib/agent.ts` builds a `Experimental_Agent` with `stopWhen: stepCountIs(MAX_AGENT_STEPS)` and the system prompt from `config.ts`. `agents/runSubagent.ts` supports spawning sub-agents on a (possibly different) model.
- **Sessions** (`lib/sessions.ts` + `store/chatStore.ts`): conversations are organized into named sessions, persisted via `tauri-plugin-store` (list + `activeId` + per-session `messages:<id>` keys). `chatStore.ts` keeps a module-scoped `Map<sessionId, Chat<UIMessage>>`; `getOrCreateChat(apiKey, sessionId)` lazily constructs a `Chat`, seeded with persisted messages from a hydration map populated by `hydrateSessions()` (called once from `App.tsx`). `AgentRunBridge` mirrors the active session's messages back to disk on every change and auto-derives the title from the first user message. Switching the active provider/key wipes the chat map; sessions persist. Session UI (switch / new / delete) lives in `AiMiniWindow`'s header.
- **Composer** (`lib/composer.tsx`): a React context providing the shared input state (text, attachments, voice) for both the docked `AiInputBar` and any other surface. Attachments include image, text-file, and `selection` kinds — selections come from `useChatStore.attachSelection(text, source)` (drained into chips, not pasted into the textarea) and are wrapped as `<selection source="terminal|editor">…</selection>` blocks at submit. Composer doesn't run `useChat` itself — it derives `isBusy` from `agentMeta.status` so it can mount safely before sessions hydrate.
- **Live context bridge**: `App.tsx` calls `setLive({ getCwd, getTerminalContext, … })` so tools can read the *currently active* terminal's cwd + last 300 lines of buffer. Keep this lazy — don't pre-snapshot, the active tab changes.
- **Tools** (`tools/`, assembled in `tools.ts`'s `buildTools()`): split by domain — `fs.ts` (`read_file`, `list_directory`), `edit.ts` (`edit`/`multi_edit`, enforce read-before-edit), `search.ts` (`grep`/`glob`), `shell.ts` (`run_command`), `terminal.ts`, `subagent.ts`, `todo.ts`, `claude.ts`. Read-only tools auto-execute; mutating tools (`write_file`, `edit`/`multi_edit`, `create_directory`, `run_command`) set `needsApproval: true` and the AI SDK pauses for an in-UI confirmation card. `lib/security.ts` is a deny-list that refuses obvious secret paths (`.env*`, `.ssh/`, credentials) — apply it on **both** read and write paths and don't bypass it. Auto-send after approval response uses `lastAssistantMessageIsCompleteWithApprovalResponses`.

### UI conventions

- **shadcn/ui** is configured (`components.json`, style `radix-luma`, base `mist`, icon lib **hugeicons**). Generated primitives live in `src/components/ui/` — don't hand-edit them; re-run `pnpm dlx shadcn add` if a primitive needs an upgrade.
- **AI Elements** (AI Vercel SDK) live in `src/components/ai-elements/` and come from the `@ai-elements` registry declared in `components.json`. Same rule: regenerate, don't hand-patch — but composition wrappers belong in `modules/ai/components/`.
- Tailwind v4 (no `tailwind.config.*` — config is in `src/styles/globals.css` via `@theme`). Use `cn()` from `@/lib/utils` for class merging.
- Animation: `motion` (Framer Motion successor). Resizable layout: `react-resizable-panels`.
- Path imports: always `@/…`, never relative across modules.

### Tauri capabilities

`src-tauri/capabilities/default.json` is the allowlist for plugin APIs available to the webview. Plugins already wired in `lib.rs`: `process`, `updater`, `window-state`, `autostart`, `store`, `os`, `log`, `dialog`, `opener`, `drag`. A new plugin usually needs a `Cargo.toml` dep, a `.plugin(...)` line in `lib.rs`, and a capability entry. Note: `keyring` is a plain Rust crate used directly from command handlers (not a Tauri plugin), so it needs no capability entry.

### Adding a new Tauri command

1. Define an `async fn` in the relevant `src-tauri/src/modules/*/` file, annotated with `#[tauri::command]`.
2. Register it in the `.invoke_handler(tauri::generate_handler![..., your_command])` call in `src-tauri/src/lib.rs`.
3. Call it from the frontend via `invoke("your_command", { ...args })`.
4. No capability entry is needed for custom commands (only for plugins).
