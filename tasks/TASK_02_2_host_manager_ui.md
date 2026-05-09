# Task 02.2 — Host Manager UI (Home Dashboard)
**Phase:** 2 — Database & Host Management
**Status:** not_started
**Priority:** Critical
**Dependencies:** TASK_02_1

## Background & Context
The Home Dashboard is the first screen users see when they open Nexum. It replaces the blank "Home Placeholder" created in Task 01.2. It uses a Master-Detail layout: a responsive host/group grid on the left and a slide-in inspector pane on the right. Users create, edit, and connect to SSH hosts from this screen. All state is managed in Zustand. All data access goes through Tauri `invoke()`.

## Work Instructions

### 1. Check and Install Dependencies
Open `package.json`. Check if `@tanstack/react-virtual` is already listed. If not, run:
```bash
pnpm add @tanstack/react-virtual
```
Also verify `motion` (Framer Motion v11+) is present — it should be. If not: `pnpm add motion`.

### 2. Create `src/modules/hosts/types.ts`
Define TypeScript interfaces that mirror the Rust structs:
```typescript
export interface Host {
  id: string;
  name: string;
  host_address: string;
  port: number;
  username: string;
  auth_method: "password" | "key";
  private_key_path?: string;
  group_id?: string;
  tags?: string; // JSON array string
  created_at: number; // Unix ms
  last_connected_at?: number;
}

export interface Group {
  id: string;
  name: string;
  icon?: string;
  color?: string;
  created_at: number;
}

export interface CreateHostPayload {
  name: string;
  host_address: string;
  port: number;
  username: string;
  auth_method: "password" | "key";
  private_key_path?: string;
  group_id?: string;
  tags?: string;
  password?: string;
}

export interface UpdateHostPayload extends Partial<CreateHostPayload> {
  id: string;
}
```

### 3. Create `src/modules/hosts/store/hostsStore.ts`
Create a Zustand store for host manager state. Use the `create` import from `zustand`.

```typescript
import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import type { Host, Group, CreateHostPayload, UpdateHostPayload } from "../types";

interface HostsState {
  hosts: Host[];
  groups: Group[];
  selectedHostId: string | null;
  isLoading: boolean;

  fetchData: () => Promise<void>;
  createHost: (payload: CreateHostPayload) => Promise<Host>;
  updateHost: (payload: UpdateHostPayload) => Promise<Host>;
  deleteHost: (id: string) => Promise<void>;
  setSelectedHost: (id: string | null) => void;

  createGroup: (name: string, icon?: string, color?: string) => Promise<Group>;
  deleteGroup: (id: string) => Promise<void>;
}

export const useHostsStore = create<HostsState>((set, get) => ({
  hosts: [],
  groups: [],
  selectedHostId: null,
  isLoading: false,

  fetchData: async () => {
    set({ isLoading: true });
    const [hosts, groups] = await Promise.all([
      invoke<Host[]>("hosts_get_all"),
      invoke<Group[]>("groups_get_all"),
    ]);
    set({ hosts, groups, isLoading: false });
  },

  createHost: async (payload) => {
    const host = await invoke<Host>("hosts_create", payload);
    set((s) => ({ hosts: [...s.hosts, host] }));
    return host;
  },

  updateHost: async (payload) => {
    const host = await invoke<Host>("hosts_update", payload);
    set((s) => ({
      hosts: s.hosts.map((h) => (h.id === host.id ? host : h)),
    }));
    return host;
  },

  deleteHost: async (id) => {
    await invoke("hosts_delete", { id });
    set((s) => ({
      hosts: s.hosts.filter((h) => h.id !== id),
      selectedHostId: s.selectedHostId === id ? null : s.selectedHostId,
    }));
  },

  setSelectedHost: (id) => set({ selectedHostId: id }),

  createGroup: async (name, icon, color) => {
    const group = await invoke<Group>("groups_create", { name, icon, color });
    set((s) => ({ groups: [...s.groups, group] }));
    return group;
  },

  deleteGroup: async (id) => {
    await invoke("groups_delete", { id });
    set((s) => ({ groups: s.groups.filter((g) => g.id !== id) }));
  },
}));
```

### 4. Create `src/modules/hosts/components/GroupCard.tsx`
A compact card for a group. Props: `group: Group`, `isSelected: boolean`, `onClick: () => void`, `hostCount: number`.

- Renders a rounded card with `bg-card border border-border` classes.
- Shows the group icon (emoji or default folder emoji), name, and a faint host count badge.
- Active/selected state: `ring-2 ring-primary`.
- No hardcoded colors — use semantic Tailwind vars only.

### 5. Create `src/modules/hosts/components/HostCard.tsx`
A card for a single host in the grid. Props: `host: Host`, `isSelected: boolean`, `onClick: () => void`.

- Layout: flex row, left circle avatar (initials from host name, bg-muted), right column (name bold, `username@host_address` subtitle in `text-muted-foreground text-xs`).
- Bottom row: port badge, group name if present.
- `last_connected_at` shown as relative time if present ("2 days ago").
- Selected state: `ring-2 ring-primary bg-accent/40`.
- Hover: `hover:bg-accent/20 cursor-pointer`.
- Use `motion.div` with `whileHover={{ scale: 1.01 }}` and `whileTap={{ scale: 0.99 }}`.

### 6. Create `src/modules/hosts/components/HostInspector.tsx`
The right-side detail pane. Props: `hostId: string`, `onClose: () => void`.

Pull host from store: `const host = useHostsStore(s => s.hosts.find(h => h.id === hostId))`.

