# Task 04.1 — Virtualized Split-Pane SFTP UI
**Phase:** 4 — SFTP File Manager
**Status:** completed
**Priority:** High
**Dependencies:** TASK_03_1

## Background & Context
The SFTP tab provides a dual-pane file manager: local filesystem on the left, remote filesystem on the right. Large directories (thousands of files) must render without jank — this is achieved with `@tanstack/react-virtual` row virtualization. This task creates the complete UI shell with mock remote data; the real SFTP backend commands are wired in Task 04.2.

## Work Instructions

### 1. Create `src/modules/sftp/types.ts`
```typescript
export interface FileNode {
  name: string;
  path: string;        // absolute path
  size: number;        // bytes (0 for dirs)
  modified_at: number; // Unix timestamp seconds
  is_dir: boolean;
  is_symlink: boolean;
  symlink_target?: string;
  permissions: string; // e.g. "rwxr-xr-x"
}

export type TransferDirection = "upload" | "download";
```

### 2. Create `src/modules/sftp/store/sftpStore.ts`
Per-tab SFTP state. Use a `Record<string, SftpTabState>` keyed by tab ID (stringified number).

```typescript
import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import type { FileNode } from "../types";

interface SftpTabState {
  localPath: string;
  remotePath: string;
  localFiles: FileNode[];
  remoteFiles: FileNode[];
  isLoadingLocal: boolean;
  isLoadingRemote: boolean;
  selectedLocalPaths: Set<string>;
  selectedRemotePaths: Set<string>;
  error: string | null;
}

interface SftpStore {
  tabs: Record<string, SftpTabState>;

  initTab: (tabId: string, initialRemotePath?: string) => void;
  destroyTab: (tabId: string) => void;

  setLocalPath: (tabId: string, path: string) => void;
  setRemotePath: (tabId: string, path: string) => void;

  loadLocalDir: (tabId: string, path: string) => Promise<void>;
  loadRemoteDir: (tabId: string, path: string) => Promise<void>;

  setSelectedLocal: (tabId: string, paths: Set<string>) => void;
  setSelectedRemote: (tabId: string, paths: Set<string>) => void;
}

const DEFAULT_TAB_STATE = (): SftpTabState => ({
  localPath: "~",
  remotePath: "/",
  localFiles: [],
  remoteFiles: [],
  isLoadingLocal: false,
  isLoadingRemote: false,
  selectedLocalPaths: new Set(),
  selectedRemotePaths: new Set(),
  error: null,
});

export const useSftpStore = create<SftpStore>((set, get) => ({
  tabs: {},

  initTab: (tabId, initialRemotePath = "/") => {
    set((s) => ({
      tabs: {
        ...s.tabs,
        [tabId]: { ...DEFAULT_TAB_STATE(), remotePath: initialRemotePath },
      },
    }));
  },

  destroyTab: (tabId) => {
    set((s) => {
      const { [tabId]: _, ...rest } = s.tabs;
      return { tabs: rest };
    });
  },

  setLocalPath: (tabId, path) =>
    set((s) => ({
      tabs: { ...s.tabs, [tabId]: { ...s.tabs[tabId], localPath: path } },
    })),

  setRemotePath: (tabId, path) =>
    set((s) => ({
      tabs: { ...s.tabs, [tabId]: { ...s.tabs[tabId], remotePath: path } },
    })),

  loadLocalDir: async (tabId, path) => {
    set((s) => ({
      tabs: { ...s.tabs, [tabId]: { ...s.tabs[tabId], isLoadingLocal: true, error: null } },
    }));
    try {
      // Reuse existing fs commands from the original Terax fs module
      // The command returns an array of entries. Map to FileNode shape.
      // Check what the existing fs_list (or equivalent) returns and adapt.
      // Fallback: use invoke("list_local_dir", { path })
      const files = await invoke<FileNode[]>("list_local_dir", { path });
      set((s) => ({
        tabs: {
          ...s.tabs,
          [tabId]: { ...s.tabs[tabId], localFiles: files, localPath: path, isLoadingLocal: false },
        },
      }));
    } catch (e) {
      set((s) => ({
        tabs: {
          ...s.tabs,
          [tabId]: { ...s.tabs[tabId], isLoadingLocal: false, error: String(e) },
        },
      }));
    }
  },

  loadRemoteDir: async (tabId, path) => {
    set((s) => ({
      tabs: { ...s.tabs, [tabId]: { ...s.tabs[tabId], isLoadingRemote: true, error: null } },
    }));
    try {
      // In Task 04.1, use mock data. Real impl in Task 04.2.
      // For now, simulate a delay and return empty array.
      await new Promise((r) => setTimeout(r, 300));
      const files: FileNode[] = []; // TODO: replace with invoke("sftp_read_dir", ...) in Task 04.2
      set((s) => ({
        tabs: {
          ...s.tabs,
          [tabId]: { ...s.tabs[tabId], remoteFiles: files, remotePath: path, isLoadingRemote: false },
        },
      }));
    } catch (e) {
      set((s) => ({
        tabs: {
          ...s.tabs,
          [tabId]: { ...s.tabs[tabId], isLoadingRemote: false, error: String(e) },
        },
      }));
    }
  },

  setSelectedLocal: (tabId, paths) =>
    set((s) => ({
      tabs: { ...s.tabs, [tabId]: { ...s.tabs[tabId], selectedLocalPaths: paths } },
    })),

  setSelectedRemote: (tabId, paths) =>
    set((s) => ({
      tabs: { ...s.tabs, [tabId]: { ...s.tabs[tabId], selectedRemotePaths: paths } },
    })),
}));
```

