import type { FileNode } from "./types";

/** Blurs the currently focused text input, if any — used to force-exit
 *  rename/path-edit mode whenever a drag or marquee-select interaction begins. */
export function blurActiveInput(): void {
  const el = document.activeElement;
  if (el instanceof HTMLInputElement) el.blur();
}

export function parentPath(p: string): string {
  if (p === "/" || p === "") return "/";
  const trimmed = p.endsWith("/") ? p.slice(0, -1) : p;
  const lastSlash = trimmed.lastIndexOf("/");
  if (lastSlash <= 0) return "/";
  return trimmed.slice(0, lastSlash);
}

/** Validates a user-typed name for a new file/folder or a rename. Trims,
 *  rejects empty/"."/"..", and rejects path separators — except "/" is
 *  allowed when `allowNested` is set, matching `fs_create_dir`'s existing
 *  "typing a/b/c creates the full chain" behavior for local New Folder.
 *  Returns null if the name is invalid. */
export function sanitizeEntryName(raw: string, opts?: { allowNested?: boolean }): string | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === "." || trimmed === "..") return null;
  if (trimmed.includes("\\")) return null;
  if (!opts?.allowNested && trimmed.includes("/")) return null;
  return trimmed;
}

/** Sentinel path for the synthetic "creating a new entry" row — distinct
 *  from `UP_ENTRY`'s `path: ""` so the two can never be ambiguous in a
 *  `selectedPaths.has(...)` check. */
export const SYNTHETIC_ENTRY_PATH = " __creating__";

export interface SyntheticEntry extends FileNode {
  __synthetic: "folder" | "file";
}

/** Builds the fake row shown while the user is typing a new file/folder
 *  name inline — mirrors the `UP_ENTRY` pattern used for the ".." row. */
export function buildSyntheticEntry(kind: "folder" | "file"): SyntheticEntry {
  return {
    name: "",
    path: SYNTHETIC_ENTRY_PATH,
    size: 0,
    modified_at: 0,
    is_dir: kind === "folder",
    is_symlink: false,
    permissions: "",
    __synthetic: kind,
  };
}

export function isSyntheticEntry(f: FileNode): f is SyntheticEntry {
  return "__synthetic" in f;
}
