# Handshake — Session State

## Last Session: 2026-05-23

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
- All V1.1 hardening work complete and committed
- `cargo check` ✅ · `tsc --noEmit` ✅

### What's Next
- The GitHub repo `Snenjih/nexum-themes` still needs to be created for community themes
- (Optional) Add pane navigation shortcuts (⌘← / ⌘→ to cycle active pane)
- (Optional) Persist split layout across app restarts
- (Optional) Auto-reconnect with exponential backoff on the reconnect overlay

### Blockers
- None