### 3. Create `src/modules/sftp/components/VirtualizedFileList.tsx`
A high-performance virtualized list of files. Dependencies: `@tanstack/react-virtual`.

```typescript
interface VirtualizedFileListProps {
  files: FileNode[];
  selectedPaths: Set<string>;
  onSelect: (path: string, multiSelect: boolean) => void;
  onDoubleClick: (file: FileNode) => void;
  isLoading?: boolean;
  // Drag-and-drop (wired in Task 05.2)
  draggable?: boolean;
  onDragStart?: (paths: string[]) => void;
  onDrop?: (targetPath: string, paths: string[]) => void;
}
```

**Structure:**
- Outer `div` with `ref={parentRef}` — `h-full overflow-auto` — the scroll container.
- Sticky header row: fixed to top of the scroll container. Columns: Name (flex-1), Size (w-24 text-right), Modified (w-32), Permissions (w-28). Use `text-xs text-muted-foreground uppercase tracking-wide` styling.
- Use `useVirtualizer` from `@tanstack/react-virtual`:
  ```typescript
  const virtualizer = useVirtualizer({
    count: files.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 28, // 28px per row
    overscan: 10,
  });
  ```
- Each virtual row renders a `<FileRow>` component.

**`FileRow` component (internal):**
- Height: 28px (`h-7`). Dense, no padding waste.
- Background: `bg-muted/10` on even index, transparent on odd (zebra striping).
- Selected: `bg-primary/20 ring-1 ring-primary/40`.
- Hover: `hover:bg-accent/30`.
- Click: calls `onSelect(file.path, e.metaKey || e.ctrlKey)`.
- Double-click: calls `onDoubleClick(file)`.
- Layout: flex row.
  - Icon (20px wide): folder emoji `📁` for dirs, file emoji `📄` for files (or use hugeicons if available), symlink `🔗`.
  - Name (flex-1, truncated): `text-sm font-medium truncate`. Symlink names: italic.
  - Size (w-24 text-right): `formatBytes(file.size)` helper. Empty for dirs.
  - Modified (w-32): `formatRelativeTime(file.modified_at)`.
  - Permissions (w-28): monospace `text-xs text-muted-foreground`.

**Loading state:** When `isLoading` is true, show 10 skeleton rows with `animate-pulse bg-muted/20 rounded h-7`.

**Empty state:** When `files.length === 0` and not loading, centered `text-muted-foreground text-sm` message "Empty directory".

**Utility functions (add at bottom of file):**
```typescript
function formatBytes(bytes: number): string {
  if (bytes === 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatRelativeTime(unixSecs: number): string {
  const diff = Date.now() / 1000 - unixSecs;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(unixSecs * 1000).toLocaleDateString();
}
```

### 4. Create `src/modules/sftp/components/SftpToolbar.tsx`
Props: `path: string`, `onNavigate: (path: string) => void`, `placeholder?: string`, `showOpenTerminal?: boolean`, `onOpenTerminal?: () => void`.

