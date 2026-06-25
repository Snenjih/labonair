import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { create } from "zustand";

const LAST_CHECK_KEY = "labonair:updater:last-check";
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

export type UpdaterStatus =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "uptodate" }
  | { kind: "available"; update: Update }
  | { kind: "downloading"; downloaded: number; contentLength: number | null }
  | { kind: "ready" }
  | { kind: "error"; message: string };

interface UpdaterState {
  status: UpdaterStatus;
  dialogOpen: boolean;
  openDialog: () => void;
  closeDialog: () => void;
  runCheck: (options?: { manual?: boolean }) => Promise<void>;
  install: () => Promise<void>;
  dismiss: () => void;
}

export const useUpdaterStore = create<UpdaterState>((set, get) => ({
  status: { kind: "idle" },
  dialogOpen: false,

  openDialog: () => set({ dialogOpen: true }),
  closeDialog: () => set({ dialogOpen: false }),

  runCheck: async ({ manual } = {}) => {
    const current = get().status.kind;
    if (current === "checking" || current === "downloading" || current === "ready") return;

    if (!manual) {
      const last = Number(localStorage.getItem(LAST_CHECK_KEY) ?? 0);
      if (Date.now() - last < CHECK_INTERVAL_MS) return;
    }

    set({ status: { kind: "checking" } });
    try {
      const update = await check();
      localStorage.setItem(LAST_CHECK_KEY, String(Date.now()));
      if (update) {
        set({ status: { kind: "available", update }, dialogOpen: true });
      } else {
        set({ status: { kind: "uptodate" } });
      }
    } catch (err) {
      set({ status: { kind: "error", message: String(err) } });
    }
  },

  install: async () => {
    const { status } = get();
    if (status.kind !== "available") return;
    const { update } = status;
    let total: number | null = null;
    let downloaded = 0;
    set({ status: { kind: "downloading", downloaded: 0, contentLength: null } });
    try {
      await update.downloadAndInstall((event) => {
        if (event.event === "Started") {
          total = event.data.contentLength ?? null;
          set({ status: { kind: "downloading", downloaded: 0, contentLength: total } });
        } else if (event.event === "Progress") {
          downloaded += event.data.chunkLength;
          set({ status: { kind: "downloading", downloaded, contentLength: total } });
        } else if (event.event === "Finished") {
          set({ status: { kind: "ready" } });
        }
      });
      await relaunch();
    } catch (err) {
      set({ status: { kind: "error", message: String(err) } });
    }
  },

  dismiss: () => {
    set({ dialogOpen: false });
  },
}));
