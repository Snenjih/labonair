# Host Manager Overhaul — Implementation Context
**Commit:** `0684c96`
**Status:** Shipped

This document describes every architectural decision, data model change, IPC contract, and UI pattern introduced during the Host Manager overhaul. Read this before touching any file under `src/modules/hosts/` or `src-tauri/src/modules/hosts/`.

---

## 1. What Changed at a Glance

| Area | Before | After |
|------|--------|-------|
| Create host | Modal dialog (4 fields) | Inline sidebar panel with 3 tabs |
| Edit host | `HostInspector.tsx` (flat form) | `HostFormPanel.tsx` (same panel, tabbed) |
| Auth methods | `password` \| `key` | `password` \| `key` \| `none` |
| New host fields | — | `default_path_ssh`, `default_path_sftp`, `pin_to_top`, `sudo_password_set`, `keep_alive_interval`, `keep_alive_tries`, `sort_order` |
| Ordering | Alphabetical only | Pinned-first, then manual `sort_order`, then alphabetical |
| Selection | Single click | Single / Cmd+click toggle / Shift+click range |
| Context menu | None | Right-click on card (single + bulk actions) |
| Drag reorder | None | `@dnd-kit/core` + `@dnd-kit/sortable` |
| Empty state | Minimal placeholder | Centered illustration + "Add First Host" CTA |
| Loading bug | `isLoading` could get stuck `true` | `try/finally` + `hasFetched` flag |

---

## 2. Data Model

### 2.1 TypeScript — `src/modules/hosts/types.ts`

```ts
interface Host {
  // --- existing ---
  id: string;
  name: string;
  host_address: string;
  port: number;
  username: string;
  auth_method: "password" | "key" | "none"; // "none" = ask each time
  private_key_path?: string;
  group_id?: string;
  tags?: string;
  created_at: number;
  last_connected_at?: number;
  // --- new ---
  default_path_ssh?: string;      // auto cd after SSH connect
  default_path_sftp?: string;     // initial dir in SFTP pane
  pin_to_top: boolean;            // floats above sort_order
  sudo_password_set: boolean;     // flag only — actual pw in Keychain
  keep_alive_interval?: number;   // seconds (passed to ssh2)
  keep_alive_tries?: number;      // informational (UI display)
  sort_order: number;             // drag-reorder position
}

interface ReorderItem { id: string; sort_order: number; }
```

`CreateHostPayload` and `UpdateHostPayload` extended with all new optional fields.

### 2.2 Rust — `src-tauri/src/modules/hosts/mod.rs`

Mirrors the TypeScript type. `pin_to_top` and `sudo_password_set` are `bool` (SQLite `INTEGER 0/1`). `sort_order` is `i64`.

Added `ReorderItem` struct (used by `hosts_reorder` command).

### 2.3 SQLite — `src-tauri/src/modules/hosts/db.rs`

New columns are added via **idempotent migrations** at startup — `ALTER TABLE hosts ADD COLUMN …` inside a loop that ignores errors if the column already exists (safe for existing databases):

```
default_path_ssh       TEXT
default_path_sftp      TEXT
pin_to_top             INTEGER NOT NULL DEFAULT 0
sudo_password_set      INTEGER NOT NULL DEFAULT 0
keep_alive_interval    INTEGER
keep_alive_tries       INTEGER
sort_order             INTEGER NOT NULL DEFAULT 0
```

`hosts_get_all` now orders by: `pin_to_top DESC, sort_order ASC, name ASC`.

A shared `row_to_host()` helper and `SELECT_HOSTS` constant avoid duplicating the 18-column SELECT across queries.

---

## 3. Keychain Keys

| Key service | Key account | Contents |
|-------------|-------------|----------|
| `nexum-app` | `<host_id>` | SSH / login password |
| `nexum-sudo` | `<host_id>` | Sudo autofill password |

When `sudo_password` is set to an empty string via update, the Keychain entry is deleted and `sudo_password_set` is set back to `0`.

---

## 4. Tauri Commands

### New commands (registered in `src-tauri/src/lib.rs`)

| Command | Signature | Purpose |
|---------|-----------|---------|
| `hosts_reorder` | `(db, items: Vec<ReorderItem>) → Result<(), String>` | Batch-update `sort_order` for all items |
| `get_sudo_password` | `(db, host_id: String) → Result<Option<String>, String>` | Returns sudo pw from Keychain if `sudo_password_set = 1` |

### Modified commands

