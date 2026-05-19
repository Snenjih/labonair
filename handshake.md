# Handshake — Session State

## Last Session: 2026-05-18

### What Was Done
- Implemented **Terminal Split Panes (Recursive Workspace)** — infinite horizontal/vertical split panes for both local and SSH terminals.

  **Phase 1: Rust Backend Refactoring**
  - Renamed all `tab_id` parameters to `session_id` across:
    - `src-tauri/src/modules/ssh/{mod.rs,pty.rs,client.rs,sftp.rs,exec.rs}`
    - `src-tauri/src/modules/sftp/{worker.rs,commands.rs,mod.rs}`
  - Updated all event payload JSON field names from `"tab_id"` to `"session_id"` in emitted events: `ssh_pty_output`, `ssh_connect_log`, `known_hosts_warning`, `auth_required`, `passphrase_required`, `session_established`
  - `cargo check` ✅

  **Phase 2: TypeScript Data Model (`useTabs.ts`)**
  - Removed `TerminalTab` and `SshTerminalTab` types
  - Added new types: `PaneNode`, `PaneSplit`, `PaneLeaf`, `PaneDirection`, `TerminalSessionData`, `WorkspaceTab`
  - All terminal tabs (local + SSH) are now `kind: "workspace"` with a binary tree layout
  - Added new useTabs actions: `setActivePaneId`, `updatePaneSessionCwd`, `splitPane`, `closePane`
  - Updated `useWorkspaceCwd` to traverse WorkspaceTab session structure

  **Phase 3: Shortcuts & Tree Logic**
  - Added shortcuts `pane.splitRight` (⌘D) and `pane.splitDown` (⌘⇧D)
  - `⌘W` now closes the active pane first; closes tab only if it's the last pane
  - Tree manipulation: `splitPane` replaces leaf with a split node + clones session; `closePane` promotes sibling to replace parent split

  **Phase 4: UI Rendering**
  - Created `src/modules/terminal/WorkspacePane.tsx` — recursive component using `react-resizable-panels`
  - Pane chrome: tiny h-6 header showing session title/cwd + hoverable X close button
  - Focus indicator: `ring-1 ring-inset ring-accent` on active pane
  - Click-to-focus: clicking inside a pane sets `activePaneId`
  - `SshTerminalPane` refactored: now accepts `sessionId: string` + `session: TerminalSessionData` props instead of `tab: SshTerminalTab`
  - `TerminalPane.tsx`: changed `tabId` from `number` to `string` (UUID-based session IDs)
  - `App.tsx` fully rewired: `terminalRefs` is now `Map<string, TerminalPaneHandle>` (keyed by session_id), AI context bridge updated
  - All SFTP invoke calls updated to use `sessionId` parameter key

  **Fixes:**
  - `TabBar.tsx`: Updated `labelFor` and `TabIcon` to handle `workspace` kind
  - `HostCard.tsx`: Updated `hasActiveSshTab` detection for new WorkspaceTab structure
  - `transferStore.ts`: Updated `TransferJob.session_id` field name
  - `SshLoadingScreen.tsx`: Updated all event payload field refs from `tab_id` → `session_id`
  - `tsc --noEmit` ✅

---

## Session: 2026-05-18 (Bug Fix Round)

### What Was Fixed

**SSH/SFTP connection error** (`fix(ssh): rename SshLoadingScreen tabId prop to sessionId`)
- `SshLoadingScreen` props interface still had `tabId: string`; after the refactor `SshTerminalPane` passed `sessionId`, making `tabId` undefined → invoke failed
- Renamed prop + all internal refs in `SshLoadingScreen.tsx`; fixed a third call site in `SftpPane.tsx`

**Tab bar close requiring multiple clicks** (`fix(terminal): fix tab close …`)
- `handleClose` in `App.tsx` was calling `closePane` (closes one pane) instead of `disposeTab` for workspace tabs
- Fixed to always call `disposeTab(id)` for workspace tabs from the tab bar; individual pane X buttons still call `closePane` directly

**Ghost empty panels after pane close** (same commit)
- Root cause: `replaceNode` in `useTabs.ts` only matched LEAF nodes (`type === "pane"`), never split nodes
- When `closePane` called `replaceNode(layout, parentSplit.id, sibling)`, the split node was silently skipped → sessions dict updated but layout unchanged → ghost `null` panels
- Fix: match by `id` first, regardless of node type

**Terminal remount on every split/close — history loss** (`fix(terminal): implement flat terminal layer`)
- Root cause: `TerminalPane` lived inside `ResizablePanelGroup > ResizablePanel`; when layout changed (split or close), component changed depth in React tree → unmounted → new PTY opened, history lost
- Rewrote `WorkspacePane` with two-layer architecture:
  - Layer 1 (z-10, `pointer-events-none`): transparent `ResizablePanelGroup` slot tree — sizing only, no terminals
  - Layer 2 (z-0): flat list of absolutely-positioned terminals synced to slot rects via `ResizeObserver`
  - `key={paneId}` is always at same React depth → never remounts

**Terminals not clickable after flat layer refactor** (`fix(terminal): fix terminal click interactivity`)
- `ResizablePanelGroup`/`ResizablePanel` in the slot tree (z-10) were intercepting all pointer events
- Fix: `pointer-events-none` on slot tree wrapper div; `pointer-events-auto` on `ResizableHandle` so drag-resize still works

**Close button not visible** (same commit as tab close fix)
- Changed from `opacity-40 text-foreground/60` to `text-muted-foreground hover:text-foreground hover:bg-destructive/20`

**Pane header/footer as optional settings** (two commits)
- Added `terminalShowPaneHeader: boolean` (default `false`) — toggles the h-6 per-pane label bar
- Added `terminalShowPaneFooter: boolean` (default `false`) — toggles the `pb-2` bottom margin on the workspace wrapper
- Both have toggles in Settings → Terminal → Layout
- Pref wired into `WorkspacePane.tsx` (header) and `App.tsx` (footer)

**⌘⇧W shortcut to close active pane** (`feat(terminal): add ⌘⇧W shortcut`)
- Added `pane.close` shortcut id; `tab.close` match guarded with `!e.shiftKey` to prevent double-firing

**Accent ring stripe at bottom in single-pane view** (`fix(terminal): only show active pane ring when multiple panes exist`)
- `ring-1 ring-inset ring-accent` was always applied; with footer padding removed the bottom ring edge was visible as a stripe
- Ring now only rendered when `Object.keys(tab.sessions).length > 1`

### Current State
- All 7 original bugs fixed + 2 follow-up fixes applied
- Shortcuts: ⌘D (split right), ⌘⇧D (split down), ⌘⇧W (close pane), ⌘W (close tab)
- SSH and SFTP connections work correctly
- Terminal history survives split/close operations (no remounts)
- Settings → Terminal → Layout: "Show pane headers" + "Show pane footer" toggles (both default off)
- `tsc --noEmit` ✅

### What's Next
- The GitHub repo `Snenjih/nexum-themes` still needs to be created for community themes
- (Optional) Add pane navigation shortcuts (⌘← / ⌘→ to cycle active pane)
- (Optional) Persist split layout across app restarts

### Blockers
- None
