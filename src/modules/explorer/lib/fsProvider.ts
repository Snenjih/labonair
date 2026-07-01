export type FileEntryKind = "file" | "dir" | "symlink";

/** Normalized directory entry shared by every FsProvider implementation. */
export type FileEntry = {
  name: string;
  path: string;
  kind: FileEntryKind;
  size: number;
  /** Always milliseconds since UNIX epoch, regardless of backend units. */
  mtimeMs: number;
  isIgnored: boolean;
  symlinkTarget?: string;
  permissions?: string;
};

export type SearchHit = {
  path: string;
  rel: string;
  name: string;
  is_dir: boolean;
};

/** What a given backend can actually do — gates UI affordances instead of hard branching on scope. */
export type Capabilities = {
  supportsWatch: boolean;
  supportsReveal: boolean;
  supportsNativeDrag: boolean;
  supportsChmod: boolean;
  supportsChown: boolean;
  supportsCalculateSize: boolean;
  supportsGitignore: boolean;
};

export type ReadDirPage = {
  entries: FileEntry[];
  hasMore: boolean;
};

export interface FsProvider {
  /** Stable identity used for store namespacing, e.g. "local" or "ssh:<hostId>". */
  readonly id: string;
  readonly capabilities: Capabilities;

  readDir(path: string, opts?: { showHidden?: boolean; offset?: number }): Promise<ReadDirPage>;
  rename(from: string, to: string): Promise<void>;
  delete(paths: string[]): Promise<void>;
  mkdir(path: string): Promise<void>;
  createFile(path: string): Promise<void>;
  search(root: string, query: string, opts?: { limit?: number; showHidden?: boolean }): Promise<SearchHit[]>;

  watch?(path: string): Promise<void>;
  unwatch?(path: string): Promise<void>;
  syncWatchers?(paths: string[]): Promise<void>;

  joinPath(parent: string, name: string): string;
}
