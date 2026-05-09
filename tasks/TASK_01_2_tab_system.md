# Task 01.2 — Tab System Extension & Home View Setup
**Phase:** 1 — Rebranding & Foundation
**Status:** in_progress
**Priority:** Critical (Prepares UI for new features)

## Background & Context
Terax relies on a `Tab` union type containing `terminal`, `editor`, `preview`, and `ai-diff`. Nexum introduces three new core tab types: `home` (Host Manager), `ssh-terminal`, and `sftp`.
Since Nexum is a remote workspace, the app should boot into the `home` tab instead of a local terminal.

## Work Instructions

### 1. Extend the Tab Union in `useTabs.ts`
Open `src/modules/tabs/lib/useTabs.ts`.
- Export a new type `HomeTab = { id: number; kind: "home"; title: string; }`.
- Export a new type `SftpTab = { id: number; kind: "sftp"; title: string; hostId: string; }`.
- Export a new type `SshTerminalTab = { id: number; kind: "ssh-terminal"; title: string; hostId: string; cwd?: string; }`.
- Add them to the exported `Tab` union type.
- Modify the initial state of the `useState` hook for `tabs`: Instead of `kind: "terminal"`, initialize with `[{ id: 1, kind: "home", title: "Home" }]`.

### 2. Add Helper Methods in `useTabs.ts`
- Add `openHomeTab()`: Checks if a `home` tab exists; if so, selects it. If not, creates one and selects it.
- Ensure the `updateTab` method handles the new types without crashing (they generally don't need special update logic yet, but TypeScript must be satisfied).

### 3. Update `TabBar.tsx` UI
Open `src/modules/tabs/TabBar.tsx`.
- In `TabIcon()`, add visual rules for the new tabs:
  - `home`: Use `HugeiconsIcon` with `Home03Icon` (or similar).
  - `sftp`: Use `Folder01Icon` or a network folder icon.
  - `ssh-terminal`: Use `ComputerTerminal02Icon`.
- In `labelFor()`, return `t.title` for `home`, `ssh-terminal`, and `sftp`.

### 4. Create Placeholders in `App.tsx`
Open `src/app/App.tsx`.
- Add local derived booleans: `const isHomeTab = activeTab?.kind === "home";`, `const isSshTab = activeTab?.kind === "ssh-terminal";`, `const isSftpTab = activeTab?.kind === "sftp";`.
- Inside the main workspace `<div className="relative min-h-0 flex-1">`, add three new `div` blocks matching the `invisible pointer-events-none` pattern used by `TerminalStack`.
- Inside these divs, place simple placeholder text for now (e.g., `<div className="flex h-full items-center justify-center text-muted-foreground">Home Dashboard Placeholder</div>`).

## Files to Modify
- `src/modules/tabs/lib/useTabs.ts`
- `src/modules/tabs/TabBar.tsx`
- `src/app/App.tsx`

## Expected Outcome
When launching the app, it opens directly into a single "Home" tab displaying the placeholder text. The TabBar renders the correct icon. Existing local terminals can still be opened via the `+` menu. No TypeScript errors exist.

## Additional Information
- **Important**: Do NOT implement the actual Home Dashboard UI or SQLite logic yet. This task strictly prepares the routing/tab state infrastructure.
