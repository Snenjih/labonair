# src/app — Architecture Context

This directory is the top-level wiring layer of the Nexum app. It owns no feature logic — it only composes modules.

## File Overview

```
src/app/
├── App.tsx              (181 lines) — pure hook wiring + single <AppShell> return
├── hooks/
│   ├── index.ts
│   ├── useAppBootstrap.ts   — all startup effects (prefs, keybinds, API keys, hydration, errors)
│   └── useMenuBridge.ts     — Tauri menu:* event listeners (registered once, handlers always current via ref)
└── components/
    ├── index.ts
    ├── AppShell.tsx         — full layout tree (ThemeProvider, Header, sidebar, workspace, overlays)
    ├── SidebarContent.tsx   — ResizablePanel with FileExplorer / SidebarTabList / SnippetsPanel
    ├── WorkspaceArea.tsx    — stacked tab stacks (terminal, editor, preview, ai-diff, home, sftp)
    ├── AiOverlays.tsx       — AgentRunBridge + AnimatePresence (AiMiniWindow, SelectionAskAi)
    └── CloseDialogs.tsx     — 3 AlertDialog modals (save untitled, close dirty, close terminal)
```

## App.tsx Structure

App.tsx is intentionally thin — 181 lines of hook calls and prop wiring:

1. **Stable store actions** — destructured once from `useTabsStore.getState()` (never cause rerenders)
2. **Bootstrap hooks** — `useAppBootstrap()` → `{keysLoaded, apiKeys, home}`
3. **Session hook** — `useSessionLifecycle()` → `{sessionRestored, prefsHydrated}`
4. **`useWorkspaceCwd(home)`** — MUST run before `useTabManagement` (provides `inheritedCwdForNewTab`)
5. **`useSidebar()`** — sidebar panel state
6. **`useTabManagement({ home, inheritedCwdForNewTab })`** — all tab/pane ops + refs
7. **`usePreviewDetection(tabs.activeDetectedUrl)`** — detects local dev server URLs from terminal output
8. **Reactive store subscriptions** — only render-relevant values (panelOpen, prefs)
9. **`useAiLiveBridge({...})`** — AI context callbacks + selection popup
10. **`usePaletteCallbacks({...})`** — command palette RegistryCallbacks + activeContext
11. **`useMenuBridge({...})`** — wires Tauri menu events to app actions
12. **`useShortcutHandlers({...})`** — registers global keyboard shortcuts
13. **`show_main_window` effect** — waits for `prefsHydrated && keysLoaded && sessionRestored`
14. **Single `<AppShell>` return** — passes actions/prefs/ctrl/tabs/sidebar/ai/palette as prop groups

## Hook Location Convention

Hooks live in their respective module's `lib/` (or `hooks/`) folder — NOT in `src/app/hooks/`:

| Hook | Location |
|---|---|
| `useSessionLifecycle` | `src/modules/session/` |
| `useTabManagement` | `src/modules/tabs/lib/` |
| `useSidebar` | `src/modules/statusbar/lib/` |
| `usePreviewDetection` | `src/modules/terminal/lib/` |
| `useAiLiveBridge` | `src/modules/ai/lib/` |
| `usePaletteCallbacks` | `src/modules/command-palette/hooks/` |
| `useShortcutHandlers` | `src/modules/shortcuts/lib/` |

Only truly app-level hooks without a module home live in `src/app/hooks/`:
- `useAppBootstrap` — bootstraps everything (no single module owns it)
- `useMenuBridge` — bridges Tauri menu events (no dedicated menu module)

## Key Patterns

### menuHandlersRef (in useMenuBridge)
`menuHandlersRef.current = { ... }` runs every render intentionally — no `useMemo`. This keeps handlers always current without re-registering the Tauri `listen()` calls (which are registered once with `[]` deps).

### show_main_window
The window is hidden on startup and shown only once `prefsHydrated && keysLoaded && sessionRestored` are all true. This prevents flash-of-unstyled-content and ensures session restore completes before the user sees anything.

### AppShell prop groups
Props to AppShell are organized into 4 groups to keep the call-site readable:
- `actions` — stable store action functions
- `prefs` — render-affecting preference values
- `ctrl` — runtime control state (home, explorerRoot, hasComposer, etc.)
- `tabs`, `sidebar`, `ai`, `palette` — hook return objects passed through directly

### Zustand access patterns
- **Stable refs:** `useTabsStore.getState()` in callbacks (no rerender on change)
- **Reactive:** `useTabsStore(selector)` for values needed at render time
- **`useShallow`:** for array/object selectors to prevent unnecessary rerenders

## Adding a New App-Level Feature

1. If the feature belongs to an existing module (tabs, ai, shortcuts, etc.) → add a hook in that module's `lib/` folder and export from its `index.ts`
2. If it's truly cross-cutting → add a hook in `src/app/hooks/`
3. Wire it up in `App.tsx` following the existing hook call order
4. If it produces JSX → add a component in `src/app/components/` and include it in `AppShell`
