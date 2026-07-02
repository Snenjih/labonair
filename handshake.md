# Handshake — Session State

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
