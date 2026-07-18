import { handleApiError } from "@/lib/errors";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { create } from "zustand";
import type { FileNode } from "../types";
import { isLabonairError } from "@/types";

interface DirEntry {
  name: string;
  kind: "file" | "dir" | "symlink";
  size: number;
  mtime: number; // milliseconds
}

interface SftpReadDirPage {
  entries: FileNode[];
  has_more: boolean;
  next_offset: number | null;
}

interface FsReadDirPage {
  entries: DirEntry[];
  has_more: boolean;
}

interface SftpTabState {
  localPath: string;
  remotePath: string;
  localFiles: FileNode[];
  remoteFiles: FileNode[];
  /** Whether the remote directory has more entries beyond `remoteFiles` —
   *  drives the "Load more…" row. */
  remoteHasMore: boolean;
  /** Same as `remoteHasMore` but for the local pane (`fs_read_dir_page`). */
  localHasMore: boolean;
  isLoadingLocal: boolean;
  isLoadingRemote: boolean;
  selectedLocalPaths: Set<string>;
  selectedRemotePaths: Set<string>;
  error: string | null;
  /** Set when the backend emits `ssh_connection_lost` for this tab's session — the
   *  live SFTP connection died mid-browsing (not just a single failed request). */
  disconnected: boolean;
  disconnectReason: string | null;
}

interface SftpStore {
  tabs: Record<string, SftpTabState>;

  initTab: (tabId: string, initialRemotePath?: string) => void;
  destroyTab: (tabId: string) => void;

  setLocalPath: (tabId: string, path: string) => void;
  setRemotePath: (tabId: string, path: string) => void;

  loadLocalDir: (tabId: string, path: string) => Promise<void>;
  loadRemoteDir: (tabId: string, path: string) => Promise<void>;
  /** Appends the next page of the current remote directory (offset =
   *  `remoteFiles.length`). No-op if already loading or there's nothing more. */
  loadMoreRemoteDir: (tabId: string) => Promise<void>;
  /** Appends the next page of the current local directory (offset =
   *  `localFiles.length`). No-op if already loading or there's nothing more. */
  loadMoreLocalDir: (tabId: string) => Promise<void>;

  setSelectedLocal: (tabId: string, paths: Set<string>) => void;
  setSelectedRemote: (tabId: string, paths: Set<string>) => void;

  setDisconnected: (tabId: string, reason: string) => void;
  clearDisconnected: (tabId: string) => void;
}

const DEFAULT_TAB_STATE = (): SftpTabState => ({
  localPath: "~",
  remotePath: "/",
  localFiles: [],
  remoteFiles: [],
  remoteHasMore: false,
  localHasMore: false,
  isLoadingLocal: false,
  isLoadingRemote: false,
  selectedLocalPaths: new Set(),
  selectedRemotePaths: new Set(),
  error: null,
  disconnected: false,
  disconnectReason: null,
});

