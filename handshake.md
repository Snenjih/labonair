# Handshake — Session State

## Last Session: 2026-06-19 (Anthropic Claude Subscription Provider)

### What Was Done
Added a new `"anthropic-subscription"` AI provider that authenticates via the locally installed Claude CLI (OAuth) instead of an API key.

**Rust** (`src-tauri/src/modules/claude_auth.rs` — new):
- `ai_claude_credentials_read` command: reads `~/.claude/.credentials.json` (Claude Code) or `~/.config/anthropic/credentials/default.json` (ant CLI)
- Registered in `modules/mod.rs` and `lib.rs`

**Frontend** (`src/modules/ai/`):
- `config.ts`: new `"anthropic-subscription"` ProviderId, 3 subscription models (`claude-sub-haiku/sonnet/opus`), `apiModelId` field on ModelInfo, updated KEYLESS_PROVIDERS + CLOUD_PROVIDER_IDS
- `lib/keyring.ts`: added `"anthropic-subscription": null` to EMPTY_PROVIDER_KEYS
- `lib/agent.ts`: `buildWithSubscriptionAuth()` helper that invokes Tauri command and creates `createAnthropic({ authToken, headers: { "anthropic-beta": "oauth-2025-04-20" } })`. Both `buildLanguageModel` and `buildLanguageModelFromInstance` exit early for this provider.
- `components/ModelPicker.tsx`: icon map updated
- `settings/components/ProviderIcon.tsx`: icon map updated
- `settings/components/ProviderInstanceCard.tsx`: special UI for subscription (live connection status pill instead of API key input)

**Verification**: `cargo check` ✅ · `tsc --noEmit` ✅

### Current State
- Branch: `main`
- All changes uncommitted (staged, ready to commit)
- `cargo check` ✅ · `tsc --noEmit` ✅

### What's Next
- Commit changes
- Test manually: add "Claude Subscription" provider in Settings → AI, verify connection status shows correctly, try chatting with a subscription model
- Edge case: what happens when the OAuth token is expired (user hasn't run `claude` recently) — should show clear error message

### Blockers
- None

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
- `nexum-themes` GitHub repo still needs to be created (community themes)
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

**Phase 3 — Rust `NexumError` Migration**
- All Tauri host/group commands now return `Result<T, NexumError>`

---

### Current State
- `useTabs` migration complete — `tsc --noEmit` ✅
- `useTabs.ts` still exists but is no longer used by App.tsx (can be deleted in a future cleanup)
- No Rust changes this session

### What's Next
- Delete `src/modules/tabs/lib/useTabs.ts` (now dead code) and clean up re-exports in `tabs/index.ts`
- Functional testing: verify tab open/close, SSH, session restore, command palette, menu items
- The GitHub repo `Snenjih/nexum-themes` still needs to be created for community themes

### Blockers
- None
