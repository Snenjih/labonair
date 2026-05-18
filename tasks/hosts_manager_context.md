# Host Manager & TitleBar Extensions Context
**Project:** Nexum (Hard-fork of Terax)
**Purpose:** This document defines the exact layout, UI/UX, and data flow for the "Home" Tab (Host Manager) and the TitleBar quick-connect dropdowns. It heavily draws inspiration from premium SSH clients like Termius, adapted to our minimalist, keyboard-friendly aesthetic.

## 1. TitleBar "+" Dropdown Extension

### 1.1 Concept
The existing "New Tab" (`+`) dropdown in the Terax TitleBar must be expanded. Power users need to open connections instantly without navigating back to the Home tab.

### 1.2 UI Implementation
Use `shadcn`'s `DropdownMenuSub`, `DropdownMenuSubTrigger`, and `DropdownMenuSubContent` to create nested menus.
- **Top Level Items:**
  - `New Local Terminal` (⌘T)
  - `New Editor` (⌘E)
  - `New Preview` (⌘P)
  - `--- Separator ---`
  - `SSH Connections ➜` (Sub-menu)
  - `SFTP Connections ➜` (Sub-menu)

### 1.3 Data Binding
- The sub-menus must map over the hosts available in `useHostsStore`.
- **Item Design:** Each host item in the sub-menu displays the OS/Server icon (e.g., Raspberry Pi, Linux, Ubuntu icon from `hugeicons`), the Host Name, and a faint `user@ip` subtitle.
- **Action:** Clicking a host in the SSH sub-menu invokes `addTab('ssh-terminal', host.id)`. Clicking one in the SFTP sub-menu invokes `addTab('sftp', host.id)`.

---

## 2. The Host Manager (Home Tab)

### 2.1 Concept & Layout Strategy
The `HomeTab` (`kind: "home"`) is a dedicated workspace tab. It uses a **Master-Detail Layout** (similar to Termius).
- **Left/Main Area (Master):** Takes up the remaining flexible width. Shows the search bar, toolbars, and grids of Groups and Hosts.
- **Right Sidebar (Details/Inspector):** Fixed width (e.g., `w-80` or `w-96`). It only appears when a Host or Group is actively selected. It completely replaces the previously discussed "Slide-out Drawer" concept.

### 2.2 Left Area: Master View
- **Top Search Bar:** A full-width search input (`shadcn Input`) at the very top: "Find a host or ssh user@hostname...".
- **Action Toolbar:** 
  - `New Host` (Button with dropdown for "New Host" or "New Group").
  - `Local Terminal` (Quick launch button).
  - View toggles (Grid vs. List) and Sort options.
- **Groups Section:** A responsive grid (`grid-cols-2` or `grid-cols-3`). Group cards show an icon, group name, and "X Hosts" subtitle.
- **Hosts Section:** A responsive grid. Host cards (`shadcn Card` with hover states) display:
  - An OS icon (e.g., Raspberry Pi, Debian) in a colored circle.
  - Name (e.g., "Raspberry PI 4").
  - Subtitle (e.g., "ssh, root").
  - An "Edit" or "More" icon visible on hover.
  - Active selection state (e.g., an accent border `ring-2 ring-accent`) when selected.

### 2.3 Right Area: Inspector / Details Pane
When a host is clicked, the right pane populates with its details. Changes made here auto-save to the SQLite DB on `blur` or via a dedicated "Save" button, depending on UX preference.

**Pane Sections (Top to Bottom):**
1. **Header:** "Host Details", followed by a close button (`X`) and action buttons (Open Terminal, Open SFTP).
2. **Address Card:** 
   - Icon + Input field for `host_address` (e.g., `192.168.1.100`).
3. **General Card:**
   - Input: `name` (Label).
   - Select: `group_id` (Dropdown of available groups).
   - Input: `tags` (Optional future feature, leave placeholder).
4. **SSH / Connection:**
   - Input: `port` (Default 22).
5. **Credentials Card:**
   - Input: `username`.
   - Select: `auth_method` (Password, Private Key, Agent).
   - Input (Password): Masked password input. Saved securely to macOS Keychain via Rust `keyring`.
   - Input (Private Key): Path selector if Auth Method is Key.
6. **Footer:** A large, prominent, full-width `Connect` button (e.g., `bg-emerald-500` or `bg-accent`).

---

## 3. Data Flow & IPC (Rust ↔ React)

### 3.1 Zustand Store (`useHostsStore.ts`)
```typescript
interface HostsStore {
  hosts: Host[];
  groups: Group[];
  selectedHostId: string | null;
  isLoading: boolean;
  
  // Actions
  fetchData: () => Promise<void>;
  createHost: (host: Partial<Host>, password?: string) => Promise<void>;
  updateHost: (id: string, updates: Partial<Host>, password?: string) => Promise<void>;
  deleteHost: (id: string) => Promise<void>;
  setSelectedHost: (id: string | null) => void;
}
```
- **Fetch Logic:** On mount of the `HomeTab`, `fetchData` invokes `hosts_get_all` and `groups_get_all` from the Rust backend.
- **Selection State:** `selectedHostId` dictates what the Right Area (Inspector) displays. If `null`, the inspector is completely hidden, and the grid takes up 100% of the width.

### 3.2 Rust Backend Constraints
- **SQLite (`rusqlite`):** Store host metadata. Provide `hosts_get_all`, `hosts_create`, `hosts_update`, `hosts_delete`.
- **Keychain (`keyring`):** When React sends a password during `hosts_create` or `hosts_update`, Rust must store it in the OS Keychain using `UUID` as the key. Passwords NEVER touch the SQLite database.
- **Non-Blocking:** Database reads/writes are file I/O. Execute them inside `tokio::task::spawn_blocking` to avoid stalling the Tauri main thread.

---

## 4. UI/UX Heuristics for AI Implementation

1. **Flexbox Layout Mastery:** To achieve the Master-Detail view, the parent container should be `flex flex-row h-full overflow-hidden`. The left pane should be `flex-1 overflow-y-auto`, and the right inspector should be `w-[340px] shrink-0 overflow-y-auto border-l border-border/60 bg-card/30`.
2. **Smooth Transitions:** Wrap the Inspector rendering in `AnimatePresence` and `motion.div` (from `motion/react`, which Terax already uses) so it slides in smoothly from the right when a host is clicked.
3. **Card Design:** Use `shadcn/ui` `Card` components, but keep padding tight. Host cards should have `hover:border-foreground/30` and a clear visual indicator when selected (`ring-1 ring-ring`).
4. **Form Inputs in Inspector:** The Inspector acts as a form. Avoid generic "Save" buttons at the bottom if possible. Instead, implement `onBlur` handlers on inputs to auto-save changes, OR use a prominent "Save Changes" button that appears only when the form state differs from the saved state (dirty state).
```
