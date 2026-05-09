# Handshake — Session State

## Last Session: 2026-05-09

### What Was Done
- Completed **TASK_01_1 — Rebranding & Project Configuration**
  - Renamed all `terax` → `nexum` references across frontend and backend
  - Updated `package.json`, `index.html`, `settings.html`
  - Updated `tauri.conf.json`: productName, identifier, window title, longDescription
  - Updated `Cargo.toml`: package name → `nexum`, lib name → `nexum_lib`
  - Updated `main.rs`: entry call → `nexum_lib::run()`
  - Updated `AboutSection.tsx`: name, bundle ID, repo/website URLs
  - Updated `ai/config.ts`: KEYRING_SERVICE → `nexum-ai`, SYSTEM_PROMPT persona
  - Updated `ThemeProvider.tsx`, `index.html`, `settings.html`: localStorage key → `nexum-ui-theme-shadow`
  - Updated `composer.tsx` + `App.tsx`: custom event → `nexum:ai-attach-file`
  - `cargo check` ✅ | `tsc --noEmit` ✅

- Completed **TASK_01_2 — Tab System Extension & Home View Setup**
  - Extended Tab union with `HomeTab`, `SshTerminalTab`, `SftpTab`
  - App boots into "Home" tab by default
  - TabBar renders correct icons for new tab kinds
  - App.tsx has placeholder stacks for home/ssh/sftp with `invisible pointer-events-none` pattern

- **Project Planning & Architecture Setup**
  - Created complete task registry for Phases 2-6 (9 new task files)
  - Updated `tasks/README.md` with all phases (TASK_02_1 through TASK_06_1)
  - Updated `CLAUDE.md`: corrected bundle ID, React version, module locations, IPC contracts, current phase pointer

### Current State
- **Phase 1 complete** — both TASK_01_1 and TASK_01_2 done, `tsc --noEmit` clean.
- **Full task plan in place** — 9 tasks across Phases 2-6 created in `tasks/`
- App boots to "Home" tab with placeholder. Tab union ready for new views.

### What's Next
- **TASK_02_1** — SQLite Integration (Backend)
  - Add `rusqlite` + `uuid` to Cargo.toml
  - Create `src-tauri/src/modules/hosts/` with db.rs + mod.rs
  - Implement CRUD Tauri commands + register in lib.rs
  - Passwords stored in keychain via keyring, NEVER in SQLite

### Blockers
None.
