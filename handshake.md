# Handshake — Session State

## Last Session: 2026-06-15 (Block Terminal — Warp-Style Feature Completion)

### What Was Done
Completed all remaining Warp-style block terminal features via parallel subagents. 21 files changed, 535 insertions, 109 deletions.

**Phase 1 — Unified Input (AiInputBar as terminal input):**
- `chatStore.ts` — added `sendTarget: "ai" | "terminal"`, `setSendTarget()`, `injectCommand()`
- `tabsStore.ts` — added `selectIsActiveBlockTerminal` selector, `blockDecorationRegistry`, `registerBlockDecorations()`, `getActiveBlockDecorations()`
- `tabs/index.ts` — exported new selector and registry functions
- `App.tsx` — auto-switch `sendTarget` effect + keyboard nav handlers wired
- `WorkspaceArea.tsx` — `shouldShowInput = panelOpen || isBlockTerminal` (always visible in block mode)
- `AiInputBar.tsx` — toggle button (AI/Terminal) + dynamic placeholder + terminal send path
- `composer.tsx` — terminal branch at start of `submit()` (routes to `injectCommand`)
- `BlockInputBar.tsx` — deleted (stub removed)
- `TerminalPane.tsx` / `SshTerminalPane.tsx` — simplified to `div.relative.h-full` (no BlockInputBar)

**Phase 2 — Block UI:**
- `BlockChrome.tsx` — fully rewritten: collapse/expand chevron, pulsing running indicator, live duration ticker, re-run button, selection state, hover toolbar
- `BlockOverlay.tsx` — `selectedId`, `collapsedIds` state; `handleRerun` via `injectCommand`; `BlockSearchBar` gets `block` + `decorations` + `term`
- `types.ts` — exported `HEADER_HEIGHT_PX = 24`

**Phase 3 — Keyboard Navigation:**
- `blockDecorations.ts` — `getAdjacentBlock()`, `getViewportY()`, `scrollToBlock()` methods
- `shortcuts.ts` — `"block.prev"` (Ctrl+Up), `"block.next"` (Ctrl+Down)
- `useShortcutHandlers.ts` — `navigatePrevBlock` / `navigateNextBlock` options wired
- `useTerminalSession.ts` — `registerBlockDecorations()` call on init
- `SshTerminalPane.tsx` — `registerBlockDecorations()` call on block mode init

**Phase 5 — Block-Scoped Search:**
- `BlockSearchBar.tsx` — custom `findMatches()` on `decorations.readBlock()`, match counter `"x/n"`, `term.scrollToLine()` navigation, no-match red border

**Phase 6 — Quality:**
- `blockDecorations.ts` — `getCssVar()` replaces hardcoded HEX colors; `hydrateFromMeta()` now creates real xterm markers
- `store.ts` — `blockTerminalScrollbackPersistence` default → `"metadata"`
- `definitions.ts` — new "Block Terminal" settings section (9 settings)

**Verification:** `pnpm exec tsc --noEmit` ✅ (no errors)

### Current State
- Branch: `feat/block-terminals`
- All block terminal features implemented and type-safe
- Changes committed (see commit below)

### What's Next
- Manual testing: local block terminal (⌘⇧T), SSH block terminal, settings panel
- Optional: keyboard shortcut `Ctrl+\`` to toggle send target (planned in Phase 1.5 but not implemented)
- Future: full positional hydrateFromMeta rendering for scrollback block history

### Blockers
- None

---

## Previous Session: 2026-06-07 (Block Terminal Feature — Full Implementation)

### What Was Done
Implemented a full Warp-style "block terminal" mode across local and SSH terminals. Each command + output is grouped into a visual block with header chrome (command, cwd, duration, exit code badge, toolbar). Implemented via 6 sequential subagents.

