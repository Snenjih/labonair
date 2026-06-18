export interface FileStatus {
  path: string;
  originalPath: string | null;
  indexStatus: string; // single char: ' ', 'A', 'M', 'D', 'R', 'C', 'U', '?'
  worktreeStatus: string;
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

export type SelectionMode =
  | { type: 'file'; path: string; staged: boolean }
  | { type: 'section'; section: 'staged' | 'unstaged' | 'untracked' }
  | { type: 'all' }
  | { type: 'commit'; hash: string; repositoryPath: string };
