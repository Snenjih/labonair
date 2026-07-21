import type { FileStatus } from "../types";

function basename(path: string): string {
  const parts = path.split("/").filter(Boolean);
  return parts.length ? parts[parts.length - 1] : path;
}

/** Sorts a copy of `files` — by full path (directory-first ordering) when
 *  `sortByPath` is true, otherwise by filename alone so files that share a
 *  name across different directories group together. */
export function sortFileStatuses(files: FileStatus[], sortByPath: boolean): FileStatus[] {
  const copy = [...files];
  if (sortByPath) {
    copy.sort((a, b) => a.path.localeCompare(b.path));
  } else {
    copy.sort((a, b) => basename(a.path).localeCompare(basename(b.path)) || a.path.localeCompare(b.path));
  }
  return copy;
}

export interface FileTreeFolderNode {
  type: "folder";
  name: string;
  /** Slash-joined path from the section root — stable key, not a real FS path. */
  key: string;
  children: FileTreeNode[];
}

export interface FileTreeFileNode {
  type: "file";
  key: string;
  file: FileStatus;
}

export type FileTreeNode = FileTreeFolderNode | FileTreeFileNode;

/** Builds a nested folder tree from a flat, already-sorted file list —
 *  splits each `file.path` on "/" and groups shared directory prefixes into
 *  `FileTreeFolderNode`s. Single-child folder chains are NOT collapsed
 *  (e.g. `src/modules/foo.ts` keeps `src` and `modules` as separate rows) —
 *  simpler to reason about than path-compression and matches how the rest
 *  of the file list already renders one row per segment. */
export function buildFileTree(files: FileStatus[]): FileTreeNode[] {
  const root: FileTreeFolderNode = { type: "folder", name: "", key: "", children: [] };

  for (const file of files) {
    const segments = file.path.split("/").filter(Boolean);
    let cursor = root;
    for (let i = 0; i < segments.length - 1; i++) {
      const segment = segments[i];
      const key = cursor.key ? `${cursor.key}/${segment}` : segment;
      let next = cursor.children.find(
        (c): c is FileTreeFolderNode => c.type === "folder" && c.name === segment,
      );
      if (!next) {
        next = { type: "folder", name: segment, key, children: [] };
        cursor.children.push(next);
      }
      cursor = next;
    }
    const fileName = segments[segments.length - 1] ?? file.path;
    const key = cursor.key ? `${cursor.key}/${fileName}` : fileName;
    cursor.children.push({ type: "file", key, file });
  }

  return root.children;
}
