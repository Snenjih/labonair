# Command Palette — Developer Context

**Module:** `src/modules/command-palette/`
**Shortcut:** `Cmd+K` / `Cmd+Shift+P`
**Committed:** feat/command-pallete branch (441e160)

---

## Architecture in 30 Seconds

```
App.tsx
  └── <CommandPalette callbacks={...} activeTabKind={...} activeContext={...} restoreFocus={...} />
        └── useCommandRegistry(cb, activeTabKind, activeContext)
              ├── useSystemCommands(cb)       → root page actions
              ├── useLayoutCommands(cb, kind) → root page actions (context-filtered)
              ├── useHostCommands(cb)         → root action + "hosts" sub-page
              └── useSettingsCommands()       → root actions + "themes" + "mode" sub-pages
```

**State:** `useCommandStore` (Zustand) — only holds `isOpen`. Toggle via `toggle()`.

**Page Stack:** `useState<string[]>(["root"])` inside `CommandPalette.tsx`. Sub-menus are just pages pushed onto this stack. The registry returns `Record<string, CommandPage>` and the active page is always `pages[pages.length - 1]`.

---

## Adding a New Root-Level Command

The fastest path. Open (or create) the relevant provider hook and add an entry to its `actions` array.

**Example — add "Reload Window" to `useSystemCommands.ts`:**

```typescript
// src/modules/command-palette/hooks/useSystemCommands.ts

import { Refresh01Icon } from "@hugeicons/core-free-icons";

// Inside the returned page's actions array:
{
  id: "system.reload",
  title: "Reload Window",
  section: "Application",           // groups visually under this heading
  icon: createElement(HugeiconsIcon, { icon: Refresh01Icon, strokeWidth: 2, className: "size-4" }),
  perform: () => window.location.reload(),
},
```

That's it. No registration needed anywhere else.

---

## Adding a Context-Aware Command

Use the `contexts` field. If omitted, the command shows globally. If set, it only appears when the active tab matches.

```typescript
{
  id: "editor.format",
  title: "Format Document",
  section: "Editor",
  contexts: ["editor"],   // "terminal" | "editor" | "sftp" | "home"
  perform: () => cb.formatDocument(),
},
```

**How context is derived in App.tsx:**
```typescript
const activeContext = useMemo(() => {
  if (activeTab?.kind === "workspace") return "terminal";
  if (activeTab?.kind === "editor")    return "editor";
  if (activeTab?.kind === "sftp")      return "sftp";
  if (activeTab?.kind === "home")      return "home";
  return null;
}, [activeTab]);
```

The registry filters with: `a.contexts.includes(activeContext)` — if `contexts` is undefined, the action always passes.

---

## Adding a Sub-Menu (New Page)

Two things are needed: a **root action** that navigates to the page, and the **page definition** itself. Both are returned from the same hook and merged in `useCommandRegistry`.

### Step 1 — Create or extend a hook

```typescript
// src/modules/command-palette/hooks/useDockerCommands.ts

export function useDockerCommands(cb: RegistryCallbacks): {
  rootAction: CommandAction;
  dockerPage: CommandPage;
} {
  const containers = useDockerStore((s) => s.containers); // your own store

  const rootAction: CommandAction = {
    id: "docker.open",
    title: "Docker Containers...",
    section: "Tools",
    icon: createElement(HugeiconsIcon, { icon: TerminalIcon, strokeWidth: 2, className: "size-4" }),
    subPageId: "docker",   // ← this is the key: no perform(), just subPageId
  };

  const dockerPage: CommandPage = {
    id: "docker",
    searchPlaceholder: "Search containers...",
    actions: containers.map((c) => ({
      id: `docker.${c.id}`,
      title: c.name,
      subtitle: c.status,
      section: "Containers",
      perform: () => cb.openDockerTerminal(c.id),
    })),
  };

  return { rootAction, dockerPage };
}
```

### Step 2 — Register in `useCommandRegistry.ts`

```typescript
// src/modules/command-palette/useCommandRegistry.ts

import { useDockerCommands } from "./hooks/useDockerCommands";

export function useCommandRegistry(...) {
  // ... existing hooks ...
  const { rootAction: dockerRootAction, dockerPage } = useDockerCommands(cb);

  return useMemo(() => {
    const rootActions = [
      ...filterByContext(systemPage.actions),
      ...filterByContext(layoutPage.actions),
      hostRootAction,
      dockerRootAction,      // ← add root action here
      ...filterByContext(settingsRootActions),
    ];

    return {
      root: { id: "root", searchPlaceholder: "Search commands...", actions: rootActions },
      hosts: hostsPage,
      themes: themesPage,
      mode: appModePage,
      docker: dockerPage,    // ← add page here
    };
  }, [...deps, dockerRootAction, dockerPage]);
}
```

