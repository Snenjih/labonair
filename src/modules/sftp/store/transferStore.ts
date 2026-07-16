import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { useSftpStore } from "./sftpStore";

export type TransferStatus = "queued" | "running" | "paused" | "cancelled" | "completed" | { failed: string };

export interface TransferJob {
  id: string;
  session_id: string;
  src_path: string;
  dest_path: string;
  direction: "upload" | "download";
  status: TransferStatus;
  bytes_total: number;
  bytes_transferred: number;
  speed_bps: number;
  skipped_count: number;
  conflict?: { src_path: string; dest_path: string };
  file_error?: { path: string; error: string };
}

export interface TransferStep {
  ts: number;
  message: string;
}

interface TransferState {
  jobs: TransferJob[];
  /** Timestamped per-job log, kept only as long as the job itself is shown. */
  stepsByJob: Record<string, TransferStep[]>;
  addJob: (job: TransferJob) => void;
  updateJob: (job: TransferJob) => void;
  removeJob: (id: string) => void;
  clearCompleted: () => void;
  addStep: (jobId: string, step: TransferStep) => void;
  cancelJob: (id: string) => Promise<void>;
  resolveConflict: (
    jobId: string,
    resolution: "overwrite" | "skip" | "rename" | "abort" | "skip_all",
    newName?: string,
  ) => Promise<void>;
}

export const useTransferStore = create<TransferState>((set) => ({
  jobs: [],
  stepsByJob: {},

  addJob: (job) => set((s) => ({ jobs: [job, ...s.jobs] })),

  updateJob: (job) =>
    set((s) => ({
      jobs: s.jobs.map((j) => (j.id === job.id ? { ...j, ...job } : j)),
    })),

  removeJob: (id) =>
    set((s) => {
      const { [id]: _, ...rest } = s.stepsByJob;
      return { jobs: s.jobs.filter((j) => j.id !== id), stepsByJob: rest };
    }),

  clearCompleted: () =>
    set((s) => {
      const kept = s.jobs.filter((j) => j.status !== "completed" && j.status !== "cancelled");
      const keptIds = new Set(kept.map((j) => j.id));
      const stepsByJob = Object.fromEntries(
        Object.entries(s.stepsByJob).filter(([jobId]) => keptIds.has(jobId)),
      );
      return { jobs: kept, stepsByJob };
    }),

  addStep: (jobId, step) =>
    set((s) => ({
      stepsByJob: { ...s.stepsByJob, [jobId]: [...(s.stepsByJob[jobId] ?? []), step] },
    })),

  cancelJob: async (id) => {
    await invoke("cancel_transfer", { jobId: id });
  },

  resolveConflict: async (jobId, resolution, newName) => {
    set((s) => ({
      jobs: s.jobs.map((j) =>
        j.id === jobId
          ? { ...j, conflict: undefined, file_error: undefined, status: "running" as TransferStatus }
          : j,
      ),
    }));
    await invoke("resolve_conflict", {
      jobId,
      resolution,
      newName: newName ?? null,
    });
  },
}));

let _listenersBootstrapped = false;

export async function bootstrapTransferListeners() {
  if (_listenersBootstrapped) return;
  _listenersBootstrapped = true;

  await listen<TransferJob>("transfer_progress", (event) => {
    const job = event.payload;
    const store = useTransferStore.getState();
    const existing = store.jobs.find((j) => j.id === job.id);
    if (existing) {
      store.updateJob(job);
    } else {
      store.addJob(job);
    }

    // Refresh the relevant pane when a transfer finishes
    if (job.status === "completed") {
      const sftp = useSftpStore.getState();
      const tabState = sftp.tabs[job.session_id];
      if (tabState) {
        if (job.direction === "download") {
          void sftp.loadLocalDir(job.session_id, tabState.localPath);
        } else {
          void sftp.loadRemoteDir(job.session_id, tabState.remotePath);
        }
      }
    }
  });

  await listen<{ job_id: string; ts: number; message: string }>("transfer_step", (event) => {
    const { job_id, ts, message } = event.payload;
    useTransferStore.getState().addStep(job_id, { ts, message });
  });

  await listen<{ job_id: string; src_path: string; dest_path: string }>("file_conflict", (event) => {
    const store = useTransferStore.getState();
    const job = store.jobs.find((j) => j.id === event.payload.job_id);
    if (!job) return;
    store.updateJob({
      ...job,
      status: "paused",
      conflict: {
        src_path: event.payload.src_path,
        dest_path: event.payload.dest_path,
      },
    });
  });

  await listen<{ job_id: string; path: string; error: string }>("file_error", (event) => {
    const store = useTransferStore.getState();
    const job = store.jobs.find((j) => j.id === event.payload.job_id);
    if (!job) return;
    store.updateJob({
      ...job,
      status: "paused",
      file_error: {
        path: event.payload.path,
        error: event.payload.error,
      },
    });
  });
}

/** Pushes the worker-wide transfer settings (concurrency, chunk size,
 *  default conflict policy) to the Rust worker. Unlike most preferences,
 *  these affect the SFTP worker loop rather than a single command call, so
 *  they're synced once at startup and again on every change instead of being
 *  passed as a per-`enqueue_transfer` argument. */
async function pushTransferSettings(): Promise<void> {
  const prefs = usePreferencesStore.getState();
  try {
    await invoke("sftp_update_transfer_settings", {
      maxConcurrent: prefs.sftpMaxConcurrentTransfers,
      chunkSizeBytes: prefs.sftpChunkSizeKb * 1024,
      defaultConflictResolution: prefs.sftpDefaultConflictResolution,
      onFolderFileError: prefs.sftpOnFolderFileError,
    });
  } catch (e) {
    console.warn("[sftp] failed to push transfer settings:", e);
  }
}

let _transferSettingsSyncBootstrapped = false;

export function bootstrapTransferSettingsSync(): void {
  if (_transferSettingsSyncBootstrapped) return;
  _transferSettingsSyncBootstrapped = true;
  void pushTransferSettings();
  usePreferencesStore.subscribe((state, prev) => {
    if (
      state.sftpMaxConcurrentTransfers !== prev.sftpMaxConcurrentTransfers ||
      state.sftpChunkSizeKb !== prev.sftpChunkSizeKb ||
      state.sftpDefaultConflictResolution !== prev.sftpDefaultConflictResolution ||
      state.sftpOnFolderFileError !== prev.sftpOnFolderFileError
    ) {
      void pushTransferSettings();
    }
  });
}