The inspector has a local edit state (React `useState`) that mirrors the host fields. This lets users type freely without each keystroke firing an IPC call.

**Sections (top to bottom):**

**Header** (sticky top): host name (large, editable inline h1 on click), close button (`X`), two action buttons:
- "Connect SSH" → calls `addTab` from `useTabs` with kind `"ssh-terminal"` and `hostId`.
- "Open SFTP" → calls `addTab` with kind `"sftp"` and `hostId`.

Import `useTabs` from `@/modules/tabs`.

**Address Section** (`bg-card rounded-lg p-4 border border-border`):
- "Host / IP Address" — text input, placeholder `192.168.1.1`
- "Port" — number input, default 22

**General Section**:
- "Display Name" — text input
- "Group" — `<select>` populated from store groups, plus "None" option

**SSH / Connection Section**:
- "Username" — text input
- "Auth Method" — radio or segmented control: "Password" | "Private Key"
- Conditional: if auth_method === "key", show "Private Key Path" text input

**Credentials Section**:
- If auth_method === "password": "Password" input (type="password"), placeholder "••••••••"
- Note: password is write-only from UI perspective. Backend stores it in keychain. Show a "(stored securely)" hint.

**Auto-save behavior**: Each input's `onBlur` handler calls `updateHost` from the store with the current dirty state. Show a subtle "Saving..." indicator during the async call. On success, flash green momentarily.

**Delete button** at the very bottom: red destructive variant, opens a confirmation dialog (shadcn `AlertDialog`) before calling `deleteHost`.

### 7. Create `src/modules/hosts/components/HomeDashboard.tsx`
The top-level layout component rendered in the Home tab.

```tsx
// Rough structure:
<div className="flex h-full w-full overflow-hidden">
  {/* LEFT MASTER PANE */}
  <div className="flex flex-1 flex-col overflow-hidden">
    {/* Top toolbar: search input + "New Host" button + "New Group" button */}
    {/* Groups section: horizontal scrollable row of GroupCards */}
    {/* Hosts grid: responsive grid (grid-cols-1 md:grid-cols-2 lg:grid-cols-3) */}
    {/* Empty state: when no hosts, show a centered "Add your first server" CTA */}
  </div>

  {/* RIGHT INSPECTOR PANE — AnimatePresence */}
  <AnimatePresence>
    {selectedHostId && (
      <motion.div
        key={selectedHostId}
        initial={{ x: 340, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: 340, opacity: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className="w-[340px] shrink-0 border-l border-border overflow-y-auto"
      >
        <HostInspector
          hostId={selectedHostId}
          onClose={() => setSelectedHost(null)}
        />
      </motion.div>
    )}
  </AnimatePresence>
</div>
```

**Top toolbar details:**
- Search input (full-width in left pane header area): filters `hosts` array by name/address/username using `useMemo`.
- "New Host" button: opens a minimal modal (shadcn `Dialog`) with just name + address + port + username fields. On submit, calls `createHost`. After creation, `setSelectedHost` to the new host's id to immediately open inspector.
- "New Group" button: inline input that appears, type name, Enter to confirm.

**On mount**: call `fetchData()` from the store.

**Loading state**: while `isLoading`, show a skeleton grid (3 placeholder cards with `animate-pulse bg-muted rounded-lg`).

**Group filter**: clicking a GroupCard filters the hosts list to that group. Clicking the same group again deselects (shows all).

### 8. Create `src/modules/hosts/index.ts`
```typescript
export { HomeDashboard } from "./components/HomeDashboard";
export type { Host, Group } from "./types";
export { useHostsStore } from "./store/hostsStore";
```

### 9. Update `src/app/App.tsx`
Find the block that renders the Home tab placeholder (from Task 01.2). Replace it with:
```tsx
import { HomeDashboard } from "@/modules/hosts";
// ...
// In the render:
<div className={cn("absolute inset-0", !isHomeTab && "invisible pointer-events-none")}>
  <HomeDashboard />
</div>
```

## Files to Create
- `src/modules/hosts/types.ts`
- `src/modules/hosts/store/hostsStore.ts`
- `src/modules/hosts/components/GroupCard.tsx`
- `src/modules/hosts/components/HostCard.tsx`
- `src/modules/hosts/components/HostInspector.tsx`
- `src/modules/hosts/components/HomeDashboard.tsx`
- `src/modules/hosts/index.ts`

## Files to Modify
- `src/app/App.tsx`
- `package.json` (only if `@tanstack/react-virtual` was missing)

## Expected Outcome
- App boots into Home tab showing the dashboard.
- An empty state "Add your first server" message is shown when no hosts exist.
- Clicking "New Host" opens the creation dialog. Filling it in and submitting creates the host, which then appears in the grid.
- Clicking a host card slides in the inspector pane from the right.
- Editing any field in the inspector and blurring saves changes to the backend.
- The "Connect SSH" button in the inspector opens a new SSH terminal tab (placeholder for now).
- `pnpm exec tsc --noEmit` passes with zero errors.

## Additional Information
- **Verify:** Run `pnpm exec tsc --noEmit` before marking complete.
- Never use hardcoded HEX colors. Every color must come from Tailwind semantic variables (`bg-background`, `text-muted-foreground`, `ring-primary`, etc.).
- The inspector uses local React state for editing; it does NOT push to the store on every keystroke.
- Import `invoke` from `@tauri-apps/api/core` (Tauri v2 API path).
- Use `import { AnimatePresence, motion } from "motion/react"` for animations.