- Flex row: path breadcrumb/input + filter input + optional actions.
- Path input: `input` with current path as value. `onKeyDown`: on Enter, call `onNavigate(inputValue)`. `onChange` updates local state only (don't navigate on every keystroke).
- Up-directory button: `..` or arrow icon, calls `onNavigate(parentPath)` where `parentPath` is derived by stripping the last path segment.
- "Open Terminal Here" button (remote only, shown when `showOpenTerminal`): calls `onOpenTerminal?.()`.
- Refresh button: re-calls `onNavigate(path)`.
- Styling: `h-9 bg-card border-b border-border px-2 flex items-center gap-2`.

### 5. Create `src/modules/sftp/SftpPane.tsx`
Top-level SFTP tab component.

```typescript
interface SftpPaneProps {
  tab: SftpTab; // from useTabs — has id, kind: "sftp", hostId
}
```

**On mount:** 
- Call `initTab(String(tab.id))` from `useSftpStore`.
- Call `loadLocalDir(String(tab.id), "~")`.
- Call `loadRemoteDir(String(tab.id), "/")` (mock in Task 04.1).

**On unmount:** Call `destroyTab(String(tab.id))`.

**Layout using `react-resizable-panels`:**
```tsx
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";

<div className="flex flex-col h-full">
  {/* Optional top bar: breadcrumb, host name */}
  <div className="h-8 bg-card border-b border-border px-4 flex items-center text-xs text-muted-foreground">
    {tab.hostId ? `SFTP — ${hostName}` : "Local Files"}
  </div>

  <ResizablePanelGroup direction="horizontal" className="flex-1 min-h-0">
    <ResizablePanel defaultSize={50} minSize={20}>
      {/* LOCAL PANE */}
      <div className="flex flex-col h-full">
        <div className="px-2 py-1 text-xs font-semibold text-muted-foreground bg-muted/30 border-b border-border">
          LOCAL
        </div>
        <SftpToolbar
          path={tabState?.localPath ?? "~"}
          onNavigate={(p) => loadLocalDir(tabId, p)}
        />
        <div className="flex-1 min-h-0">
          <VirtualizedFileList
            files={tabState?.localFiles ?? []}
            selectedPaths={tabState?.selectedLocalPaths ?? new Set()}
            onSelect={(path, multi) => handleLocalSelect(path, multi)}
            onDoubleClick={(file) => {
              if (file.is_dir) loadLocalDir(tabId, file.path);
            }}
            isLoading={tabState?.isLoadingLocal}
          />
        </div>
      </div>
    </ResizablePanel>

    <ResizableHandle withHandle />

    <ResizablePanel defaultSize={50} minSize={20}>
      {/* REMOTE PANE */}
      <div className="flex flex-col h-full">
        <div className="px-2 py-1 text-xs font-semibold text-muted-foreground bg-muted/30 border-b border-border">
          REMOTE
        </div>
        <SftpToolbar
          path={tabState?.remotePath ?? "/"}
          onNavigate={(p) => loadRemoteDir(tabId, p)}
          showOpenTerminal={true}
          onOpenTerminal={() => {/* TODO: open SSH terminal at this path */}}
        />
        <div className="flex-1 min-h-0">
          <VirtualizedFileList
            files={tabState?.remoteFiles ?? []}
            selectedPaths={tabState?.selectedRemotePaths ?? new Set()}
            onSelect={(path, multi) => handleRemoteSelect(path, multi)}
            onDoubleClick={(file) => {
              if (file.is_dir) loadRemoteDir(tabId, file.path);
            }}
            isLoading={tabState?.isLoadingRemote}
          />
        </div>
      </div>
    </ResizablePanel>
  </ResizablePanelGroup>
</div>
```

### 6. Create `src/modules/sftp/index.ts`
```typescript
export { SftpPane } from "./SftpPane";
export type { FileNode, TransferDirection } from "./types";
export { useSftpStore } from "./store/sftpStore";
```

### 7. Update `src/app/App.tsx`
Replace the SFTP tab placeholder:
```tsx
import { SftpPane } from "@/modules/sftp";
import type { SftpTab } from "@/modules/tabs";
// ...
// In rendering section:
{tabs.map((tab) =>
  tab.kind === "sftp" && (
    <div
      key={tab.id}
      className={cn("absolute inset-0", activeTab?.id !== tab.id && "invisible pointer-events-none")}
    >
      <SftpPane tab={tab as SftpTab} />
    </div>
  )
)}
```

## Files to Create
- `src/modules/sftp/types.ts`
- `src/modules/sftp/store/sftpStore.ts`
- `src/modules/sftp/components/VirtualizedFileList.tsx`
- `src/modules/sftp/components/SftpToolbar.tsx`
- `src/modules/sftp/SftpPane.tsx`
- `src/modules/sftp/index.ts`

## Files to Modify
- `src/app/App.tsx`

## Expected Outcome
- Opening an SFTP tab (e.g., by clicking "Open SFTP" in the host inspector) renders the split-pane layout.
- The local pane shows the actual local filesystem (if `list_local_dir` IPC works) or an empty state.
- The remote pane shows an empty state (mock, real data in Task 04.2).
- Typing a path in the toolbar and pressing Enter navigates to that directory.
- Clicking a directory row double-clicks into it.
- Rows are virtualized — even 10,000 file entries render smoothly.
- `pnpm exec tsc --noEmit` passes with zero errors.

## Additional Information
- **Verify:** Run `pnpm exec tsc --noEmit` before marking complete.
- Check whether the existing Terax `fs` module exposes a `list_local_dir` command that returns compatible data. If the shape is different, create a mapping function rather than changing the Rust command.
- If `react-resizable-panels` is not installed, run `pnpm add react-resizable-panels`. Check `package.json` first.
- `@tanstack/react-virtual` should have been installed in Task 02.2. Verify it's present before adding again.
- The `Set` type in Zustand state will not trigger re-renders correctly unless you create a new `Set` instance when updating. Always use `new Set([...existing, newItem])` patterns.