**Rule:** The `subPageId` in the root action must exactly match the key in the returned registry object.

---

## Adding a Callback That Needs App-Level State

If a new command needs to call a function that only exists in `App.tsx` (e.g., `newDockerTab`), add it to `RegistryCallbacks` in `types.ts`, pass it from `App.tsx` via `paletteCallbacks`, and use it inside the hook.

### 1. Extend `types.ts`

```typescript
// src/modules/command-palette/types.ts
export type RegistryCallbacks = {
  // ... existing ...
  openDockerTerminal: (containerId: string) => void;  // ← add
};
```

### 2. Pass from `App.tsx`

```typescript
// src/app/App.tsx  — inside the paletteCallbacks useMemo
const paletteCallbacks = useMemo<RegistryCallbacks>(() => ({
  // ... existing ...
  openDockerTerminal: (id) => newDockerTab(id),
}), [...deps, newDockerTab]);
```

### 3. Use in hook

```typescript
perform: () => cb.openDockerTerminal(c.id),
```

---

## Reactive `rightLabel` (Toggle State)

For settings toggles that show ON/OFF, the hook **must** subscribe to the Zustand store directly so the label re-renders when state changes. Don't read the value inside `perform` — read it at hook render time.

```typescript
// ✅ Correct — reactive
const wordWrap = usePreferencesStore((s) => s.editorWordWrap);
{
  id: "settings.word-wrap",
  title: "Toggle: Editor Word Wrap",
  rightLabel: wordWrap ? "ON" : "OFF",   // re-renders on store change
  perform: () => void setEditorWordWrap(!wordWrap),
}

// ❌ Wrong — stale value after first render
{
  rightLabel: usePreferencesStore.getState().editorWordWrap ? "ON" : "OFF",
}
```

---

## Type Reference

```typescript
// types.ts

type CommandContext = "terminal" | "editor" | "sftp" | "home";

type CommandAction = {
  id: string;           // unique, kebab-case
  title: string;        // shown in list
  subtitle?: string;    // right-aligned small text (e.g., host IP)
  icon?: ReactNode;     // HugeiconsIcon element
  shortcut?: string[];  // display only — e.g. ["⌘", "D"]
  section: string;      // group heading in the list
  contexts?: CommandContext[];  // omit = always show
  perform?: () => void; // executed on select (close palette first!)
  subPageId?: string;   // push this page instead of calling perform
  rightLabel?: string;  // "ON" | "OFF" | "active" etc.
};

type CommandPage = {
  id: string;
  searchPlaceholder: string;
  actions: CommandAction[];
};
```

---

## File Map

```
src/modules/command-palette/
├── types.ts                          ← CommandAction, CommandPage, RegistryCallbacks
├── useCommandStore.ts                ← Zustand: isOpen, open, close, toggle
├── useCommandRegistry.ts             ← aggregates all hooks → Record<pageId, CommandPage>
├── CommandPalette.tsx                ← UI: Dialog + cmdk, page stack, animations
└── hooks/
    ├── useSystemCommands.ts          ← Settings, Shortcuts, AI actions
    ├── useLayoutCommands.ts          ← New Tab, Split, Close Pane
    ├── useHostCommands.ts            ← SSH/SFTP host connections (sub-page: "hosts")
    └── useSettingsCommands.ts        ← Theme/Mode toggles (sub-pages: "themes", "mode")
```

---

## Gotchas

- **`perform` vs `subPageId`** are mutually exclusive. If both are set, `subPageId` wins (palette navigates, never executes `perform`).
- **Action execution order:** `CommandPalette.tsx` always calls `handleClose()` first, then `requestAnimationFrame(() => action.perform!())`. This lets React unmount the Dialog before the new UI (e.g., a modal) grabs focus. Never call `perform` synchronously if it opens another dialog.
- **cmdk filter** is set to a simple `includes` check. The `value` passed to cmdk per item is `"${title} ${subtitle} ${section}"` — so users can search by any of those three fields.
- **ESC is intercepted** on the `DialogPrimitive.Content` `onKeyDown` before cmdk or Radix sees it. The hierarchy: clear search → pop page → close. If you add nested dialogs, make sure they don't bubble ESC up to the palette.
- **`Cmd+K` vs `Cmd+Shift+P`** are both matched in a single shortcut entry (`command.palette`) in `shortcuts.ts`. Shortcuts dialog is now `Cmd+?`.