**New files created:**
- `src/modules/terminal/block/lib/types.ts` — BlockMeta, BlockMode, PositionedBlock, VisibleBlocks, BlockChromeSettings
- `src/modules/terminal/block/lib/blockDecorations.ts` — BlockDecorations class (OSC 133 parsing via xterm parser API, xterm IMarker management, viewport calculation)
- `src/modules/terminal/block/lib/modeMachine.ts` — ModeMachine class (alt-screen detection via CSI ?1049h/?1049l)
- `src/modules/terminal/block/lib/blockPersistence.ts` — saveBlockMeta/loadBlockMeta (Tauri invoke)
- `src/modules/terminal/block/lib/sshInjectionScript.ts` — buildOsc133InjectionScript (bash/zsh/auto detection), waitForFirstOsc133
- `src/modules/terminal/block/BlockOverlay.tsx` — main overlay (RAF loop, subscribe pattern)
- `src/modules/terminal/block/BlockChrome.tsx` — per-block header/divider/toolbar (Copy, Search, AI attach)
- `src/modules/terminal/block/StickyHeader.tsx` — sticky running-block header with motion animations
- `src/modules/terminal/block/BlockSearchBar.tsx` — in-block search via SearchAddon
- `src/modules/terminal/block/index.ts` — barrel export
- `src-tauri/src/modules/pty/block_meta.rs` — block_meta_save, block_meta_load, block_meta_cleanup Tauri commands

**Files modified:**
- `src/modules/tabs/types.ts` — `terminalMode?: "standard" | "block"` on TerminalSessionData
- `src/modules/tabs/store/tabsStore.ts` — newBlockTerminalTab(), newSshTab() reads terminal_mode from host
- `src/modules/tabs/lib/tabUtils.tsx` — "Block Terminal" menu item (⌘⇧T)
- `src/modules/tabs/lib/useTabManagement.ts` — openNewBlockTerminalTab()
- `src/modules/tabs/TabBar.tsx` + `SidebarTabList.tsx` — onNewBlockTerminal prop
- `src/modules/header/Header.tsx` + `src/app/components/AppShell.tsx` + `SidebarContent.tsx` — prop threading
- `src/modules/shortcuts/shortcuts.ts` — "tab.newBlockTerminal" ⌘⇧T shortcut
- `src/modules/shortcuts/lib/useShortcutHandlers.ts` — shortcut handler wired
- `src/app/App.tsx` — openNewBlockTerminalTab passed to handlers
- `src/modules/terminal/lib/useTerminalSession.ts` — block mode init (BlockDecorations, ModeMachine, persistence)
- `src/modules/terminal/TerminalPane.tsx` + `WorkspacePane.tsx` — BlockOverlay render
- `src/modules/terminal/SshTerminalPane.tsx` — OSC 133 injection after session_established + BlockOverlay
- `src/modules/hosts/types.ts` — terminal_mode on Host, CreateHostPayload
- `src/modules/hosts/components/HostFormPanel.tsx` — Terminal Mode toggle in SSH tab
- `src/modules/settings/store.ts` — 9 new blockTerminal* preferences + setters
- `src/settings/sections/TerminalSection.tsx` — "Block Terminal" settings subsection
- `src-tauri/src/modules/hosts/mod.rs` — terminal_mode field on Host struct
- `src-tauri/src/modules/hosts/db.rs` — migration + SELECT/INSERT/UPDATE query updates
- `src-tauri/src/modules/pty/mod.rs` — pub mod block_meta
- `src-tauri/src/lib.rs` — register block_meta commands, startup cleanup spawn

**Key architectural decisions:**
- Overlay approach: xterm.js untouched, block chrome is a `position: absolute` React layer
- OSC 133 already emitted by local shell init scripts (zshrc.zsh, bashrc.bash) — no changes needed there
- SSH: inject PROMPT_COMMAND/precmd setup script via ssh_pty_write after session_established (600ms delay, 3s timeout)
- Alt-screen: ModeMachine detects CSI ?1049h/?1049l, hides overlay when mode === "alt"
- Block metadata: optionally persisted as per-session JSON in app_local_data_dir/block_meta/
- Known limitation: hydrateFromMeta() calls notify() but doesn't re-render previous blocks visually (positional rendering not implemented) — this is a future iteration item

**Verification:** `pnpm exec tsc --noEmit` ✅ `cargo check` ✅ `cargo clippy` ✅

### Current State
- Branch: `main` (changes uncommitted — ready to commit)
- Block terminal fully implemented and type-safe
- All 6 agents completed successfully

### What's Next
- Commit the block terminal feature
- Test manually: local block terminal (⌘⇧T), SSH block terminal (set in host settings), settings panel
- Future: implement full hydrateFromMeta() positional rendering for scrollback block history

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