function mapDirEntry(parentPath: string, entry: DirEntry): FileNode {
  const sep = parentPath.endsWith("/") ? "" : "/";
  return {
    name: entry.name,
    path: `${parentPath}${sep}${entry.name}`,
    size: entry.size,
    modified_at: Math.floor(entry.mtime / 1000),
    is_dir: entry.kind === "dir",
    is_symlink: entry.kind === "symlink",
    permissions: "",
  };
}

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
      tabs: {
        ...s.tabs,
        [tabId]: { ...s.tabs[tabId], isLoadingLocal: true, error: null },
      },
    }));
    try {
      // Resolve ~ to an absolute path so file.path values are always absolute.
      // The Rust fs_read_dir_page expands ~ internally but returns only names,
      // so we need the real base path to build correct absolute file paths.
      const resolvedPath = await invoke<string>("fs_resolve_path", { path });
      // Paginated (fs_read_dir_page) instead of the one-shot fs_read_dir — a
      // large local directory (e.g. node_modules) no longer transfers its
      // full entry list in a single IPC round trip, matching the remote
      // pane's existing pagination.
      const page = await invoke<FsReadDirPage>("fs_read_dir_page", {
        path: resolvedPath,
        offset: 0,
        showHidden: true,
      });
      const files = page.entries.map((e) => mapDirEntry(resolvedPath, e));
      set((s) => ({
        tabs: {
          ...s.tabs,
          [tabId]: {
            ...s.tabs[tabId],
            localFiles: files,
            localHasMore: page.has_more,
            localPath: resolvedPath,
            isLoadingLocal: false,
          },
        },
      }));
    } catch (e) {
      handleApiError(e, "Failed to load local directory", "SFTP");
      set((s) => ({
        tabs: {
          ...s.tabs,
          [tabId]: {
            ...s.tabs[tabId],
            isLoadingLocal: false,
            error: isLabonairError(e) ? e.message : String(e),
          },
        },
      }));
    }
  },

  loadMoreLocalDir: async (tabId) => {
    const tab = get().tabs[tabId];
    if (!tab || tab.isLoadingLocal || !tab.localHasMore) return;
    set((s) => ({
      tabs: { ...s.tabs, [tabId]: { ...s.tabs[tabId], isLoadingLocal: true } },
    }));
    try {
      const page = await invoke<FsReadDirPage>("fs_read_dir_page", {
        path: tab.localPath,
        offset: tab.localFiles.length,
        showHidden: true,
      });
      const files = page.entries.map((e) => mapDirEntry(tab.localPath, e));
      set((s) => ({
        tabs: {
          ...s.tabs,
          [tabId]: {
            ...s.tabs[tabId],
            localFiles: [...s.tabs[tabId].localFiles, ...files],
            localHasMore: page.has_more,
            isLoadingLocal: false,
          },
        },
      }));
    } catch (e) {
      handleApiError(e, "Failed to load more local entries", "SFTP");
      set((s) => ({
        tabs: {
          ...s.tabs,
          [tabId]: {
            ...s.tabs[tabId],
            isLoadingLocal: false,
            error: isLabonairError(e) ? e.message : String(e),
          },
        },
      }));
    }
  },

  loadRemoteDir: async (tabId, path) => {
    set((s) => ({
      tabs: {
        ...s.tabs,
        [tabId]: { ...s.tabs[tabId], isLoadingRemote: true, error: null },
      },
    }));
    try {
      // Paginated (sftp_read_dir_page) instead of the one-shot sftp_read_dir
      // — a directory with tens of thousands of entries no longer fetches
      // (and per-symlink readlinks) everything in a single IPC round trip.
      // show_hidden:true mirrors loadLocalDir's fs_read_dir call — hidden-file
      // filtering stays entirely client-side (SftpPane's buildFileList), so
      // that logic doesn't need to change.
      const page = await invoke<SftpReadDirPage>("sftp_read_dir_page", {
        sessionId: tabId,
        path,
        offset: 0,
        showHidden: true,
      });
      set((s) => ({
        tabs: {
          ...s.tabs,
          [tabId]: {
            ...s.tabs[tabId],
            remoteFiles: page.entries,
            remoteHasMore: page.has_more,
            remotePath: path,
            isLoadingRemote: false,
          },
        },
      }));
    } catch (e) {
      handleApiError(e, "Failed to load remote directory", "SFTP");
      set((s) => ({
        tabs: {
          ...s.tabs,
          [tabId]: {
            ...s.tabs[tabId],
            isLoadingRemote: false,
            error: isLabonairError(e) ? e.message : String(e),
          },
        },
      }));
    }
  },

  loadMoreRemoteDir: async (tabId) => {
    const tab = get().tabs[tabId];
    if (!tab || tab.isLoadingRemote || !tab.remoteHasMore) return;
    set((s) => ({
      tabs: { ...s.tabs, [tabId]: { ...s.tabs[tabId], isLoadingRemote: true } },
    }));
    try {
      const page = await invoke<SftpReadDirPage>("sftp_read_dir_page", {
        sessionId: tabId,
        path: tab.remotePath,
        offset: tab.remoteFiles.length,
        showHidden: true,
      });
      set((s) => ({
        tabs: {
          ...s.tabs,
          [tabId]: {
            ...s.tabs[tabId],
            remoteFiles: [...s.tabs[tabId].remoteFiles, ...page.entries],
            remoteHasMore: page.has_more,
            isLoadingRemote: false,
          },
        },
      }));
    } catch (e) {
      handleApiError(e, "Failed to load more remote entries", "SFTP");
      set((s) => ({
        tabs: {
          ...s.tabs,
          [tabId]: {
            ...s.tabs[tabId],
            isLoadingRemote: false,
            error: isLabonairError(e) ? e.message : String(e),
          },
        },
      }));
    }
  },

  setSelectedLocal: (tabId, paths) =>
    set((s) => ({
      tabs: {
        ...s.tabs,
        [tabId]: { ...s.tabs[tabId], selectedLocalPaths: paths },
      },
    })),

  setSelectedRemote: (tabId, paths) =>
    set((s) => ({
      tabs: {
        ...s.tabs,
        [tabId]: { ...s.tabs[tabId], selectedRemotePaths: paths },
      },
    })),

  setDisconnected: (tabId, reason) =>
    set((s) => {
      if (!s.tabs[tabId]) return s;
      return {
        tabs: {
          ...s.tabs,
          [tabId]: { ...s.tabs[tabId], disconnected: true, disconnectReason: reason },
        },
      };
    }),

  clearDisconnected: (tabId) =>
    set((s) => {
      if (!s.tabs[tabId]) return s;
      return {
        tabs: {
          ...s.tabs,
          [tabId]: { ...s.tabs[tabId], disconnected: false, disconnectReason: null },
        },
      };
    }),
}));

let _connectionListenerBootstrapped = false;

/** Mirrors the same `ssh_connection_lost` event pty.rs/worker.rs emit for dead
 *  connections onto whichever SFTP tab owns that session_id, so browsing panes
 *  can show a reconnect affordance instead of silently failing every request. */
export async function bootstrapSftpConnectionListener() {
  if (_connectionListenerBootstrapped) return;
  _connectionListenerBootstrapped = true;

  await listen<{ session_id: string; reason: string }>("ssh_connection_lost", (event) => {
    const { session_id, reason } = event.payload;
    useSftpStore.getState().setDisconnected(session_id, reason);
  });
}
