# Task 05.2 — Transfer UI & Drag and Drop
**Phase:** 5 — Global Transfer Manager
**Status:** completed
**Priority:** High
**Dependencies:** TASK_05_1, TASK_04_1

## Background & Context
This task surfaces the background transfer queue in the UI. A dropdown in the header shows active/completed transfers with progress bars, speed indicators, and cancel/pause controls. File conflict events are handled with a modal dialog. Drag and drop between the local and remote panes triggers actual file transfers via the Rust worker.

## Work Instructions

### 1. Create `src/modules/sftp/store/transferStore.ts`
A Zustand store that mirrors the transfer job state emitted by the Rust worker. This store is initialized ONCE at module load time (outside React) and syncs from Tauri events.

```typescript
import { create } from "zustand";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";

export type TransferStatus =
  | "queued"
  | "running"
  | "paused"
  | "cancelled"
  | "completed"
  | "failed";

export interface TransferJob {
  id: string;
  host_id: string;
  src_path: string;
  dest_path: string;
  direction: "upload" | "download";
  status: TransferStatus;
  bytes_total: number;
  bytes_transferred: number;
  speed_bps: number;
  // client-side only:
  conflict?: {
    src_path: string;
    dest_path: string;
  };
}

interface TransferState {
  jobs: TransferJob[];
  addJob: (job: TransferJob) => void;
  updateJob: (job: TransferJob) => void;
  removeJob: (id: string) => void;
  clearCompleted: () => void;
  cancelJob: (id: string) => Promise<void>;
  resolveConflict: (
    jobId: string,
    resolution: "overwrite" | "skip" | "rename",
    newName?: string
  ) => Promise<void>;
}

export const useTransferStore = create<TransferState>((set) => ({
  jobs: [],

  addJob: (job) => set((s) => ({ jobs: [job, ...s.jobs] })),

  updateJob: (job) =>
    set((s) => ({
      jobs: s.jobs.map((j) => (j.id === job.id ? { ...j, ...job } : j)),
    })),

  removeJob: (id) => set((s) => ({ jobs: s.jobs.filter((j) => j.id !== id) })),

  clearCompleted: () =>
    set((s) => ({
      jobs: s.jobs.filter(
        (j) => j.status !== "completed" && j.status !== "cancelled"
      ),
    })),

  cancelJob: async (id) => {
    await invoke("cancel_transfer", { job_id: id });
  },

  resolveConflict: async (jobId, resolution, newName) => {
    // Clear the conflict flag optimistically
    set((s) => ({
      jobs: s.jobs.map((j) =>
        j.id === jobId ? { ...j, conflict: undefined, status: "running" as TransferStatus } : j
      ),
    }));
    await invoke("resolve_conflict", {
      job_id: jobId,
      resolution,
      new_name: newName ?? null,
    });
  },
}));

// ─── Bootstrap event listeners ONCE at module load ────────────────────────────
// These listeners are global and persist for the app lifetime.
// We call this from App.tsx or main.tsx via `bootstrapTransferListeners()`.

let _listenersBootstrapped = false;

export async function bootstrapTransferListeners() {
  if (_listenersBootstrapped) return;
  _listenersBootstrapped = true;

  await listen<TransferJob>("transfer_progress", (event) => {
    const store = useTransferStore.getState();
    const existing = store.jobs.find((j) => j.id === event.payload.id);
    if (existing) {
      store.updateJob(event.payload);
    } else {
      store.addJob(event.payload);
    }
  });

  await listen<{ job_id: string; src_path: string; dest_path: string }>(
    "file_conflict",
    (event) => {
      const store = useTransferStore.getState();
      store.updateJob({
        ...store.jobs.find((j) => j.id === event.payload.job_id)!,
        status: "paused",
        conflict: {
          src_path: event.payload.src_path,
          dest_path: event.payload.dest_path,
        },
      });
    }
  );
}
```

### 2. Bootstrap Listeners in `src/app/App.tsx`
In `App.tsx`, call `bootstrapTransferListeners()` once on mount:
```typescript
import { bootstrapTransferListeners } from "@/modules/sftp/store/transferStore";

useEffect(() => {
  bootstrapTransferListeners();
}, []);
```

### 3. Create `src/modules/header/components/TransferDropdown.tsx`
A header button + popover that shows all active/recent transfers.

```typescript
// No props needed — reads from useTransferStore directly
```

**Button:** A compact icon button in the header. Icon: upload/download arrows (hugeicons `ArrowUpDownIcon` or similar). Shows a badge with the count of active (running/queued) transfers. If there are any `paused` (conflict) jobs, the badge glows red.

**Popover content** (`w-[360px]`, shadcn `Popover`):
- Header row: "Transfers" title + "Clear completed" link button (calls `clearCompleted()`).
- Empty state: "No active transfers" when `jobs.length === 0`.
- List of `TransferJob` items, most recent first. Each item:
  - Icon: `⬇` for download, `⬆` for upload.
  - File name (extracted from `dest_path` using `path.basename` equivalent: `dest_path.split("/").pop()`).
  - Source/dest mini-caption: `text-xs text-muted-foreground`.
  - Progress bar: `<div className="h-1 bg-muted rounded-full"><div style={{ width: `${pct}%` }} className="h-full bg-primary rounded-full transition-all" /></div>` where `pct = (bytes_transferred / bytes_total) * 100`.
  - Speed: `formatBytes(speed_bps) + "/s"` — shown only when status is "running".
  - Status label: small badge (`running` → blue, `completed` → green, `failed` → red, `paused` → yellow, `queued` → gray).
  - Cancel button (X icon): calls `cancelJob(id)`. Only shown for `running` or `queued` status.

