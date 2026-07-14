import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
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
  conflict?: { src_path: string; dest_path: string };
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
    resolution: "overwrite" | "skip" | "rename",
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
        j.id === jobId ? { ...j, conflict: undefined, status: "running" as TransferStatus } : j,
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
}
