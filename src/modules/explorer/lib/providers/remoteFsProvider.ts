import { invoke } from "@tauri-apps/api/core";
import type { Capabilities, FileEntry, FsProvider, ReadDirPage, SearchHit } from "../fsProvider";

const REMOTE_CAPABILITIES: Capabilities = {
  // SFTP has no inotify-equivalent — browsing is pull-only (manual refresh /
  // low-frequency polling added in a later phase), never OS-pushed.
  supportsWatch: false,
  // Reveal-in-Finder opens the *local* OS file manager with a local path —
  // meaningless for a path that only exists on the remote host.
  supportsReveal: false,
  // Native OS drag needs a real local file handle to hand the OS; remote
  // entries only exist on the far side of the SSH connection.
  supportsNativeDrag: false,
  // Dropping onto a terminal is just a path string paste — no OS handle
  // needed, so this works for remote too.
  supportsInternalDrag: true,
  supportsChmod: true,
  supportsChown: true,
  supportsCalculateSize: true,
  // No .gitignore concept over SFTP — every entry is reported as not-ignored.
  supportsGitignore: false,
};

export type RawFileNode = {
  name: string;
  path: string;
  size: number;
  modified_at: number; // seconds
  is_dir: boolean;
  is_symlink: boolean;
  symlink_target?: string;
  permissions: string;
};

function joinPath(parent: string, name: string): string {
  if (parent.endsWith("/")) return `${parent}${name}`;
  return `${parent}/${name}`;
}

/** Normalizes a raw `FileNode` (Rust, `modified_at` in seconds) into the
 *  shared `FileEntry` shape (`mtimeMs` always in milliseconds). Exported for
 *  unit testing without a live SFTP session. */
export function toFileEntry(n: RawFileNode): FileEntry {
  return {
    name: n.name,
    path: n.path,
    kind: n.is_symlink ? "symlink" : n.is_dir ? "dir" : "file",
    size: n.size,
    mtimeMs: n.modified_at * 1000,
    isIgnored: false,
    symlinkTarget: n.symlink_target,
    permissions: n.permissions,
  };
}

/** Maps one `sftp_deep_search` hit path into the shared `SearchHit` shape.
 *  Exported for unit testing without a live SFTP session. */
export function toSearchHit(path: string, root: string): SearchHit {
  const name = path.split("/").pop() ?? path;
  const rel = path.startsWith(root) ? path.slice(root.length).replace(/^\//, "") : path;
  return { path, rel, name, is_dir: false };
}

/** Wraps the `sftp_*` Tauri commands for a single SSH session behind the
 *  shared FsProvider shape. `sessionId` is caller-owned — either an existing
 *  SFTP tab's session (reused as-is) or a lazy session `useLazyExplorerSession`
 *  manages the connect/disconnect lifecycle of. */
export function createRemoteFsProvider(sessionId: string, hostId: string): FsProvider {
  return {
    id: `ssh:${hostId}`,
    capabilities: REMOTE_CAPABILITIES,
    joinPath,

    async readDir(path, opts) {
      const raw = await invoke<{ entries: RawFileNode[]; has_more: boolean }>("sftp_read_dir_page", {
        sessionId,
        path,
        offset: opts?.offset ?? 0,
        showHidden: opts?.showHidden ?? false,
      });
      const page: ReadDirPage = { entries: raw.entries.map(toFileEntry), hasMore: raw.has_more };
      return page;
    },

    async rename(from, to) {
      await invoke("sftp_rename", { sessionId, oldPath: from, newPath: to });
    },

    async delete(paths) {
      await invoke("sftp_delete", { sessionId, paths });
    },

    async mkdir(path) {
      // recursive left at its default (false) — matches sftp_mkdir's natural
      // "fails if it already exists" behavior, same as fs_create_dir's local
      // "New Folder" semantics for a single new path segment.
      await invoke("sftp_mkdir", { sessionId, path });
    },

    async createFile(path) {
      await invoke("sftp_create_file", { sessionId, path });
    },

    async chmod(path, permissions) {
      await invoke("sftp_chmod", { sessionId, path, permissions });
    },

    async chown(path, owner, group) {
      await invoke("sftp_chown", { sessionId, path, owner, group });
    },

    async search(root, query, opts) {
      // sftp_deep_search only returns matching paths (via remote `find`), not
      // full stat info — file/dir distinction isn't available without an
      // extra round-trip per hit, so every hit is reported as a file. Good
      // enough for "jump to this path"; not used for anything that branches
      // on directory-ness.
      const paths = await invoke<string[]>("sftp_deep_search", {
        sessionId,
        startPath: root,
        query,
      });
      const limit = opts?.limit ?? 200;
      return paths.slice(0, limit).map((p) => toSearchHit(p, root));
    },
  };
}