**Conflict modal (`ConflictModal` — inline or separate file):**
When any job has `status === "paused"` AND `conflict` is set, render a shadcn `Dialog` (forced open, no close button):
- Title: "File Already Exists"
- Body: "The file `{filename}` already exists at `{dest_path}`. What would you like to do?"
- Three buttons: "Overwrite" → `resolveConflict(id, "overwrite")`, "Skip" → `resolveConflict(id, "skip")`, "Rename" → shows inline input, on confirm `resolveConflict(id, "rename", newName)`.
- Process one conflict at a time (show only the first paused job with a conflict).

### 4. Update `src/modules/header/Header.tsx`
Import and render `<TransferDropdown />` in the right side of the header bar, before the existing AI/settings buttons.

### 5. Add Drag and Drop to `VirtualizedFileList.tsx`
Open `src/modules/sftp/components/VirtualizedFileList.tsx`.

**Drag source (on rows):**
- Add `draggable` attribute to the row element when `props.draggable === true`.
- `onDragStart`: call `props.onDragStart?.(selectedPaths.size > 0 ? [...selectedPaths] : [file.path])`.
- Set `event.dataTransfer.setData("text/plain", JSON.stringify(paths))` and `event.dataTransfer.effectAllowed = "copy"`.

**Drop target (on the pane container — wrap list with a drop zone div):**
- The drop zone should be the outer `div` of `VirtualizedFileList` (or the `SftpPane` pane columns).
- `onDragOver`: `event.preventDefault()` + `event.dataTransfer.dropEffect = "copy"`. Add a visual overlay (light blue tint: `bg-primary/10 ring-2 ring-primary/40` on the drop zone container).
- `onDrop`: extract `JSON.parse(event.dataTransfer.getData("text/plain"))` as `paths: string[]`. Call `props.onDrop?.(currentPath, paths)`.
- `onDragLeave`: remove the visual overlay.

### 6. Wire Drag and Drop in `SftpPane.tsx`
In `SftpPane.tsx`, implement the `onDrop` handlers that call `enqueue_transfer`:

```typescript
import { invoke } from "@tauri-apps/api/core";

// Local pane drop handler (files dragged from remote → local = download)
const handleLocalDrop = async (targetLocalPath: string, remotePaths: string[]) => {
  for (const remotePath of remotePaths) {
    const fileName = remotePath.split("/").pop() ?? "file";
    const destPath = `${targetLocalPath}/${fileName}`;
    await invoke("enqueue_transfer", {
      host_id: tab.hostId,
      src_path: remotePath,
      dest_path: destPath,
      direction: "download",
    });
  }
};

// Remote pane drop handler (files dragged from local → remote = upload)
const handleRemoteDrop = async (targetRemotePath: string, localPaths: string[]) => {
  for (const localPath of localPaths) {
    const fileName = localPath.split(/[\\/]/).pop() ?? "file";
    const destPath = `${targetRemotePath}/${fileName}`;
    await invoke("enqueue_transfer", {
      host_id: tab.hostId,
      src_path: localPath,
      dest_path: destPath,
      direction: "upload",
    });
  }
};
```

Pass `draggable={true}`, `onDragStart={...}`, and `onDrop={...}` to each `VirtualizedFileList`.

Track which pane the drag originated from using a module-level `dragSource` ref or a context variable. On drop in the LOCAL pane, only handle drops from the REMOTE pane (and vice versa). Ignore same-pane drops.

## Files to Create
- `src/modules/sftp/store/transferStore.ts`
- `src/modules/header/components/TransferDropdown.tsx`

## Files to Modify
- `src/app/App.tsx` (call bootstrapTransferListeners)
- `src/modules/header/Header.tsx` (add TransferDropdown)
- `src/modules/sftp/components/VirtualizedFileList.tsx` (drag and drop)
- `src/modules/sftp/SftpPane.tsx` (wire drop handlers + enqueue_transfer)

## Expected Outcome
- Dragging a file from the remote pane and dropping it on the local pane starts a download. A progress bar appears in the Transfer Dropdown header button.
- Dragging a local file to the remote pane starts an upload.
- The Transfer Dropdown badge shows the number of active transfers.
- When a file conflict occurs, a modal appears and allows the user to overwrite, skip, or rename.
- Cancelling a transfer from the dropdown stops it immediately.
- `pnpm exec tsc --noEmit` passes with zero errors.

## Additional Information
- **Verify:** Run `pnpm exec tsc --noEmit` before marking complete.
- `bootstrapTransferListeners()` is idempotent — calling it more than once does nothing due to the `_listenersBootstrapped` flag.
- The drag state (which pane the drag started from) can be tracked using a module-level variable set in `onDragStart` and checked in `onDrop`. Keep it simple.
- The `formatBytes` utility already exists in `VirtualizedFileList.tsx` — import or move it to a shared `src/modules/sftp/utils.ts` file if needed by `TransferDropdown.tsx`.
- Use `"motion/react"` for any animations in `TransferDropdown.tsx` (e.g., progress bar transitions).
