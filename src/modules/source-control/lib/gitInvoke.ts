import { invoke } from "@tauri-apps/api/core";
import type {
  Branch,
  CommitInfo,
  CommitResult,
  FileDiffStat,
  GitStatus,
  StashEntry,
  WorkspaceGitState,
} from "../types";

/**
 * Every wrapper takes an optional trailing `sessionId` — when set, the
 * command runs against a remote host over that SSH session's existing SFTP
 * connection instead of the local filesystem. `path` is always the
 * repository path as seen from wherever it's executing (local disk path or
 * remote absolute path) — never a local path when `sessionId` is set.
 */
export const git = {
  isRepo: (path: string, sessionId?: string) =>
    invoke<boolean>("git_is_repo", { path, sessionId: sessionId ?? null }),
  getRepoRoot: (path: string, sessionId?: string) =>
    invoke<string>("git_get_repo_root", { path, sessionId: sessionId ?? null }),
  getStatus: (path: string, sessionId?: string) =>
    invoke<GitStatus>("git_get_status", { path, sessionId: sessionId ?? null }),
  getWorkspaceState: (path: string, sessionId?: string) =>
    invoke<WorkspaceGitState>("git_get_workspace_state", { path, sessionId: sessionId ?? null }),
  getCurrentBranch: (path: string, sessionId?: string) =>
    invoke<string>("git_get_current_branch", { path, sessionId: sessionId ?? null }),
  getBranches: (path: string, sessionId?: string) =>
    invoke<Branch[]>("git_get_branches", { path, sessionId: sessionId ?? null }),
  getDiff: (
    path: string,
    file: string,
    staged: boolean,
    ignoreWhitespace?: boolean,
    sessionId?: string,
    isUntracked?: boolean,
  ) =>
    invoke<string>("git_get_diff", {
      path,
      file,
      staged,
      ignoreWhitespace: ignoreWhitespace ?? false,
      isUntracked: isUntracked ?? false,
      sessionId: sessionId ?? null,
    }),
  stageFile: (path: string, file: string, sessionId?: string) =>
    invoke<void>("git_stage_file", { path, file, sessionId: sessionId ?? null }),
  unstageFile: (path: string, file: string, sessionId?: string) =>
    invoke<void>("git_unstage_file", { path, file, sessionId: sessionId ?? null }),
  stageAll: (path: string, sessionId?: string) =>
    invoke<void>("git_stage_all", { path, sessionId: sessionId ?? null }),
  unstageAll: (path: string, sessionId?: string) =>
    invoke<void>("git_unstage_all", { path, sessionId: sessionId ?? null }),
  discardFile: (path: string, file: string, sessionId?: string) =>
    invoke<void>("git_discard_file", { path, file, sessionId: sessionId ?? null }),
  commit: (path: string, message: string, amend: boolean, sessionId?: string) =>
    invoke<CommitResult>("git_commit", { path, message, amend, sessionId: sessionId ?? null }),
  push: (path: string, remote?: string, branch?: string, sessionId?: string) =>
    invoke<string>("git_push", {
      path,
      remote: remote ?? null,
      branch: branch ?? null,
      sessionId: sessionId ?? null,
    }),
  pull: (path: string, sessionId?: string) =>
    invoke<string>("git_pull", { path, sessionId: sessionId ?? null }),
  fetch: (path: string, sessionId?: string) =>
    invoke<string>("git_fetch", { path, sessionId: sessionId ?? null }),
  abort: (path: string, sessionId?: string) =>
    invoke<void>("git_abort", { path, sessionId: sessionId ?? null }),
  getLog: (path: string, limit?: number, allBranches?: boolean, sessionId?: string) =>
    invoke<CommitInfo[]>("git_get_log", {
      path,
      limit: limit ?? null,
      allBranches: allBranches ?? true,
      sessionId: sessionId ?? null,
    }),
  getCommitDetail: (path: string, hash: string, sessionId?: string) =>
    invoke<string>("git_get_commit_detail", { path, hash, sessionId: sessionId ?? null }),
  checkoutBranch: (path: string, branch: string, sessionId?: string) =>
    invoke<void>("git_checkout_branch", { path, branch, sessionId: sessionId ?? null }),
  createBranch: (path: string, name: string, fromRef?: string, checkout?: boolean, sessionId?: string) =>
    invoke<void>("git_create_branch", {
      path,
      name,
      fromRef: fromRef ?? null,
      checkout: checkout ?? true,
      sessionId: sessionId ?? null,
    }),
  deleteBranch: (path: string, name: string, force?: boolean, sessionId?: string) =>
    invoke<void>("git_delete_branch", { path, name, force: force ?? false, sessionId: sessionId ?? null }),
  renameBranch: (path: string, oldName: string, newName: string, sessionId?: string) =>
    invoke<void>("git_rename_branch", { path, oldName, newName, sessionId: sessionId ?? null }),
  stashPush: (path: string, message?: string, includeUntracked?: boolean, sessionId?: string) =>
    invoke<void>("git_stash_push", {
      path,
      message: message ?? null,
      includeUntracked: includeUntracked ?? true,
      sessionId: sessionId ?? null,
    }),
  stashList: (path: string, sessionId?: string) =>
    invoke<StashEntry[]>("git_stash_list", { path, sessionId: sessionId ?? null }),
  stashPop: (path: string, hash: string, sessionId?: string) =>
    invoke<void>("git_stash_pop", { path, hash, sessionId: sessionId ?? null }),
  stashApply: (path: string, hash: string, sessionId?: string) =>
    invoke<void>("git_stash_apply", { path, hash, sessionId: sessionId ?? null }),
  stashDrop: (path: string, hash: string, sessionId?: string) =>
    invoke<void>("git_stash_drop", { path, hash, sessionId: sessionId ?? null }),
  getCommitDiff: (path: string, hash: string, sessionId?: string) =>
    invoke<string>("git_get_commit_diff", { path, hash, sessionId: sessionId ?? null }),
  pushForceWithLease: (path: string, remote?: string, branch?: string, sessionId?: string) =>
    invoke<string>("git_push_force_with_lease", {
      path,
      remote: remote ?? null,
      branch: branch ?? null,
      sessionId: sessionId ?? null,
    }),
  pushSetUpstream: (path: string, remote: string, branch: string, sessionId?: string) =>
    invoke<string>("git_push_set_upstream", { path, remote, branch, sessionId: sessionId ?? null }),
  cherryPick: (path: string, hash: string, sessionId?: string) =>
    invoke<void>("git_cherry_pick", { path, hash, sessionId: sessionId ?? null }),
  getTags: (path: string, sessionId?: string) =>
    invoke<string[]>("git_get_tags", { path, sessionId: sessionId ?? null }),
  createTag: (path: string, name: string, message?: string, hash?: string, sessionId?: string) =>
    invoke<void>("git_create_tag", {
      path,
      name,
      message: message ?? null,
      hash: hash ?? null,
      sessionId: sessionId ?? null,
    }),
  deleteTag: (path: string, name: string, sessionId?: string) =>
    invoke<void>("git_delete_tag", { path, name, sessionId: sessionId ?? null }),
  pushTag: (path: string, name: string, remote?: string, sessionId?: string) =>
    invoke<string>("git_push_tag", { path, name, remote: remote ?? null, sessionId: sessionId ?? null }),
  getDiffStats: (path: string, sessionId?: string) =>
    invoke<FileDiffStat[]>("git_get_diff_stats", { path, sessionId: sessionId ?? null }),
  getCommitNumstat: (path: string, hash: string, sessionId?: string) =>
    invoke<string>("git_get_commit_numstat", { path, hash, sessionId: sessionId ?? null }),
  getRemoteUrl: (path: string, remote?: string, sessionId?: string) =>
    invoke<string>("git_get_remote_url", { path, remote: remote ?? null, sessionId: sessionId ?? null }),
  addToGitignore: (path: string, file: string, sessionId?: string) =>
    invoke<void>("git_add_to_gitignore", { path, file, sessionId: sessionId ?? null }),
  addToExclude: (path: string, file: string, sessionId?: string) =>
    invoke<void>("git_add_to_exclude", { path, file, sessionId: sessionId ?? null }),
  init: (path: string, sessionId?: string) =>
    invoke<void>("git_init", { path, sessionId: sessionId ?? null }),
};
