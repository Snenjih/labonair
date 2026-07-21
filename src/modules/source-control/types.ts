/** The `S<c><m><u>` submodule-state field of a porcelain v2 status entry —
 *  only present when `path` is a submodule gitlink. Reflects the submodule's
 *  own working-tree state (dirty/untracked) and whether its checked-out
 *  commit differs from what the superproject's index records. Does NOT
 *  cover an *uninitialized* submodule — that state produces no status entry
 *  at all and is only visible via `WorkspaceGitState.submodules`. */
export interface SubmoduleState {
  commitChanged: boolean;
  modified: boolean;
  untracked: boolean;
}

export interface FileStatus {
  path: string;
  originalPath: string | null;
  indexStatus: string; // single char: '.', 'A', 'M', 'D', 'R', 'C', 'U'
  worktreeStatus: string;
  submodule: SubmoduleState | null;
}

export type SubmoduleSyncState = "uninitialized" | "pointerChanged" | "conflict" | "clean";

/** One line of `git submodule status` — the only way to detect an
 *  uninitialized submodule (empty gitlink directory), which produces zero
 *  lines from `git status` itself. */
export interface SubmoduleStatus {
  path: string;
  commit: string;
  state: SubmoduleSyncState;
}

export interface GitStatus {
  staged: FileStatus[];
  unstaged: FileStatus[];
  untracked: FileStatus[];
  hasConflicts: boolean;
  mergeInProgress: boolean;
  rebaseInProgress: boolean;
  cherryPickInProgress: boolean;
  ahead: number;
  behind: number;
}

export interface Branch {
  name: string;
  isCurrent: boolean;
  isRemote: boolean;
  upstream: string | null;
  ahead: number;
  behind: number;
}

export interface CommitInfo {
  hash: string;
  shortHash: string;
  parentHashes: string[];
  authorName: string;
  authorEmail: string;
  timestamp: number;
  subject: string;
  refs: string[];
  filesChanged: number;
  insertions: number;
  deletions: number;
}

export interface CommitResult {
  hash: string;
  subject: string;
}

export interface StashEntry {
  index: number;
  message: string;
  branch: string;
  hash: string;
}

export interface FileDiffStat {
  path: string;
  added: number;
  removed: number;
  staged: boolean;
}

/** Bundles the poll cycle's 5 reads into one round-trip — see gitInvoke.ts. */
export interface WorkspaceGitState {
  status: GitStatus;
  branches: Branch[];
  currentBranch: string;
  stash: StashEntry[];
  tags: string[];
  diffStats: FileDiffStat[];
  submodules: SubmoduleStatus[];
}

export type FileListViewMode = "list" | "tree";

export type SelectionMode =
  | { type: "file"; path: string; staged: boolean }
  | { type: "section"; section: "staged" | "unstaged" | "untracked" }
  | { type: "all" }
  | { type: "commit"; hash: string; repositoryPath: string; sessionId?: string };
