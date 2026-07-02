import { invoke } from "@tauri-apps/api/core";
import type { Capabilities, FileEntry, FsProvider, ReadDirPage, SearchHit } from "../fsProvider";

const LOCAL_CAPABILITIES: Capabilities = {
  supportsWatch: true,
  supportsReveal: true,
  supportsNativeDrag: true,
  supportsInternalDrag: true,
  supportsChmod: false,
  supportsChown: false,
  supportsCalculateSize: false,
  supportsGitignore: true,
};

type RawDirEntry = {
  name: string;
  kind: "file" | "dir" | "symlink";
  size: number;
  mtime: number;
  is_ignored?: boolean;
};

function joinPath(parent: string, name: string): string {
  if (parent.endsWith("/")) return `${parent}${name}`;
  return `${parent}/${name}`;
}

/** Wraps the existing local `fs_*` Tauri commands behind the shared FsProvider shape. */
export function createLocalFsProvider(): FsProvider {
  return {
    id: "local",
    capabilities: LOCAL_CAPABILITIES,
    joinPath,

    async readDir(path, opts) {
      const raw = await invoke<RawDirEntry[]>("fs_read_dir", {
        path,
        showHidden: opts?.showHidden ?? false,
      });
      const entries: FileEntry[] = raw.map((e) => ({
        name: e.name,
        path: joinPath(path, e.name),
        kind: e.kind,
        size: e.size,
        mtimeMs: e.mtime,
        isIgnored: e.is_ignored ?? false,
      }));
      // fs_read_dir always returns the full listing in one call — no pagination locally.
      const page: ReadDirPage = { entries, hasMore: false };
      return page;
    },

    async rename(from, to) {
      await invoke("fs_rename", { from, to });
    },

    async delete(paths) {
      for (const path of paths) {
        await invoke("fs_delete", { path });
      }
    },

    async mkdir(path) {
      // fs_create_dir already creates intermediate directories (create_dir_all).
      await invoke("fs_create_dir", { path });
    },

    async createFile(path) {
      await invoke("fs_create_file", { path });
    },

    async search(root, query, opts) {
      return invoke<SearchHit[]>("fs_search", {
        root,
        query,
        limit: opts?.limit ?? 200,
        showHidden: opts?.showHidden ?? false,
      });
    },

    async watch(path) {
      await invoke("fs_watch_dir", { path });
    },

    async unwatch(path) {
      await invoke("fs_unwatch_dir", { path });
    },

    async syncWatchers(paths) {
      await invoke("fs_sync_watchers", { paths });
    },
  };
}
