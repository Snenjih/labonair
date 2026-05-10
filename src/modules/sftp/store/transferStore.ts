import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";

export type TransferStatus =
  | "queued"
  | "running"
  | "paused"
  | "cancelled"
  | "completed"
  | { type: "failed"; message: string };

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
  conflict?: { src_path: string; dest_path: string };
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
    set((s) => ({
      jobs: s.jobs.map((j) =>
        j.id === jobId
          ? { ...j, conflict: undefined, status: "running" as TransferStatus }
          : j
      ),
    }));
    await invoke("resolve_conflict", {
      job_id: jobId,
      resolution,
      new_name: newName ?? null,
    });
  },
}));

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
    }
  );
}
