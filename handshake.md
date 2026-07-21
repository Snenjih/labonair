# Handshake — Session State

## Last Session: 2026-07-21 (MCP Bridge — external local agents drive granted SSH tabs)

### What Was Done
User wants their locally-installed Claude Code CLI (or any MCP-capable agent) to be able to drive an already-open SSH tab in the app — run commands visibly in the real pane the user is watching, read output, open/close tabs — via one MCP server added once to Claude Code, not per-tab. Used plan mode: 2 parallel Explore agents mapped the existing AI-tool/terminal architecture and the russh SSH/PTY session lifecycle, confirmed via direct file reads (OSC133 shell-integration scripts, `tabsStore.ts`, `ssh/client.rs`/`pty.rs`, `secrets.rs`, settings/statusbar patterns). User picked: **external MCP bridge** (not extending the in-app BYOK assistant) + **per-tab opt-in consent** (default off). A second round added tab-lifecycle tools (open/close) and asked for edge cases; plan updated and approved. Plan saved at `~/.claude/plans/schau-dir-den-n-tigen-deep-lake.md`.

Implemented on branch `mcp-additions` (accidentally created+checked-out by an Explore agent mid-research that ran an unauthorized `git checkout -b`; harmless since it was empty/identical to `main` at the time, and a reasonable branch name for this work anyway, so kept as-is rather than reverted).