| Command | Change |
|---------|--------|
| `hosts_create` | Accepts 8 new optional params; writes `sudo_password` to `nexum-sudo` Keychain |
| `hosts_update` | Accepts 8 new optional params; handles empty-string sudo/password to delete Keychain entry |
| `hosts_delete` | Also deletes `nexum-sudo` Keychain entry in addition to `nexum-app` |
| `hosts_get_all` | New ORDER BY; selects 18 columns |

### SSH changes — `src-tauri/src/modules/ssh/client.rs`

- Fetches `keep_alive_interval`, `keep_alive_tries`, `default_path_ssh` from DB on connect.
- Calls `session.set_keepalive(true, interval)` if `keep_alive_interval` is set.
- Includes `default_path_ssh` in the `session_established` event payload so the frontend can issue `cd <path>` automatically.

---

## 5. Frontend Architecture

### 5.1 `HostFormPanel.tsx` (new)
Location: `src/modules/hosts/components/HostFormPanel.tsx`

Single component that handles both **Add** and **Edit** modes.

- **Add mode**: `hostId === "__new__"` or `null`. Shows "New host" title, submit button creates host then switches to edit mode for the new host.
- **Edit mode**: `hostId` is a real UUID. Auto-saves on blur (300 ms debounce via `setTimeout`).

**Three tabs:**
- `General` — name, host/IP/port, group, pin-to-top toggle, auth method + credential fields
- `SSH` — default path, sudo autofill, keep-alive interval, keep-alive tries
- `SFTP` — default path

Auth method toggle renders different credential UI:
- `password` → masked password input (stored Keychain `nexum-app`)
- `key` → private key path text input
- `none` → informational note; no credential input

`HostInspector.tsx` is now **retired** (replaced by `HostFormPanel`). It can be deleted in a future cleanup pass.

### 5.2 `HomeDashboard.tsx`
- Dialog removed. `+ New Host` sets `selectedHostId = "__new__"` which triggers the panel.
- Empty state (`<EmptyState>`) uses a centered layout with a "Add First Host" button.
- Host grid wrapped in `<DndContext>` + `<SortableContext>` from `@dnd-kit`.
- `localHosts` mirrors store `hosts` for optimistic drag reorder; synced via `useEffect`.
- Drag activation threshold: 6px (prevents accidental drag on click).
- Multi-select: Cmd/Ctrl+click → toggle; Shift+click → range from last single-click.

### 5.3 `HostCard.tsx`
- Wrapped in `<ContextMenu>` (shadcn `context-menu.tsx`).
- Drag handle: a 6-dot grip icon; uses `dragHandleProps` from `useSortable()` passed down from `SortableHostCard`.
- Pin indicator: small star SVG shown when `host.pin_to_top === true`.
- Context menu shows **single-host** or **bulk** actions depending on whether `selectedHostIds.size > 1` and the card is in the selection.
- Bulk delete uses `deleteManyHosts()` which calls `hosts_delete` in parallel for all selected IDs.
- Single and bulk delete each have their own `<AlertDialog>` confirm.

### 5.4 `hostsStore.ts`

New state:
```ts
selectedHostIds: Set<string>   // multi-select set
lastSingleClickId: string | null
hasFetched: boolean            // true after first fetchData completes
isLoading: boolean             // starts true; reset in try/finally
```

New actions:
```ts
selectHost(id, mode: "single" | "toggle" | "range")
clearMultiSelect()
deleteManyHosts(ids: string[])
duplicateHost(id: string)
reorderHosts(items: ReorderItem[])
togglePin(id: string)
```

**Loading fix:** `isLoading` initialises to `true`. `fetchData` uses `try/finally` to always set `isLoading: false` and `hasFetched: true`. The dashboard renders skeletons until `hasFetched` is `true`, preventing an infinite skeleton state if the Tauri backend is slow or errors.

---

## 6. Dependencies Added

| Package | Version | Purpose |
|---------|---------|---------|
| `@dnd-kit/core` | latest | Drag-and-drop primitives |
| `@dnd-kit/sortable` | latest | Sortable list strategy |
| `@dnd-kit/utilities` | latest | CSS transform helpers |

---

## 7. Not Yet Wired (Future Work)

| Feature | Status | Notes |
|---------|--------|-------|
| SSH default path `cd` | Backend emits it in event | Frontend `useTerminalSession` needs to listen for `session_established.default_path_ssh` and call `ssh_pty_write` |
| SFTP default path | Data stored in DB | `sftp_read_dir` initial call needs to pass `host.default_path_sftp` instead of `"/"` |
| Sudo autofill | Password stored in Keychain | PTY output watcher needs to detect `[sudo] password for` and call `get_sudo_password` + `ssh_pty_write` |
| `HostInspector.tsx` deletion | Retired but not deleted | Safe to remove once confirmed no other imports |
