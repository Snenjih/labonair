import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import type { FileNode } from "../types";

interface DirEntry {
  name: string;
  kind: "file" | "dir" | "symlink";
  size: number;
  mtime: number; // milliseconds
}

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

export const useSftpStore = create<SftpStore>((set) => ({
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
      // The Rust fs_read_dir expands ~ internally but returns only names, so
      // we need the real base path to build correct absolute file paths.
      const resolvedPath = await invoke<string>("fs_resolve_path", { path });
      const entries = await invoke<DirEntry[]>("fs_read_dir", { path: resolvedPath, showHidden: true });
      const files = entries.map((e) => mapDirEntry(resolvedPath, e));
      set((s) => ({
        tabs: {
          ...s.tabs,
          [tabId]: {
            ...s.tabs[tabId],
            localFiles: files,
            localPath: resolvedPath,
            isLoadingLocal: false,
          },
        },
      }));
    } catch (e) {
      set((s) => ({
        tabs: {
          ...s.tabs,
          [tabId]: {
            ...s.tabs[tabId],
            isLoadingLocal: false,
            error: String(e),
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
      const files = await invoke<FileNode[]>("sftp_read_dir", { sessionId: tabId, path });
      set((s) => ({
        tabs: {
          ...s.tabs,
          [tabId]: {
            ...s.tabs[tabId],
            remoteFiles: files,
            remotePath: path,
            isLoadingRemote: false,
          },
        },
      }));
    } catch (e) {
      set((s) => ({
        tabs: {
          ...s.tabs,
          [tabId]: {
            ...s.tabs[tabId],
            isLoadingRemote: false,
            error: String(e),
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
}));