**Rust (`src-tauri/src/modules/mcp/`, new module):**
- `server.rs` — `LabonairMcpServer` via the `rmcp` crate (official Rust MCP SDK, v2.2.0) exposing 6 tools over **Streamable HTTP** (`axum` + `rmcp`'s `StreamableHttpService`, bearer-token-gated via an `axum::middleware::from_fn` layer, bound to `127.0.0.1:47823` only): `list_sessions`, `run_command`, `read_output`, `send_keys`, `open_tab`, `close_tab`.
- `osc133.rs` — a `vte`-based (the alacritty-project ANSI/VTE parser crate) streaming parser (`Osc133Capture`) that strips CSI/color escapes from captured output and detects the OSC 133 `D;<exit_code>` marker the existing shell-integration bootstrap (`ssh/shell_integration.rs`, `pty/scripts/{zshrc.zsh,bashrc.bash}`) already emits — this is how `run_command` knows a command finished and what its exit code was. 5 unit tests (chunk-boundary-split marker, bare-D, CSI-stripping, etc.).
- **Output-capture tap**: `RushSession` (`ssh/mod.rs`) gained a `agent_tap: broadcast::Sender<String>` field, fed alongside the existing per-session `Channel<SshPtyEvent>` in `pty.rs`'s `spawn_reader` — lets `run_command`/`read_output` subscribe to the *same* bytes the visible xterm pane renders, without touching the single-consumer UI channel. Both `RushSession` construction sites (`ssh/client.rs`, `sftp/connection.rs`) updated for the new field.
- **Tab lifecycle bridge**: `open_tab`/`close_tab` can't touch frontend Zustand state directly, so they emit `mcp_open_tab_request`/`mcp_close_tab_request` events and await a `tokio::oneshot` — exactly the same request/response shape as the existing `TrustState`/`wait_for_trust` host-key-confirmation flow, just reused for a new purpose. `open_tab` also mirrors `ssh_connect`'s credential-resolution logic to refuse hosts that would need an interactive passphrase/2FA prompt nobody could answer.
- Grants (`McpState.grants`) are keyed by **`tab_id`**, not `session_id` — a tab's underlying SSH session can rebind on reconnect while the tab persists (per existing CLAUDE.md note), so `session_established` re-pushes the grant under the same `tab_id`.
- New Tauri commands: `mcp_get_status`, `mcp_set_enabled`, `mcp_regenerate_token`, `mcp_set_session_grant`, `mcp_tab_op_response`. Bearer token generated on first enable, stored via the existing `secrets.rs` store (never SQLite), not a new `keyring`-crate dependency (this codebase's "keyring" is actually its own AES-GCM file-backed store).
- New Cargo deps: `rmcp` (features: server, macros, transport-streamable-http-server), `axum`, `vte`, `schemars` (schemars needed as a *direct* dependency even though re-exported via `rmcp::schemars` — its derive macro emits `::schemars::…` paths that require the real crate name resolvable, not just a re-export path).

**Frontend:**
- `src/modules/tabs/store/agentAccessStore.ts` — new small Zustand store (mirrors `useConnectionStatusStore`'s pattern) + `setAgentAccessGrant()` helper that pushes to Rust and mirrors locally.
- `TabBar.tsx` — new "Grant AI Agent Access" `ContextMenuCheckboxItem` on SSH-backed workspace tabs.
- `src/modules/header/components/AgentAccessBadge.tsx` — new header badge (mirrors `JumpHostDropdown`'s popover/pill layout) listing granted tabs with per-tab revoke, hidden entirely when nothing's granted.
- `src/modules/tabs/lib/useMcpTabBridge.ts` — mounted once in `App.tsx` (alongside `useAiLiveBridge`), listens for the Rust-emitted tab-lifecycle request events and drives the real `useTabsStore` actions (`newSshTab`/`closeTab`), auto-granting agent-opened tabs.
- `tabsStore.ts`'s `closeTab` now also revokes any MCP grant for the closed tab (both locally and via Rust) so `list_sessions` never points at a dead tab.
- `settings/sections/ConnectionsSection.tsx` — new "AI Agent Bridge (MCP)" subsection: enable toggle, generated setup command (`claude mcp add --transport http …`) with copy button, regenerate-token button. State lives in Rust (`McpState`), fetched via `mcp_get_status` on mount — not the usual `usePreferencesStore`, since it also owns a live network listener + secret.

### Verification done
`cargo check`/`cargo clippy` (clean, 0 warnings) · `cargo build` (full debug build, links cleanly) · `cargo test --lib modules::mcp::` (5/5 new OSC133 tests pass) · `pnpm exec tsc --noEmit` (clean) · `pnpm lint` (0 new warnings — the 345 pre-existing warnings are all in untouched files) · `pnpm test:run` (406/406 tests pass; the 12 "failed" test *files* are a pre-existing `window.matchMedia is not a function` jsdom-setup gap, confirmed identical via `git stash` on a clean tree before this session's changes).

**Not done / needs manual testing** — launching the actual GUI (`pnpm tauri dev`) was blocked by the sandbox's auto-mode classifier (a long-running interactive process), so none of the following has been live-tested yet:
- The Settings toggle/copy-button/badge/context-menu-item actually rendering and working in the real app.
- A real `claude mcp add --transport http …` connection from an actual local Claude Code CLI, followed by `list_sessions`/`run_command`/`read_output`/`send_keys`/`open_tab`/`close_tab` against a real SSH host.
- Whether `run_command`'s OSC133 exit-code capture actually fires correctly end-to-end over a live SSH session (only unit-tested against synthetic byte streams, not a real shell).

Committed `f529f77` (initial bridge), then a same-day settings/UX rework `c0accb1` (global enable toggle now actually revokes+hides everything when off, persisted `mcpBridgeEnabled`, README + `docs/10-ai-assistant/mcp-agent-bridge.mdx`).

### Follow-up (same day, plan-mode round 2 — commit `dc052ed`)
User asked for 4 more things after live-testing the toggle: settings (port/max-timeout/auto-revoke), a per-host block-list, notifications (2 separate mechanisms), and full local-terminal parity. Re-entered plan mode (2 more Explore agents: local PTY architecture, hosts schema + inspector UI), plan overwritten (not a continuation) at the same plan file path, approved, implemented:

- **Settings**: `McpState.port`/`max_command_timeout_ms`/`auto_revoke_minutes` are now runtime-mutable atomics with their own commands (`mcp_set_port` restarts the listener live if enabled; `mcp_set_max_command_timeout_secs` clamps `run_command`'s requested timeout; `mcp_set_auto_revoke_minutes` feeds a new background sweep task, `spawn_auto_revoke_sweeper`, spawned once in `lib.rs`'s `.setup()`). All three (plus `enabled`) get pushed from persisted preferences to Rust on every change via `useMcpTabBridge.ts` — McpState has zero persistence of its own, so this push is load-bearing, not decorative.
- **Per-host block-list**: `Host.block_agent_access` (new SQLite column, `hosts/db.rs`'s idempotent migration array), toggle in `HostFormPanel.tsx`'s SSH tab ("Agent Access" section). Enforced 3 places: `mcp_set_session_grant` (refuse the grant), live at every `run_command`/`send_keys`/`read_output`/`open_tab` call (`ensure_grant_still_authorized` re-queries the DB, doesn't trust a cached grant), and `hosts_update` sweeps+revokes any already-granted tab immediately if the flag flips to true.
- **Notifications, 2 separate mechanisms** (per explicit user instruction not to conflate them): (a) error wiring via the `integrate-notifications` skill for previously-silent failures in `agentAccessStore.ts`/`useMcpTabBridge.ts`/`ConnectionsSection.tsx` — surfaced a **real bug** in the process: a port-bind failure in `server::ensure_started` left `McpState.enabled` stuck `true` with no listener actually running; now flips back to `false` and emits `mcp_server_error`. (b) a separate opt-in `mcpNotifyOnActivity` preference + new `mcp_activity` Rust event (emitted unconditionally by `run_command`/`send_keys`/`open_tab`/`close_tab`) that the frontend only turns into a notification when the preference is on — deliberately never routed through `handleApiError` since these aren't errors.
- **Local terminal parity** (the highest-risk piece): local PTY (`pty/session.rs`) is thread-based and keyed by numeric `u32`, not the string session id everything else uses. Added `Session.agent_tap: broadcast::Sender<Vec<u8>>` (fed raw pre-base64 bytes) and two new `pub(crate)` seams in `pty/mod.rs` (`write_raw`, `subscribe_agent_tap`) since `Session`'s fields stay module-private. Changed `Osc133Capture::feed` from `&str` to `&[u8]` — `vte::Parser::advance` already repairs split UTF-8 across calls itself, so this removes the need for a separate repair step and works unmodified for both SSH's already-repaired chunks and local's raw ones. Bridged the id gap with a small `terminalSessionRegistry.ts` addition (`setLocalPtyId`/`getLocalPtyId`, populated once `openPty()` resolves in `useTerminalSession.ts`) — `SessionGrant` gained `kind: SessionKind` (`Ssh`/`Local`) + `local_pty_id: Option<u32>`, and `mcp/server.rs`'s action tools dispatch on it. `open_tab` deliberately stays SSH-only (no "host" concept for local shells); `close_tab` needed zero changes (its frontend handler already matched by session id, kind-agnostic).

### Current State
Committed on branch `mcp-additions` (`f529f77`, `c0accb1`, `dc052ed`) — not pushed, no PR yet (user hasn't asked).

### What's Next
- Manual `pnpm tauri dev` pass — still fully unverified end-to-end (sandbox can't launch the GUI): the Settings UI, a real `claude mcp add` connection, granting/using a **local** terminal tab specifically (the riskiest new path), the host block-toggle actually disabling the tab checkbox, and the auto-revoke sweep actually firing after the configured window.
- Consider: rate-limiting/queueing if multiple external MCP clients hit the same session concurrently (still only a per-session `tokio::Mutex`, no cap on total concurrent sessions).
- `read_output` remains a live peek only (no scrollback history before the call) — known v1 simplification, not a bug.

### Blockers
- None — ready for manual verification, then push/PR once the user confirms.

---

## Previous Session: 2026-07-18 (Full App Review + 12-Workstream Fix Pass + Independent Review)

### What Was Done
User asked for a full general review of the app across all feature areas (gaps, edge cases, perf/efficiency issues, features blocking each other) plus a specific audit of Settings-category miscategorization. Ran 6 parallel deep-dive research agents (Settings, SFTP/Explorer, Terminal/PTY/Tabs, AI, Git/Source Control, Hosts/Snippets/Themes) against `main` (post russh-migration + 5 recent SFTP fixes), verified the standout finding personally (`gitStatusPollIntervalMs` mis-tagged under "File Manager" instead of Source Control), and delivered a full report as a published artifact (~35 findings).

User then asked to fix **everything** found, including 3 items originally scoped as "too big for this pass" (Git hunk-level staging, Git submodule support, snippet `${VAR}` placeholders) plus 2 additional requested features (Test Connection button, SSH config export — both with specific UI placement instructions: toolbar dropdown + per-host context menu for export). Used plan mode: 3 parallel Explore agents verified exact current code state for every finding, 1 Plan agent produced a 12-workstream (A–L) dependency-ordered plan, 4 scope decisions were confirmed explicitly with the user via AskUserQuestion (snippet chaining excluded; full porcelain-v2 migration accepted despite being flagged highest-risk; light AI-session-status mitigation over a full data-model change; real `--skip=N` graph pagination over the cheaper hasMore-only fix). Plan saved to `~/.claude/plans/nutze-den-plan-mode-purring-creek.md`.

Implemented on branch `fix/full-app-review-pass` (off `main` at `7e53a3b`), one commit per workstream, each independently verified (`cargo check`/`clippy -D warnings`/`test --lib`, `tsc --noEmit`/`vitest run`) before committing:
- **A** (`414b4e8`) SFTP: two broken IPC calls (`sftp_deep_search`/`sftp_chown` sent `tabId` instead of `sessionId` — both completely non-functional), conflict-cancel race, symlink-dir walk, delete-refresh, local pane pagination (reused existing `fs_read_dir_page`).
- **B** (`ee5cbe0`) SFTP: parallel enqueue (`Promise.allSettled`), sidebar chmod/chown parity (new `FsProvider.chmod/chown` + minimal `ChmodChownDialog.tsx`), new `WorkerMessage::SessionReconnected` + `sftp_session_reconnected` command to requeue in-flight transfers after reconnect.
- **C** (`1a4e253`) Terminal: scrollback truncate-from-front-with-notice (was silently dropped past the size cap, both JS and Rust sides — this workstream's subagent was interrupted by an API spend-limit mid-task but had already written correct, tested logic; only needed 2 stale test-fixture assumptions in newly-added Rust tests fixed, not the migration logic itself), `pane.focusNext` (⌘]), snippet-aware terminal completion.
- **D** (`8044727`) AI: `clearSessionShell` now actually calls `native.shellSessionClose` (was a real resource leak — every AI session using `bash_run` leaked a shell process for the app's lifetime, especially via LRU eviction which never called it at all), LRU eviction now persists a still-streaming background session's messages before stopping it, `setApiKeys`/`setApiKey` no longer reset an unrelated session's status, new shared `deriveRunStatus()` (extracted from `AgentRunBridge`) used by `switchSession` too, `ModelPicker` "no tools" badge.
- **E** (`b59ffd7`) Settings: new "Source Control" category (rendered as a subsection in `FileManagerSection.tsx`, no new sidebar tab), `vimMode` moved General→Editor, dead `showEditPrediction` setting fully deleted, `SearchResults`' `Custom` controlType fixed, ~47 settings added to `SETTING_DEFINITIONS`.
- **F** (`d52ed8c`) Git: new `git_continue` (mirrors `git_abort`'s state-detection), `inSpecialState` now covers cherry-pick (previously showed neither Abort nor Continue), detached-HEAD-safe `current_branch` in `git_get_workspace_state`, per-file binary-diff detection (was global — one binary file hid every other file's diff in a multi-file view), `CommitDiffPanel.tsx` deleted (confirmed dead code), real `--skip=N` graph pagination + `hasMore` off-by-one fix.
- **G** (`8233458`) Hosts: verified via a throwaway SQLite repro that `ON DELETE SET NULL` already works correctly at the DB level (no migration needed) — only added the client-side in-memory patch; active-connection delete warnings (traced every `hostId` lookup site first, found no actual crash risk); soft duplicate-name hint.
- **H** (`334c5ea`) Hosts: new `ssh_test_connection` (reuses the same pre-PTY auth functions `ssh_connect_async` calls, never registers in `SshState`, never auto-trusts an unknown host key) + new `export_ssh_config` (exact reverse of the import parser's field mapping, never exports password-credential secrets) — both placements exactly as the user specified (toolbar dropdown; export also in per-host context menu).
- **I** (`9804b96`) Snippets: **the safety fix** — SSH snippet with a deleted/missing host no longer silently falls back to running locally; "ask at runtime" now has a real host-picker dialog; new `SnippetRunState`/`snippet_run_cancel` for cancelling in-flight runs.
- **J** (`06ccbde`) Git: hunk-level staging via new stdin-piping plumbing in `GitExecutor` (local: `Stdio::piped()` + explicit close before `wait_with_output()`; remote: `channel.data()`+`channel.eof()` strictly before the existing Eof/ExitStatus-ordering-sensitive read loop) + `git apply --cached`. Live-tested against a real temp git repo (new `#[tokio::test]`). Discovered `DiffViewer.tsx` is dead code (not mounted anywhere — `GitDiffPane.tsx` is the real component) — implemented the feature in the real component, noted the dead one as a cleanup candidate.
- **K** (`d4fa7cc`) Git: submodule recognition via full `--porcelain=v1`→`--porcelain=v2` status-parser migration — **the highest-risk change in the whole plan** (rewrites the parser the entire Source Control status display depends on). This workstream's subagent also hit the spend limit mid-task; recovered and finished personally, including generating real `git status --porcelain=v2`/`git submodule status` output from throwaway scratch repos (mixed changes, real conflicts, a real submodule in all 3 required states: uninitialized/dirty/pointer-changed) to write 10 new unit tests against real fixtures rather than guessed formats, plus validated against this repo's own actual working-tree state.
- **L** (`e01bad2`) Snippets: `${VAR_NAME}`/`${VAR_NAME:-default}` placeholders, prompted once before execution (skipped entirely for the common no-variables case); a curated `SHELL_RESERVED_VAR_NAMES` denylist (`PATH`, `HOME`, etc.) prevents hijacking real shell/env var references.
- **Independent review** (`b683a9d`): a fresh subagent audited the complete diff (65 files, ~4600 lines) against the plan, ran the full verification suite on the final combined state (not just per-commit), and found 2 high-severity + 3 medium-severity real bugs — all fixed: `applySettingChange` was missing 27 cases for the new E5 settings (search-toggle silently did nothing); `useSnippetExec`'s host-picker/variable-prompt dialogs used single-slot state, so a second concurrent request permanently orphaned the first (no error, no timeout); `walk_remote_tree` had no symlink-cycle detection (real infinite-hang risk); `snippet_run_cancel` had the exact same lock-across-`wait()` deadlock class already documented and fixed once in `shell/background.rs` (fixed the same way: signal by PID); submodule badge used identical colors for two different states. (One review-flagged issue — hunk-busy-state not scoped by file path — was investigated and found to only affect the already-dead `DiffViewer.tsx`, not the real `GitDiffPane.tsx`; no fix needed there.)

**Two subagents hit a "monthly spend limit" API error mid-task** (Workstream C and Workstream K). Both times: read the partial diff carefully, verified/finished the work personally rather than blindly retrying, and both turned out to be high-quality, nearly-complete work (C: one test-fixture-math mistake; K: just the final struct-field wiring was missing). User confirmed via AskUserQuestion to "just continue" rather than switch to inline-only or pause for a limit increase.

PR opened: **https://github.com/Snenjih/labonair/pull/130** — extensive testing checklist per feature area in the PR body (manual `pnpm tauri dev` verification still needed, this sandbox is headless).

### Current State
Branch `fix/full-app-review-pass` pushed, PR #130 open against `main`. 13 commits total (A–L + one review-fixup). All automated checks green throughout: `cargo check`/`clippy -D warnings`/`test --lib` (109 tests), `tsc --noEmit`/`vitest run` (496 tests, 37 files).

### What's Next
- **Mandatory before merge**: the manual `pnpm tauri dev` checklist in the PR body — especially anything touching SSH (Workstream J's remote stdin-piping for hunk-staging has zero live SSH test coverage; H's Test Connection; I's cancel-over-SSH).
- Consider deleting `DiffViewer.tsx` (confirmed dead code, same reasoning `CommitDiffPanel.tsx` was deleted for in Workstream F) in a follow-up pass.
- The ~16 settings deliberately excluded from the search index (shortcut-driven/pure UI-state) and snippet chaining (explicitly out of scope for Workstream L) are documented, not forgotten — see PR body's "Notes for reviewer".

### Blockers
- None currently — PR is open and ready for human review + the manual SSH/UI checklist.

---

## Previous Session: 2026-07-14 (russh Migration Follow-up: Exec Exit-Code Bug + oklch Canvas Crash)

### What Was Done
User reported two issues after the russh migration PR (#127) landed: (1) remote Source Control showed "not a repository" / `git exited with code -1` on a folder that genuinely is a git repo, and (2) `Error: Unexpected fillStyle color format "oklch(0.9452 0.0001 259.980011)" when drawing pattern glyph` in the terminal. Both investigated and fixed directly (no plan mode needed, both were concrete bug hunts). See `~/.claude/.../memory/bugs_and_fixes.md` for full write-ups of both.

**Bug 1 (the real cause of the git report)**: every exec-based `channel.wait()` loop added by the russh migration (`git/executor.rs::run_remote_script`, `ssh/exec.rs::ssh_exec_command`, `sftp/worker.rs::compute_remote_md5`, `ssh/sftp.rs::sftp_chown`, `snippets/exec.rs::snippet_run_ssh` — 5 sites, plus 2 more in `ssh/sftp.rs` fixed defensively even though they don't check exit codes) broke on `ChannelMsg::Eof | ChannelMsg::Close`, but the SSH protocol sends `ExitStatus` *after* `Eof` — confirmed against russh's own bundled example (`client_exec_simple.rs`, which explicitly comments "cannot leave the loop immediately, there might still be more data to receive"). So `exit_code` was permanently stuck at its `-1` init value on every remote command, success or failure, which made `git/executor.rs`'s `exit_code == 0` success check always false — hence "not a repo" and the literal `"git exited with code -1"` string (from `normalize_git_error(-1, "")`, empty stderr on an actually-successful command). Same bug silently broke `compute_remote_md5` too (SFTP post-transfer integrity check always returned `None`, silently skipped) and made `ssh_exec_command`/`snippet_run_ssh` always report exit code -1 to the frontend — neither yet reported, both fixed anyway. Fix: removed the `Eof | Close => break` arm at all 6 sites, falling through to the existing `_ => {}` — `channel.wait()` already returns `None` on its own once the channel is fully closed, so the loop still terminates correctly, just no longer before `ExitStatus` arrives.

**Bug 2 (unrelated to SSH, a WebKit/Tauri-webview canvas quirk)**: `src/styles/tokens.ts`'s theme-token resolver assumed `getComputedStyle(probe).color` always normalizes an `oklch()`-declared CSS variable (Tailwind v4's native palette format) down to `rgb()` — true on most engines, not on this user's WebKit build, which preserves the source color space verbatim. That oklch string then reaches xterm.js's `Terminal({theme})`, gets set as a canvas `fillStyle` internally, and — since this engine's canvas accepts oklch as fillStyle input and preserves it on readback rather than rejecting/normalizing it — `@xterm/addon-webgl`'s glyph-pattern cache (which only parses `#hex`/`rgba()`) throws when it reads `ctx.fillStyle` back. Fixed by adding a real numeric OKLCH→sRGB conversion (`oklchToRgb()`, Björn Ottosson's published matrices) rather than another attempt to lean on browser normalization; `resolve()` now runs it whenever the computed value starts with `oklch(`. Found and fixed an identical latent bug at a second site, `blockDecorations.ts`'s `themeColor()` (Block Terminal's overview-ruler color, feature defaults off so not yet user-visible) — same fix, reused `oklchToRgb`. Deliberately did NOT touch `FindWidget.tsx`'s superficially similar `resolveThemeColor()` — it already reads back rasterized pixels via `getImageData()` rather than the `fillStyle` string, which is a different, already-correct technique immune to this whole class of bug.

New tests: `src/styles/tokens.test.ts` (7 cases — exact black/white round-trip since C=0 collapses the OKLab matrices to an exactly-verifiable closed form, alpha handling, gamut clamping, non-oklch passthrough).

`cargo check`/`clippy -D warnings`/`test --lib` (87/87) ✅ · `tsc --noEmit` ✅ · `vitest run` (439/439, +7 new) ✅.

### Current State
Branch `russh-migration`, PR #127 already open. This session's fixes are on top of the migration commit, not yet pushed as of writing this entry (about to push, which will update PR #127 automatically since it already tracks this branch).

### What's Next
- Push this follow-up commit (updates PR #127)
- The mandatory live-SSH-server manual test checklist from the previous session is still outstanding — re-verify remote git status specifically now that the exit-code bug is fixed
- If the oklch/canvas crash resurfaces anywhere else, check any other code path that hands a theme color to a `<canvas>` 2D context — the fix pattern is `oklchToRgb()` (numeric conversion) or `getImageData()`-pixel-readback (`FindWidget.tsx`'s technique), never a raw computed-style string passed straight to `fillStyle`

### Blockers
- None

---

## Previous Session: 2026-07-14 (Full ssh2 → russh Migration)

### What Was Done
User (via a pre-written planning brief, `russh-migration.md`) requested a complete replacement of the Rust SSH/SFTP backend from `ssh2` (libssh2 bindings, synchronous) to `russh` 0.62.2 (`ring` feature) + `russh-sftp` 2.3.0 (pure-Rust, native Tokio async) — no shim, no parallel operation, `ssh2` fully removed. Went through full plan-mode (3 parallel Explore agents researching current ssh2 architecture, 1 Plan agent producing the implementation plan, verified crate-API claims live against docs.rs/crates.io during planning) before implementing on branch `russh-migration`. Plan file: `~/.claude/plans/russh-migration-planungsauftrag-clever-wave.md`.

Implemented via 9 sequential subagent workstreams on one worktree (explicitly no parallel isolated worktrees — this subsystem is too tightly coupled, `SshState`/`SftpState` merge + `lib.rs` registrations touch nearly every workstream): Cargo wiring → core transport/auth/known-hosts (`ssh/client.rs`, `ssh/mod.rs`) → PTY/terminal (`ssh/pty.rs`, `ssh/exec.rs`) → SFTP subsystem (`sftp/state.rs` deleted, `sftp/connection.rs`, `ssh/sftp.rs`) → transfer worker (`sftp/worker.rs`) → exec/git/snippets (`git/executor.rs`, `git/mod.rs`, `snippets/exec.rs` — the latter two found mid-migration, not in the original file inventory) → tunnels (`ssh/tunnels.rs`) → credentials compat test → cleanup pass. `cargo check`/`clippy -D warnings`/`test --lib` (87/87) green after every workstream; `tsc --noEmit`/`vitest run` (432/432) confirmed **zero frontend files touched** — the entire IPC contract (command names/signatures, event payloads, the `Channel<SshPtyEvent>` mechanism) is unchanged.

**Session-model change**: unified `SshState`/`SftpState` into one `SshState(Arc<Mutex<HashMap<session_id, Arc<RushSession>>>>)`, `RushSession{handle: Arc<russh::client::Handle<ClientHandler>>, pty, sftp: OnceCell<SftpSession>, shutdown, disconnect_reason}` — removes the "two logins per host" problem for any code path that shares a session_id (verified none exist today, so this is risk-free). `TunnelState` deliberately stayed separate/host-keyed. True cross-tab host-level pooling explicitly scoped out as a future follow-up.

**Concrete bugs fixed as part of the migration** (not just parity): SFTP upload no longer loads whole files into RAM (was `std::fs::read()`), atomic `OpenFlags::CREATE|EXCLUDE` TOCTOU fixes on both upload/download conflict detection, real mid-chunk transfer cancellation via `tokio_util::CancellationToken`+`select!` (was checked only between chunks), the sequential-stdout-then-stderr-full-drain deadlock-risk pattern fixed at all 5 sites it recurred (`git/executor.rs`, `sftp/worker.rs::compute_remote_md5`, `ssh/sftp.rs`'s du/chown, `ssh/exec.rs`, `snippets/exec.rs`) via one interleaved `channel.wait()` message loop, tunnels' auth upgraded from password/bare-pubkey-only (no agent, no passphrase, no known-hosts check) to the same shared auth helper the terminal/SFTP path uses, all busy-wait `std::thread::sleep` loops (jump-bridge 50µs, tunnel bridge/accept/shutdown polling) deleted in favor of real async I/O + `tokio::select!`.

**Post-implementation review agent caught 4 real bugs**, all fixed afterward (see `~/.claude/.../memory/bugs_and_fixes.md` for full detail) — none of them broke the build or failed a test, all were behavioral/semantic mismatches only found by independently reading the vendored `russh`/`russh-sftp` source rather than trusting agent summaries:
1. RSA pubkey/agent auth hardcoded `hash_alg: None` → requests legacy `ssh-rsa`/SHA-1, rejected by OpenSSH ≥ 8.8 by default. Fixed via `handle.best_supported_rsa_hash()`.
2. This app's own PKCS#8-generated keys never triggered the passphrase-prompt dialog (`Error::KeyIsEncrypted` is never raised for PKCS#8, only legacy OpenSSH-format keys) — missing/wrong passphrase surfaced as a cryptic crypto error instead. Fixed via PEM-header detection routing PKCS#8 decode failures through the same prompt.
3. PTY disconnect reason was hardcoded to `"unexpected eof"` regardless of actual cause (`ChannelReadHalf::wait()` returning `None` carries no error info by itself, unlike the old code). Fixed by adding a shared `disconnect_reason` slot written by a new `ClientHandler::disconnected()` override.
4. `is_network_error`/`humanize_disconnect_reason` checked `"timed out"` but not `"timeout"` — added both defensively.

`grep -rn "ssh2" src-tauri/src src-tauri/Cargo.toml` returns zero hits (including doc comments, which were rewritten rather than left stale).

### Current State
Branch `russh-migration`, all changes uncommitted as of writing this entry (about to commit). All automated verification green (`cargo check`/`clippy`/`test`, `tsc`, `vitest`). Diff: 19 Rust files changed (`sftp/state.rs` deleted), zero frontend files.

### What's Next
- **Mandatory before merging to `main`**: the plan's live-SSH-server manual test checklist — auth (password/pubkey-with-and-without-passphrase/agent), known-hosts TOFU + mismatch scenarios, PTY interactivity with real TUIs (`gh`/`claude` — historically the most sensitive spot in this codebase, see the two prior sessions below), SFTP transfer upload/download/cancel-mid-chunk/large-file, jump-host bridging, tunnels (specifically test agent auth + passphrase-protected key against a tunnel, which never worked pre-migration). None of this is automatable without a real reachable SSH server — do not merge on green CI alone.
- Consider the explicitly-deferred follow-up: true cross-tab host-level connection pooling (one physical connection per host shared across terminal+SFTP+explorer tabs) — `tunnels.rs`'s `TunnelEntry{ref_count}` is the ready-made template if this is ever wanted.

### Blockers
- Live SSH server access needed for the manual test checklist above — not available in this environment.

---

## Previous Session: 2026-07-11 (Full-App Review + review-fix-plan.md Execution — Workstreams A, B, D–O)

### What Was Done
Ran a full 6-agent review of the entire app (Rust backend, frontend state/perf, terminal/PTY, AI subsystem, SFTP/explorer, editor/source-control/snippets/settings) and personally verified the most severe findings against source before reporting. User picked which findings to fix, then reduced scope again to exclude anything tied to `ssh2`-specific architecture (see `russh-migration.md` — a real, not-yet-decided consideration to swap `ssh2` for `russh`). Plan approved and written to `review-fix-plan.md` (repo root) as 15 workstreams (A–O, C and N dropped, D/E/F trimmed). All workstreams except B are code-complete and committed:

- **A** (`fb8af08`, `fix(ai)`): 6 AI-tool-security findings — SSH-remote `read_file`/`list_directory` now run `checkReadable` before `ssh_exec_command`; new `fs_realpath` Rust command + `checkReadableResolved`/`checkWritableResolved` catch symlinks; `grep`/`glob` filter individual hits, not just the search root; `checkShellCommand` strips `sudo`/`doas` and blocks secret-basename/path references (command substitution stays a documented limitation); generated SSH keypairs and remote-edit temp files created with `0600`/`0700` from the start (`OpenOptionsExt::mode`), closing a TOCTOU window.
- **B** (`318c6a2`, `fix(terminal)`): the `isRemote` gate from the previous session was **incomplete** — xterm.js's own built-in, unguarded CSI `c`(DA1)/`n`(CPR) handlers were still answering for SSH sessions (verified by reading `@xterm/xterm` source, its last-registered-first CSI dispatch). New `registerTerminalQuerySwallowHandlers` wins that dispatch instead. **Not live-verified — see below, this is the actual blocker for the whole session.**
- **D** (`2c02e67` co-commit, `fix(rust)`): `background.rs`'s kill-deadlock — reaper thread held the `child` mutex for its whole blocking `wait()`; `kill()` now signals by PID (`libc::kill`) instead of needing that lock.
- **E** (same commit): `fs/mutate.rs`'s six local-FS commands wrapped in `spawn_blocking` (were plain sync fns doing blocking I/O on the async runtime).
- **F** (same commit): `fs_grep`/`fs_glob` switched from `WalkBuilder::build()` to `build_parallel()`.
- **G** (`a349e86`, `perf(tabs)`): `TabBar`/`SidebarTabList` no longer re-render on every unrelated tab-store mutation (new `selectRenderStableTabs`, value-memoized per tab id); `AppShell`'s `sidebarPassthrough`/Header props memoized so `React.memo` on `Header`/`WorkspaceArea` isn't defeated; `SidebarContent` now wrapped in `React.memo` too (wasn't before).
- **H** (`3c7a497`, `fix(editor)`): autosave timer now re-arms on every keystroke (new `editVersion` counter in `useDocument`), not just once per file-open.
- **I** (`993a0b6`, `fix(sftp,command-palette)`): the dead "Toggle Hidden Files" command now calls the real toggle (`toggleSftpHiddenFiles`, moved to `preferences.ts`) instead of a `CustomEvent` nobody listened for.
- **J** (`6d470fb`, `fix(snippets)`): silent SSH snippet runs no longer leak listeners when no SSH session is active for the host.
- **K** (`15a59b9`, `fix(terminal)`): dormant-scrollback flush no longer loses bytes on a failed/size-capped `scrollback_save` — `DormantRing.peekNew()` split into `previewNew()`/`commitFlushed()`.
- **L** (`4fa32c2`, `perf(sftp,explorer)`): dual-pane SFTP tab and local sidebar explorer are now both paginated (`sftp_read_dir_page` reused; new `fs_read_dir_page` Rust command for local), matching the pagination the remote sidebar tree already had.
- **M** (`406d4c1`, `fix(hosts)`): `deleteManyHosts` uses `Promise.allSettled` + notifies on partial failure instead of one failure blocking the whole batch's UI update; new `hosts_duplicate` Rust command replicates a duplicated host's stored password server-side (the frontend's `Host` read-shape never carries it).
- **O** (`6ebd2f0`, `fix(git-graph)`): `Math.max(1, ...spread)` → `reduce` for lane-count (call-stack-size hazard on huge repos).

Every commit passed `cargo check` + `cargo clippy --all-targets` + `cargo test --lib` (91/91 by the end, started at 85/85) and `tsc --noEmit` + `vitest run` (448/448 by the end, started at 432/432) before being made.

### Current State
Branch `performance-internals-optimazation`, all of A/D–O committed and locally ahead of `main` (not pushed). `review-fix-plan.md` at repo root has the full spec for every workstream if any needs re-deriving.

### What's Next
- **Workstream B is the one open item and is NOT verified live** — same headless-sandbox limitation as every prior SSH-TUI session on this exact bug (this is the third fix attempt total; see the two entries below for the first two, both of which were also marked done without live verification and turned out incomplete). **Do not consider this closed without a real `pnpm tauri dev` + SSH host test running `gh auth login` or `claude`.** If it's still broken after this fix, the query/reply layer needs live packet-level instrumentation (actual measured SSH round-trip time, whether `SSH_BATCH_MS`/`IDLE_POLL_MAX_MS` need lowering), not another static-reading pass — the static-analysis well has likely been fully drawn from at this point.
- Once B is confirmed (or fixed further), this branch is ready for a PR against `main`.

### Blockers
- No display in this environment — Workstream B's manual verification step is blocked until a human runs it.

---

## Previous Session: 2026-07-11 (SSH Interactive-TUI Corruption, Part 2 — Query-Reply Latency)

### What Was Done
User rebuilt/restarted the app after the 2026-07-10 fixes (`c07897d`) and reported the corruption was still fully present: `NaN;1R`-style text still appeared, and `claude`'s onboarding TUI still rendered with interleaved/garbled text (e.g. "WelcomentoiClaudeeCode" instead of "Welcome to Claude Code"). Confirmed via `AskUserQuestion` that (a) the rebuild genuinely happened, so the 3 previous fixes just weren't the primary cause, and (b) **the same TUIs render perfectly fine in a local (non-SSH) terminal tab** — this is SSH-only.

Ruled out via static reading before landing on the real cause: Block Terminal overlay (default `false`, user's persisted `nexum-settings.json` is empty so no override), duplicate slot-binding in `rendererPool.ts` (`acquireSlot`'s existing-slot check structurally prevents two slots ever sharing one `sessionId`), duplicate `ssh_connect` calls (`SshLoadingScreen`'s `connectingRef` guard + effect-cancellation prevent it), and the PTY resize path (`fitAddon.fit()` + `resizePty` self-corrects on every bind, not gated behind alt-screen).

**Root cause**: `registerTerminalQueryHandlers` (DA1/CPR/OSC10/OSC11 responder in `osc-handlers.ts`) is wired identically for local and SSH sessions via `bindLeafToSlot`'s `registerOsc` (`terminalSessionRegistry.ts`). For local PTY, `writeToProcess` is a same-machine syscall — replies land far faster than any TUI library's own reply-timeout. For SSH, `writeToProcess` is `invoke("ssh_pty_write", ...)` — a Tauri IPC hop *plus* a real network round-trip to the remote host — on top of up to ~25ms the Rust reader thread's idle-poll backoff can already add before the *incoming* query is even seen (`pty.rs`'s `IDLE_POLL_MAX_MS`), plus the 4ms/16KB `SSH_BATCH_MS` output-batching delay. Cumulative latency routinely exceeds what interactive TUI libraries (used by `gh`, `claude`, etc.) wait for a CPR/DA1/OSC-color reply before giving up — and a reply that arrives *after* the caller gave up gets consumed as literal keystrokes/typed input instead of a control reply, corrupting whatever menu is active. This is the same failure mode as the NaN case from the previous session, just triggered by *lateness* instead of *invalid content* — explaining why the NaN guard alone didn't fix it: a well-formed but late reply is exactly as corrupting as a NaN one.

**Fix** (uncommitted as of writing this entry, about to commit): added `isRemote: boolean` to `SessionRecord`/`RegisterOptions` in `terminalSessionRegistry.ts`. `SshTerminalPane.tsx`'s `registerSession(...)` call now passes `isRemote: true`. `bindLeafToSlot`'s `registerOsc` skips calling `registerTerminalQueryHandlers` entirely when `s.isRemote` — DA1/CPR/OSC10/OSC11 queries simply go unanswered for SSH sessions, same graceful-degradation path every well-behaved terminal program must already support for terminals with no CPR support at all (this is *not* a regression risk — TIOCGWINSZ/SIGWINCH-based sizing via `ssh_pty_resize`, which is what actually matters for correct wrapping, is untouched and independent of this). Local sessions are unaffected — `isRemote` defaults to `false`, so `useTerminalSession.ts`'s local PTY sessions keep answering these queries as before. `tsc --noEmit` ✅ · `vitest run` (432/432, unchanged) ✅.

### Current State
3 commits so far on `main` (not pushed): `c07897d` (part 1: CPR NaN guard, scrollback dormant-ring dedup, boundary separator) and this session's `isRemote` gate (commit hash TBD at commit time — check `git log`). `scripts/terminal-test.sh` has unrelated uncommitted local changes (bash `read -N1`→`-n 1` portability fixes, `$COLUMNS`/`$LINES` → `tput`/`stty` fixes) that were already present in the working tree before this session touched anything — deliberately left untouched/uncommitted, not part of this fix.

### What's Next
- Push once the user is ready
- **Still needs a real rebuild + SSH-host retest** — this is the most evidence-backed hypothesis (confirmed SSH-only reproduction, ruled out every other structural candidate found via static reading) but wasn't verified live (headless sandbox, no display). If `gh auth login`/`claude` still corrupt after this fix, the next things to instrument are: (a) actual measured round-trip time for `ssh_pty_write` on the user's specific host/network, (b) whether `SSH_BATCH_MS`/`IDLE_POLL_MAX_MS` in `pty.rs` need lowering for control-sequence-carrying reads specifically, (c) packet-level capture to see whether the CLI's own reply-timeout is the limiting factor at all vs. something else entirely
- If OSC10/11 (fg/bg color auto-detect) turning off for SSH causes a *cosmetically* wrong theme guess in some CLI, that's an accepted, expected tradeoff — flagged here so it isn't mistaken for a new bug

### Blockers
- None — but confidence is "best-supported hypothesis from static analysis," not "confirmed fix," since no live SSH+TUI verification was possible this session

---

## Previous Session: 2026-07-10 (SSH Interactive-TUI Corruption Fix — CPR NaN + Scrollback Duplication)

### What Was Done
User reported that interactive full-screen TUIs over SSH (`gh auth login`, `claude`, etc.) rendered broken: literal `NaN;1R` text appearing inline, and new TUI frames visually overlapping/stacked with old scrollback content instead of cleanly redrawing. Investigated via a background Explore agent, then personally verified every claimed file/line before acting (per this repo's "verify before recommending" habit) — found and fixed three compounding bugs. `tsc --noEmit` ✅ · `vitest run` (432/432) ✅.

**Root causes found:**
1. `osc-handlers.ts`'s custom CPR (Cursor Position Report, `\x1b[6n`) responder read `term.buffer.active.cursorX/cursorY` without a finiteness guard. During a renderer-pool slot rebind these can transiently be `undefined`, producing a literal `"\x1b[NaN;NaNR"` written back into the PTY — which SSH-side TUI libraries then echo as typed input instead of consuming as a control reply (matches the reported `NaN;1R^C` text).
2. **The dominant bug**: `useSessionLifecycle.ts`'s periodic (30s) + quit-time `flushAllDormantScrollbacks()` called `DormantRing.peek()` — a *non-destructive* read — every tick, without ever draining. A long-backgrounded SSH tab therefore had its **entire accumulated dormant-ring content re-appended to the on-disk scrollback file on every single tick**, duplicating the same raw bytes exponentially (a tab dormant for 5 minutes could accumulate ~10 stacked copies). On reconnect, `SshTerminalPane.tsx` replays that whole corrupted blob verbatim — explaining the multiple stacked "generations" of old screens (gh menu + `w` output + claude welcome, all visible at once) in the user's screenshot.
3. The raw dormant-ring tail was naively string-concatenated onto an unrelated, independently-`serialize()`d clean snapshot with no boundary marker, making any single bad splice look like corrupted live rendering rather than a legible "here's what happened while you were away" section.

**Fixes (all in one commit `c07897d`):**
- `osc-handlers.ts`: guard the CPR handler — `if (!Number.isFinite(cursorX) || !Number.isFinite(cursorY)) return false;` (leaves the query unanswered; the caller's own CPR timeout handles that gracefully, same as talking to a terminal without CPR support).
- `dormantRing.ts`: added `peekNew()` — an incremental variant tracking a `flushedBytes` offset (adjusted correctly across overflow-drops) so repeated calls return only bytes appended since the last call, instead of the whole ring every time. `peek()`/`drain()` unchanged (still used for the correct one-shot rebind-replay path, which was never buggy).
- `terminalSessionRegistry.ts`: `peekDormantAnsi()` now calls `peekNew()` instead of `peek()`.
- `scrollback.ts`: `flushDormantScrollback()` inserts a dim separator (`"─── background output ───"`) between previously-saved content and each freshly-flushed chunk.
- Added test coverage: `osc-handlers.test.ts` (CPR reply + NaN-guard), `dormantRing.test.ts` (3 new `peekNew()` cases incl. an overflow-drop consistency check).

### Current State
Committed directly to `main` as `c07897d` (not pushed yet — user only asked to commit). Working tree clean otherwise.

### What's Next
- Push `c07897d` when the user is ready
- No manual `pnpm tauri dev` + real SSH host verification done yet (headless sandbox) — worth confirming visually that `gh auth login` / `claude` render correctly now, and that a long-backgrounded SSH tab's scrollback no longer duplicates on reconnect
- If corruption still appears after a genuinely bad mid-escape-sequence cut (not the duplication case), the deeper architectural fix discussed but not implemented is a headless mirror `Terminal` per dormant session so periodic flushes always come from a real `serialize()` instead of raw byte splicing

### Blockers
- None

---

## Last Session: 2026-07-02 (Full Remote-Parity Fix Pass — Explorer, Source Control, AI Attach)

### What Was Done
User asked for an audit of the remote-explorer/Source-Control work (PR #115) for anything still local-only or missing empty/error states. A general-purpose research agent found 8 concrete gaps (verified against actual code, not speculative) plus the 2 already-disclosed scope cuts (`.gitignore`/exclude remote writes, PATH heuristic). User asked for **all of it** fixed in one pass. Went through plan mode (3 parallel Explore-agent research streams + several direct file reads to nail exact signatures) before implementing. 3 sequential commits on `feat/explorer-remote-provider`, still part of PR #115. `cargo check` ✅ · `cargo clippy` ✅ · `cargo test --lib` (67/67) ✅ · `tsc --noEmit` ✅ · `vitest run` (285/285, +10 new) ✅. **Still not merged — no manual `pnpm tauri dev` testing done (headless sandbox).**

**Commits:**
1. `295b79e` — `fix(git,sftp)`: Rust backend — `net_error.rs`/`executor.rs` emit `ssh_connection_lost` for a dead lazy session immediately (previously never classified); `exec_remote_args` retries a short fixed list of absolute git paths on PATH-resolution failure; `git_add_to_gitignore`/`git_add_to_exclude` gain optional `session_id` + remote branch via `GitExecutor::run_shell_script`; new `sftp_read_file_content` (one-shot remote read for AI attach) and `cleanup_remote_edit_temp` (was previously never cleaned up at all)
2. `18a3df7` — `fix(source-control,git-graph)`: `useGitStatus.ts` catch blocks always surface errors now (was a narrow "not installed" allowlist, silently mis-rendering session-loss as "not a git repo"); new `gitErrors.ts` (`isSessionLostError`) shared by `NoRepoState`/`GitGraphPane`; `SourceControlPanel.tsx`/`GitGraphPane.tsx` now call `useLazyExplorerSession` themselves (previously only `FileExplorer` did — switching sidebar panels away from Files, or leaving a Git Graph tab open, let the session idle-time-out with nothing watching it); Stage All/Unstage All and git-init no longer swallow errors silently
3. `6d211ae` — `feat(explorer,ai)`: `AppShell.tsx`'s `onNewGitGraph` now derives `hostId`/`sessionId` from the always-live `ctrl.explorerTarget` instead of the panel-dependent Source Control store (was silently falling back to local); AI "Attach to Agent"/"Reference in AI chat" now work for remote files; drag-to-terminal decoupled from native-OS-drag capability (remote rows can now drag at all); command-palette explorer commands register unconditionally + toast when not ready; "Copy Root Path" fixed to reflect remote roots; new `openRemotePreviewTab` closes the file-preview scope cut by reusing `prepare_remote_edit`'s temp-download; `disposeTab` now cleans up remote-edit/-preview temp files on close

**New test coverage:** `gitErrors.test.ts`, `explorerDrag.test.ts` (10 new tests, pure-logic pieces only — most of this pass is UI/session wiring, harder to unit test without heavy mocking, consistent with this codebase's existing test coverage style).

**Deliberately left out of scope (stated explicitly in the plan, not silently skipped):** the per-host `ssh2::Session` Mutex shared between git commands and SFTP browsing (session contention) — fixing that would mean connection pooling, a much larger separate initiative. Drag-to-terminal cross-host pastes (e.g. dragging a remote file onto a *different* host's terminal, or a local file onto an SSH terminal) are left lenient/unblocked — matches the pre-existing local→SSH-terminal behavior, no new restriction added.

### Current State
Branch `feat/explorer-remote-provider` (18 commits ahead of `main` now), PR #115 not yet updated with this pass's description/checklist. All automated checks green. Manual verification still needs a human with `pnpm tauri dev` + a real SSH host — this pass adds several new manual-test scenarios worth adding to the PR checklist (see plan file, still at `~/.claude/plans/bubbly-launching-ember.md`, for the full A–J list): kill an SSH connection mid Source-Control-poll and confirm "Connection Lost" + working Reconnect (not "not a git repo"); open Git Graph on a fresh SSH tab without ever opening Source Control first and confirm it resolves remote, not local; drag a remote file into its own host's SSH terminal; attach a remote file to the AI chat; add a file to `.gitignore` on a remote repo; open a remote HTML/image file in Preview.

### What's Next
- Update PR #115's description with this pass's changes + extend the manual verification checklist
- Run the full manual checklist (old + all prior passes + this one) against a real SSH host
- After merge: revisit the explicitly-deferred session-contention (git+SFTP shared Mutex) item if it ever causes a reported problem

### Blockers
- None (aside from needing a real SSH host + display for manual verification, same as every prior session on this branch)

---

## Previous Session: 2026-07-02 (Remote Source Control, Git Graph & SSH-aware Path Breadcrumb)

### What Was Done
Extended the remote-capable sidebar explorer (PR #115) with full local/remote parity for Source Control, Git Graph, and the bottom-bar path breadcrumb — closing the gap `useExplorerTarget.ts` explicitly documented ("SourceControlPanel has no remote story"). Planned via plan-mode (3 Explore agents + 1 Plan agent researching the git module, SC/git-graph frontend, and settings/test conventions before implementation). 7 more sequential commits on `feat/explorer-remote-provider`, PR #115 description extended. `cargo check` ✅ · `cargo clippy` ✅ · `cargo test --lib` (66/66) ✅ · `tsc --noEmit` ✅ · `vitest run` (275/275) ✅. **Not merged — no manual `pnpm tauri dev` testing done (headless sandbox, no display).**

**Commits (see PR #115 for full descriptions):**
1. `ed0aca4` — `refactor(ssh)`: extract `shell_quote` from `ssh/sftp.rs` into shared `ssh/shell.rs`, add tests
2. `3768417` — `feat(git)`: `GitExecutor` abstraction (`src-tauri/src/modules/git/executor.rs`) — local stays argv-based `Command::args()`, remote runs the same git subcommand over the target's existing SFTP session via `bash -lc`/`sh -c` fallback; `git_is_repo` fixed to `Result<bool,String>` (was silently swallowing "git not installed"); new bundled `git_get_workspace_state` (status+branches+stash+tags+diffstats+flags in one exec — the real perf fix, since `ssh2::Session` is one-Mutex-per-host so "parallel" polling calls were serializing into 5 round-trips); new `git_init` command
3. `dec51b1` — `feat(explorer)`: `SourceControlPanel`/Git Graph now consume the shared `ExplorerTarget`; `GitGraphTab`/`GitDiffTab`/`CommitDiffTab` gain snapshotted `hostId`/`sessionId`
4. `2b67a68` — `feat(source-control)`: every SC component threads `sessionId`; `useGitStatus` switched to the bundled call + configurable/remote-backoff polling; `NoRepoState`'s git-init no longer bypasses the target
5. `d5dc2b1` — `feat(git-graph)`: `useGitGraph` + context menu actions + diff tab panes thread `sessionId`; remote page size capped lower (200 vs 500)
6. `3f04dc9` — `feat(statusbar)`: `CwdBreadcrumb` renders for SSH tabs now (was local-only), subfolder dropdown goes through `FsProvider` via the same lazy session the sidebar tree uses (`useLazyExplorerSession`)
7. `56623c9` — `feat(settings)`: new configurable `gitStatusPollIntervalMs` setting (default 5000ms), new "Source Control" settings tab

**Known, disclosed scope cuts (in PR notes):** `.gitignore`/`.git/info/exclude` writes stay local-only (raw filesystem writes, not git commands) — remote target shows a clear "not supported yet" message instead of a broken local IO error. Non-interactive SSH `$PATH` resolution is a `bash -lc` login-shell heuristic, not exhaustive PATH-probing.

### Current State
Branch `feat/explorer-remote-provider` pushed (15 commits ahead of `main` total), PR #115 description extended with the new feature set + updated testing checklist. All automated checks green. Manual verification (both the original remote-browsing checklist and the new remote SC/Git Graph/breadcrumb checklist) is in the PR description — still needs a human with `pnpm tauri dev` + a real SSH host.

### What's Next
- Run the full manual verification checklist in PR #115 against a real SSH host (both old and new sections)
- If that surfaces issues, fix on the same branch
- After merge: consider extending `.gitignore`/`.git/info/exclude` writes to remote targets via SFTP if it comes up again

### Blockers
- None (aside from needing a real SSH host + display for manual verification)

---

## Previous Session: 2026-07-01 (Sidebar Explorer: SSH Host Browsing via Shared FsProvider)

### What Was Done
Extended the local-only sidebar file tree to also browse SSH hosts, without replacing the existing dual-pane SFTP transfer tab. Full plan was designed via plan-mode (3 Explore agents + 1 Plan agent researching tab/session model, SSH/SFTP backend architecture, and existing explorer/SFTP components before implementation started). 7 sequential commits on `feat/explorer-remote-provider`, PR #115 opened against `main`. `cargo check` ✅ · `cargo clippy` ✅ · `cargo test --lib` (42/42) ✅ · `tsc --noEmit` ✅ · `vitest run` (266/266) ✅. **Not merged — no manual `pnpm tauri dev` testing done (headless sandbox, no display).**

**Commits (see PR #115 for full descriptions):**
1. `0e8f3ef` — `refactor(explorer)`: extract `FsProvider` interface + `LocalFsProvider`, migrate local tree onto it (behavior-neutral)
2. `afe4a61` — `fix(sftp)`: classify network errors, emit `ssh_connection_lost` from SFTP browsing commands (previously only PTY/transfer-worker did), idempotent `sftp_connect`
3. `37d6dce` — `feat(sftp)`: add `sftp_create_file`, recursive `sftp_mkdir`, new additive `sftp_read_dir_page` command
4. `9107de5` — `feat(explorer)`: `RemoteFsProvider`, `useExplorerTarget` (session-reuse: sftp-tab session reused as-is, ssh-terminal-only gets a lazy ref-counted session), `useLazyExplorerSession`, `ExplorerAuthPrompt`
5. `b93c48d` — `perf(explorer)`: `buildTreeRows` + `VirtualizedTreeList` — tree was recursive (FileTreeNode nested itself), now flattened + `@tanstack/react-virtual`
6. `b59e2ab` — `perf(explorer)`: remote pagination via `sftp_read_dir_page` ("Load more…" row), request dedupe + concurrency-capped queue (`asyncQueue.ts`), 20s background polling for `supportsWatch:false` providers
7. `ff4822e` — `fix(explorer)`: host-deletion force-disconnects its lazy session (fixes a latent leak in an unused Phase-3 helper); also fixed a **pre-existing, unrelated** bug found along the way — see below

**Bug found & fixed along the way (unrelated to this feature, but blocked verifying new Rust tests):**
`src-tauri/src/modules/errors.rs`'s `#[cfg(test)]` module still referenced the pre-rename `NexumError` type (leftover from the 2026-06-25 rename) — `cargo check` doesn't compile `#[cfg(test)]` code so this was invisible until `cargo test` was run. Fixed via find-replace. See `~/.claude/.../memory/bugs_and_fixes.md`.

**Deliberate scope cut (documented in PR):** "Download to…/Upload here…" context-menu actions from the dual-pane tab aren't wired into the sidebar tree yet — bulk transfers still go through the dual-pane tab. Also decided *against* adding ref-counted disconnect logic to `SftpPane.tsx` for the tab/tree session-sharing case — reasoning is in commit 7's message.

### Current State
Branch `feat/explorer-remote-provider` pushed, PR #115 open against `main`, not merged. All automated checks green. Manual verification checklist is in the PR description — needs a human with `pnpm tauri dev` + a real SSH host to run it before merge.

### What's Next
- Run the manual verification checklist in PR #115 against a real SSH host
- If that surfaces issues, fix on the same branch (don't start a new one)
- After merge: the deferred Download-to/Upload-here tree actions would be the natural follow-up if wanted

---

## Session: 2026-07-01 (Explorer Settings, Commands, Notification Gap)

### What Was Done
Audited the remote sidebar explorer (PR #115) for missing settings, command-palette coverage, and notification wiring; implemented all three. `tsc --noEmit` ✅ · `vitest run` (266/266) ✅ · `biome check --write` applied to touched files.

- **Notifications** (the actual gap, closed via the `integrate-notifications` skill): `useLazyExplorerSession.ts`'s `ssh_connection_lost` listener and `evictForDeletedHost` now call `useNotificationStore.addNotification`, matching `SshTerminalPane`'s existing pattern. Previously a background lazy session dying while the sidebar panel wasn't mounted was silently invisible.
- **New settings** (Settings → File Manager, search-only like existing `sftp*` prefs — no new sidebar tab): `explorerShowHiddenByDefault`, `explorerRemotePollInterval` (replaces hardcoded 20s poll in `useFileTree.ts`), `explorerAutoReconnect` (reuses existing `sshAutoReconnectDelay`/`sshAutoReconnectMaxAttempts`, doesn't duplicate them), `explorerIdleSessionTimeoutMin`, `explorerMaxIdleSessions` (replace hardcoded 5min/3-session constants in `useLazyExplorerSession.ts`). Full plumbing: `Preferences` type, `KEY_*` consts, defaults, `loadPreferences`, setters, `onPreferencesChange` map (all in `store.ts`), `definitions.ts` entries, `SettingsApp.tsx` switch cases.
- **New command palette hook** `useExplorerCommands.ts`: Refresh File Tree, Toggle Hidden Files, New File/Folder, Reconnect Explorer Sessions, Copy Explorer Root Path. The sidebar tree had zero palette commands before. Refresh/toggle/new-file/new-folder reach the mounted `FileExplorer` via a `window.dispatchEvent`/`addEventListener("labonair:explorer-*")` bridge (same pattern as `ssh.reconnect`'s `labonair:ssh-reconnect`), since `useFileTree`'s actions are hook-local closures, not store state.
- Fixed the `integrate-notifications` skill doc itself (`.claude/skills/integrate-notifications.md`) — still said "Nexum notification system" / `NexumError` from before the 2026-06-25 rename.
- Found but deliberately did NOT fix (unrelated, out of scope): `useSettingsCommands.ts`'s `settings.hidden-files` command dispatches `labonair:sftp-toggle-hidden` to a listener that doesn't exist anywhere — a pre-existing dead command for the dual-pane SFTP tab.

### Current State
Committed as `dd597f3` on `feat/explorer-remote-provider`, part of PR #115. All checks green.

### What's Next
- Manual testing of the new settings (esp. `explorerAutoReconnect`) and commands still needs a real SSH host + `pnpm tauri dev`

---

## Previous Session: 2026-06-25 (Full App Rename: Nexum → Labonair)

### What Was Done
Complete rename of the app from "Nexum" to "Labonair" across all layers. 4 sequential subagents + 1 direct fix pass. `cargo check` ✅ · `tsc --noEmit` ✅ · pushed to remote ✅

**Commits:**
1. `62da1cf` — `refactor(rust)`: Rust backend + config (27 files)
2. `c840c7c` — `refactor(frontend)`: TypeScript frontend + data migration (56 files)
3. `31cca0c` — `docs`: CI/CD, issue templates, 109 docs files (129 files)
4. `566a704` — `fix`: HTML entry points + default-dark.json (3 files)

**Key changes:**
- Bundle ID: `com.nexum.app` → `com.labonair.app`
- Cargo package: `nexum`/`nexum_lib` → `labonair`/`labonair_lib`
- `NexumError` → `LabonairError` (~120 Rust occurrences)
- All keychain services `nexum-{app,cred,sudo}` → `labonair-{app,cred,sudo}` with auto-migration
- DB migration: `nexum.db` → `labonair.db` via `fs::rename` on first launch
- All 10 tauri-store files renamed (`nexum-*.json` → `labonair-*.json`) with migration
- All localStorage keys migrated via `runStoreMigration()` in `App.tsx`
- All Tauri events: `nexum:*` → `labonair:*`
- CSS: `nexum-tab-in` → `labonair-tab-in`
- AI system prompt: "You are Nexum" → "You are Labonair"
- Shell integration: `NEXUM_*` env vars → `LABONAIR_*`
- CI/CD: DMG names, Homebrew tap, event types updated

**⚠️ PENDING — manual GitHub steps required:**
```bash
# 1. Rename main repo
gh repo rename labonair --yes
git remote set-url origin https://github.com/Snenjih/labonair.git

# 2. Rename themes repo
gh api -X PATCH /repos/Snenjih/nexum-themes -f name=labonair-themes

# 3. Rename Homebrew tap + update formula
gh api -X PATCH /repos/Snenjih/homebrew-nexum -f name=homebrew-labonair
# Then: clone homebrew-labonair, git mv Casks/nexum.rb Casks/labonair.rb
# Update bundle_id, app name, DMG URL pattern in formula, push
```

### Current State
Rename fully complete in the codebase. GitHub repo still named `Snenjih/nexum` — rename pending.

### What's Next
- Complete the 3 GitHub repo renames above
- Update tauri.conf.json updater URL if needed after main repo rename (already points to `Snenjih/labonair`)

---

## Previous Session: 2026-06-18 (Source Control System — Full Audit Fix Pass)

### What Was Done
Comprehensive audit of the source control system found 25 issues. All 25 fixed across 6 sequential subagents + 1 notification agent. `cargo check` ✅ · `tsc --noEmit` ✅

**Subagent A — Rust Critical Fixes** (`src-tauri/src/modules/git/mod.rs`):
- `run_git_merged` now checks exit code — push/pull/fetch errors no longer silently swallowed
- Remote branch detection fixed (`|| name.contains('/')` removed)
- All async commands wrapped with `tokio::task::spawn_blocking` via `run_git_sync`/`run_git_merged_sync` helpers
- `LC_ALL=C` + `GIT_TERMINAL_PROMPT=0` added to all git subprocess calls
- `git_abort` uses .git directory checks instead of blind try-all
- UTF-8 truncation uses `safe_truncate_utf8` helper
- `git_add_to_gitignore`/`git_add_to_exclude` validate paths with `canonicalize()` and strip newline injection

**Subagent B — Stash API** (`mod.rs`, `gitInvoke.ts`, `StashPanel.tsx`):
- Stash pop/apply/drop now accept `hash` instead of `index` — race condition fixed
- `find_stash_index_by_hash()` resolves index fresh at operation time
- `git_stash_push` adds `--include-untracked` by default
- Stash list uses NUL separators (`%x00`/`%x1e`) for robust parsing

**Subagent C — Frontend Store/Poll** (`useGitStatus.ts`, `BranchBar.tsx`, `BranchDropdown.tsx`, `sourceControlStore.ts`, `SourceControlPanel.tsx`, `NoRepoState.tsx`):
- `doRefresh` uses `Promise.allSettled` for all 5 fetches in parallel
- `isRefreshingRef` prevents overlapping poll cycles
- Poll interval bumped 2000ms → 3000ms
- `BranchBar` redundant `getCurrentBranch` subprocess removed (derives from `branchList` via `useMemo`)
- `currentBranch` single source of truth (set from `branchList.find(b => b.isCurrent)`)
- Stale `selectionMode` cleared on repo root change
- git-not-installed error shown in NoRepoState instead of generic "no repo"
- `tagsCollapsed` renamed to `remotesCollapsed` in BranchDropdown
- Recent commit messages migrated from localStorage to `tauri-plugin-store`

**Subagent D — Diff Virtualization** (`DiffViewer.tsx`, `SideBySideDiff.tsx`):
- Unified DiffViewer virtualized with `useVirtualizer` (ROW_HEIGHT=20, overscan=20)
- `parseDiffLines()` replaces JSX-building `renderDiffWithAnchors` — pure data layer
- `scrollToFile` uses `virtualizer.scrollToIndex`
- SideBySideDiff replaced with single-scroll-container virtualizer (rows rendered as flex pairs)
- Infinite scroll sync event loop eliminated

**Subagent E — Git Graph** (`types.ts`, `graphLayout.ts`, `GraphRail.tsx`, `GitGraphCanvas.tsx`, `useGitGraph.ts`, `GitGraphPane.tsx`):
- Hardcoded hex `LANE_COLORS` removed — replaced with `colorIndex: number` in types
- `GraphRail` and `GitGraphCanvas` use rgb/class lookup arrays (no hex literals)
- `buildGraphLayout` uses `laneMap: Map<string, number>` for O(1) parent lane lookup
- `useGitGraph` returns `lastRefreshedAt`; toolbar shows `RefreshAge` component (30s tick)

**Subagent F — Notifications** (`BranchBar.tsx`, `CommitForm.tsx`, `StashPanel.tsx`, `BranchDropdown.tsx`, `FileChangeItem.tsx`, `GitGraphPane.tsx`):
- All git errors wired to `useNotificationStore.getState().addNotification()`
- Success notifications for push/pull/fetch/commit/amend
- FileChangeItem previously-silent catch blocks now surface errors

### Current State
- Branch: `feat/source-control`
- `cargo check` ✅ · `tsc --noEmit` ✅
- All 6 commits on branch, NOT yet PR'd

### What's Next
- Manual testing: push/pull error display, stash operations, branch filtering, diff virtualization
- Create PR for this branch against main

### Blockers
- None

---

## Previous Session: 2026-06-16 (Source Control Feature Expansion — Full Implementation)

### What Was Done
Implemented a complete expansion of the Source Control feature via 5 sequential subagents. All `cargo check` ✅ and `tsc --noEmit` ✅ throughout.

**New Rust commands** (src-tauri/src/modules/git/mod.rs + lib.rs):
- Branch: `git_checkout_branch`, `git_create_branch`, `git_delete_branch`, `git_rename_branch`
- Stash: `git_stash_push`, `git_stash_list`, `git_stash_pop`, `git_stash_apply`, `git_stash_drop`
- Diff: `git_get_commit_diff`, `git_get_diff` extended with `ignore_whitespace` param
- Push: `git_push_force_with_lease`, `git_push_set_upstream`
- Tags: `git_get_tags`, `git_create_tag`, `git_delete_tag`, `git_push_tag`
- Other: `git_cherry_pick`

**New TypeScript types** (src/modules/source-control/types.ts):
- `StashEntry` interface
- `SelectionMode` discriminated union: `'file' | 'section' | 'all' | 'commit'`

**New components created:**
- `src/modules/source-control/components/BranchDropdown.tsx` — Popover with branch list, checkout, create, delete, remote branches, full tag management
- `src/modules/source-control/components/NewBranchDialog.tsx` — Dialog for creating branches with fromRef support
- `src/modules/source-control/components/StashPanel.tsx` — Collapsible stash list with apply/pop/drop actions
- `src/modules/source-control/components/SideBySideDiff.tsx` — Two-column diff view with scroll sync
- `src/modules/git-graph/components/CommitDiffPanel.tsx` — Full commit diff panel (360px, slide-in) with file nav

**Components significantly updated:**
- `BranchBar.tsx` — Branch name now opens BranchDropdown popover
- `CommitForm.tsx` — Force push (--force-with-lease) with AlertDialog, upstream detection prompt, recent message history
- `FileChangeList.tsx` — Section header click selects section for diff (toggleable)
- `SourceControlPanel.tsx` — "All Changes" button with count, StashPanel wired in
- `DiffViewer.tsx` — Major rewrite: dynamic header label, multi-file nav strip, side-by-side toggle, whitespace ignore toggle, conflict visualization (ours=purple, theirs=orange)
- `GitGraphCanvas.tsx` — ContextMenu on every commit row (View Changes, Checkout, Create Branch Here, Cherry-pick, Copy Hash)
- `GitGraphPane.tsx` — Checkout/cherry-pick/create-branch-from-commit workflows with AlertDialog confirms, CommitDiffPanel integration
- `CommitDetailPanel.tsx` — "View full diff" eye button added
- `sourceControlStore.ts` — Added branchList, stash, tags, recentMessages, currentBranch, selectionMode, diffViewMode, ignoreWhitespace
- `useGitStatus.ts` — Fetches branches/stash/tags on each refresh; diff loading handles all SelectionMode types

### Current State
- Branch: `feat/source-control`
- `cargo check` ✅ · `tsc --noEmit` ✅
- NOT committed yet — changes are unstaged

### What's Next
- Commit all changes with conventional commit
- Test all new features manually (branch checkout, stash, section diff, graph context menu)
- Consider a PR for this feature branch

### Blockers
- None

---

## Previous Session: 2026-06-04 (App.tsx Decomposition + Tooling)

### What Was Done
Decomposed `src/app/App.tsx` from 1370 → 181 lines into focused per-module hooks and components. Added Biome linting + knip dead-code detection. PR #73 open on branch `refactor/decompose-app-tsx-add-tooling`.

**New files created:**
- `src/lib/urls.ts` — `sameOrigin()` utility
- `src/app/CLAUDE.md` — architecture context for this directory
- `src/app/hooks/useAppBootstrap.ts` — all startup effects
- `src/app/hooks/useMenuBridge.ts` — Tauri menu:* event bridge
- `src/app/components/AppShell.tsx` — full layout tree
- `src/app/components/WorkspaceArea.tsx` — stacked tab stacks (React.memo)
- `src/app/components/SidebarContent.tsx` — sidebar panel
- `src/app/components/AiOverlays.tsx` — AI floating elements
- `src/app/components/CloseDialogs.tsx` — 3 confirmation dialogs
- `src/modules/session/useSessionLifecycle.ts` — restore/save/quit
- `src/modules/tabs/lib/useTabManagement.ts` — all tab/pane ops + refs
- `src/modules/statusbar/lib/useSidebar.ts` — sidebar panel state
- `src/modules/terminal/lib/usePreviewDetection.ts` — URL detection
- `src/modules/ai/lib/useAiLiveBridge.ts` — AI context + selection popup
- `src/modules/command-palette/hooks/usePaletteCallbacks.ts` — palette callbacks
- `src/modules/shortcuts/lib/useShortcutHandlers.ts` — global shortcuts
- `biome.json` — Biome linter config
- `knip.json` — dead-code config

**Tooling added:** `pnpm lint`, `pnpm format`, `pnpm check`, `pnpm knip`

**`tsc --noEmit` ✅ throughout all commits**

### Current State
- PR #73 open — awaiting review/merge
- Branch: `refactor/decompose-app-tsx-add-tooling`
- No Rust changes this session

### What's Next
- Merge PR #73 after review
- `labonair-themes` GitHub repo still needs to be created (community themes)
- Consider running `pnpm knip` to find further dead code to clean up

### Blockers
- None

---

## Previous Session: 2026-05-27 (Tab State → Zustand Migration)

### What Was Done
Completed the full `useTabs` → `useTabsStore` performance migration (plan: `~/.claude/plans/clever-juggling-zebra.md`). `tsc --noEmit` ✅

**New files created:**
- `src/modules/tabs/types.ts` — all types extracted from useTabs.ts
- `src/modules/tabs/store/tabsStore.ts` — Zustand store with 24 actions + selectors
- `src/modules/terminal/WorkspaceStack.tsx` — per-tab WorkspacePaneContainer subscribes to own tab ID
- `src/modules/sftp/SftpStack.tsx` — SFTP tab stack reads from store

**Files modified (all migrated to store):**
- `src/modules/editor/EditorStack.tsx` — `useShallow` selector, no tabs/activeId props
- `src/modules/editor/AiDiffStack.tsx` — same
- `src/modules/preview/PreviewStack.tsx` — same
- `src/modules/tabs/TabBar.tsx` — reads from store directly
- `src/modules/tabs/SidebarTabList.tsx` — reads from store directly
- `src/modules/header/Header.tsx` — React.memo, reads TabBar from store
- `src/modules/tabs/lib/useWorkspaceCwd.ts` — signature `(home)` only, reads from store
- `src/modules/command-palette/hooks/useTabCommands.ts` — reads from store
- `src/modules/command-palette/types.ts` — removed `tabs`, `activeTabId` from RegistryCallbacks
- `src/modules/session/capture.ts` — `captureAndSave()` no args, reads from store
- `src/modules/session/restore.ts` — `TabActions` has no `tabs` field, reads from store
- `src/modules/hosts/components/HostCard.tsx` — reads from store, no tabs prop
- `src/modules/hosts/components/HostListItem.tsx` — same
- `src/modules/hosts/components/HomeDashboard.tsx` — removed tabs prop
- `src/modules/tabs/index.ts` — exports useTabsStore + selectors
- `src/app/App.tsx` — complete rewrite: no useTabs(), menuHandlersRef pattern (menu registered once), subscribe() for session save/sessionSaveRef/appliedDiffs, getState() in all callbacks

**Key architectural changes:**
- Zustand v5: uses `useShallow` from `zustand/react/shallow` (not `shallow` as 2nd arg)
- Menu listeners: `menuHandlersRef` updated every render, effect registered once (empty deps) — eliminates 20+ re-registrations per tab switch
- `captureAndSave()` / `captureSnapshot()` are no-arg — read from store internally
- All callbacks in App.tsx use `useTabsStore.getState()` inside → stable references, fewer cascading rerenders

---

## Previous Session: 2026-05-24 (V1.1 Final Architecture Polish)

### What Was Done
Completed all 3 phases of `tasks/v1.1_final_architecture_polish.md`. `cargo check` ✅ · `tsc --noEmit` ✅

**Phase 1 — Editor Focus Restoration**
- Added `focus: () => void` to `EditorPaneHandle` type in `EditorPane.tsx`
- Added `focus` implementation in `useImperativeHandle`: calls `cmRef.current?.view.focus()`
- Updated `restoreFocus` callback in `App.tsx`

**Phase 2 — SFTP Error-Handling Purge**
- All `console.error` in `SftpContextMenu.tsx` and `SftpPane.tsx` replaced with `handleApiError`

**Phase 3 — Rust `LabonairError` Migration**
- All Tauri host/group commands now return `Result<T, LabonairError>`

---

### Current State
- `useTabs` migration complete — `tsc --noEmit` ✅
- `useTabs.ts` still exists but is no longer used by App.tsx (can be deleted in a future cleanup)
- No Rust changes this session

### What's Next
- Delete `src/modules/tabs/lib/useTabs.ts` (now dead code) and clean up re-exports in `tabs/index.ts`
- Functional testing: verify tab open/close, SSH, session restore, command palette, menu items
- The GitHub repo `Snenjih/labonair-themes` still needs to be created for community themes

### Blockers
- None
