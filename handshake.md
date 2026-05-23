# Handshake — Session State

## Last Session: 2026-05-24 (Editor Feature Expansion)

### What Was Done
Added **5 editor improvements** (committed `632e736`). `tsc --noEmit` ✅

**Feature 1 — Cursor Position in StatusBar**
- New `editorShowCursorPosition: boolean` preference (default: true)
- New `src/modules/editor/lib/cursorStore.ts` — Zustand micro-store `{line, col, selectionChars, selectionLines}`
- `EditorPane` now accepts `isActive` prop; `EditorView.updateListener` writes to cursorStore only when active
- `EditorStack` passes `isActive={visible}` to each EditorPane
- `StatusBar` reads cursorStore → shows `Ln X, Col Y` when editor tab is active

**Feature 3 — More Languages**
- Installed: `@codemirror/lang-go`, `@codemirror/lang-java`, `@codemirror/lang-sql`, `@codemirror/lang-php`, `@codemirror/lang-xml`
- Added to `languageResolver.ts`: go, java, sql, php, xml, svg, rb (ruby), swift, kt/kts (kotlin via legacy-modes/clike)

**Feature 5 — Prettier Formatting**
- Installed: `prettier@3.8.3`
- New `src/modules/editor/lib/formatter.ts` — dynamic Prettier standalone with per-extension plugin loading
- New `editorFormatOnSave: boolean` preference (default: false)
- `Cmd+Shift+F` → format now; `Cmd+S` runs format first if pref enabled
- Gear dropdown: "Format on Save" toggle
- Settings → Editor: "Format on Save" row in Behaviour group

**Feature 6 — Selection Stats**
- New `editorShowSelectionStats: boolean` preference (default: true)
- Toolbar shows `N chars · M lines` when text is selected and pref enabled
- Gear dropdown: "Selection Stats" toggle
- Settings → Editor: "Selection Stats" row in Display group

**Feature 7 — Document Outline**
- New `editorShowOutline: boolean` preference (default: false)
- New `src/modules/editor/lib/outline.ts` — walks CodeMirror syntaxTree, extracts Markdown headings + code declarations
- New `src/modules/editor/OutlinePanel.tsx` — clickable outline sidebar (resizable, right side)
- Outline updates on every doc change (debounced 250ms)
- Gear dropdown: "Outline" toggle
- Settings → Editor: "Outline panel" row in Display group

---

## Previous Session: 2026-05-23 (Settings Expansion)

### What Was Done
Added **13 new user-configurable settings** across Terminal, General, Security, and AI (committed `ca3dd9e`). All settings persist via `tauri-plugin-store`. `tsc --noEmit` ✅

**Terminal (5 settings) — `TerminalSection.tsx`, `useTerminalSession.ts`, `SshTerminalPane.tsx`**
- Copy on select — implemented via `onSelectionChange` + `navigator.clipboard` (xterm v6 removed the native option)
- Right-click pastes — `rightClickSelectsWord: !pref`
- Word separators — `wordSeparator` option
- Scroll sensitivity — `scrollSensitivity` option
- Fast scroll modifier — `fastScrollModifier` via type-cast (runtime option in xterm v6, not in public types)

**General (4 settings) — `App.tsx`, `GeneralSection.tsx`**
- Reduce motion — wraps entire app in `<MotionConfig reducedMotion="always">` (no per-file changes needed)
- New tab inherits cwd — toggle in `openNewTab` callback
- Confirm before closing terminal tab — `AlertDialog` via `pendingCloseTabId` state
- Confirm quit with active SSH — `window.confirm()` inside the existing `onCloseRequested` handler (merged with sessionRestore logic)

**Security (1 setting) — `security.ts`, `AiToolApproval.tsx`, `AiSection.tsx`**
- Warn on destructive commands — new `checkDestructiveCommand()` function with DESTRUCTIVE_PATTERNS; amber warning badge appears in the approval card header when matched

**AI (3 settings) — `agent.ts`, `transport.ts`, `chatStore.ts`, `AiSection.tsx`**
- Max agent steps — `maxAgentSteps` param in `createNexumAgent`, default falls back to `MAX_AGENT_STEPS` constant
- Temperature — `model.withSettings({ temperature })` via runtime cast (type `withSettings` absent from `LanguageModel` union)
- Terminal context lines — `getTerminalContextLines` dep in `createContextAwareTransport`, replaces hard-coded `TERMINAL_BUFFER_LINES`

**Store boilerplate** — `store.ts` updated in all 6 places (type, KEY constant, default, loadPreferences, setter, onPreferencesChange map)

---

## Previous Session: 2026-05-23 (V1.1 Architecture Hardening)

### What Was Done
Completed **V1.1 Architecture Hardening** (all 3 phases, committed `752da0f`):

**Phase 1 — Structured Error Handling (thiserror)**
- Added `thiserror = "1"` to `Cargo.toml`
- Created `src-tauri/src/modules/errors.rs` with `NexumError` enum (AuthFailed, NetworkError, HostKeyMismatch, IoError, Internal) + `Serialize` + `From` impls for `ssh2::Error`, `std::io::Error`, `rusqlite::Error`
- `ssh_connect` and all `sftp_*` commands now return `Result<T, NexumError>` — frontend can distinguish error types programmatically
- Created `src/types.ts` with `NexumError` type + `isNexumError` guard
- Updated `SshLoadingScreen.tsx` and `sftpStore.ts` catch blocks to handle structured errors

**Phase 2 — SFTP Mutex Decoupling**
- Created `sftp/state.rs` — `SftpState` / `SftpSession` (hold own SSH session + SFTP handle)
- Created `sftp/connection.rs` — `sftp_connect` / `sftp_disconnect` commands
- Extracted `establish_authenticated_session()` from `client.rs` — shared by both PTY and SFTP connections; emits all the same events
- All `sftp_*` file-op commands now use `SftpState` instead of `SshState`
- Transfer worker (`worker.rs`) updated to use `SftpState` — SFTP I/O no longer blocks the PTY mutex
- Removed `sftp` field from `SshSession` (now fully decoupled)
- `SshLoadingScreen.tsx` branches `sftp_connect` vs `ssh_connect` by `connectionType`
- `SftpPane.tsx` calls `sftp_disconnect` on unmount

**Phase 3 — Connection Lost Detection & Reconnect Overlay**
- `pty.rs` reader thread tracks `disconnect_reason`; emits `ssh_connection_lost` event on unexpected exits (not on clean `ssh_disconnect`)
- `SshTerminalPane.tsx`: added `isDisconnected` + `disconnectReason` state, `ssh_connection_lost` listener
- Glassmorphism overlay (`bg-background/50 backdrop-blur-sm`) with reason text + Reconnect button
- `handleReconnect`: disposes terminal, resets state → `SshLoadingScreen` re-mounts for fresh connection

**Verification**: `cargo check` ✅ · `tsc --noEmit` ✅

---

## Previous Session: 2026-05-18

See `handshake.md` git history for full details of the Terminal Split Panes feature.

---

### Current State
- 13 new settings implemented and committed (`ca3dd9e`)
- `tsc --noEmit` ✅
- No Rust changes in this session — `cargo check` not needed

### What's Next
- The GitHub repo `Snenjih/nexum-themes` still needs to be created for community themes
- (Optional) SSH Agent Forwarding — excluded this session, requires Rust change to `ssh_connect` + `channel.request_agent_forwarding()`
- (Optional) Add pane navigation shortcuts (⌘← / ⌘→ to cycle active pane)
- (Optional) Persist split layout across app restarts
- (Optional) Auto-reconnect with exponential backoff on the reconnect overlay

### Blockers
- None
