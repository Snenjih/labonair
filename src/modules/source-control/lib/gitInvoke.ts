import { invoke } from "@tauri-apps/api/core";
import type { GitStatus, Branch, CommitInfo, CommitResult, StashEntry, FileDiffStat } from "../types";

export const git = {
  isRepo: (path: string) => invoke<boolean>("git_is_repo", { path }),
  getRepoRoot: (path: string) => invoke<string>("git_get_repo_root", { path }),
  getStatus: (path: string) => invoke<GitStatus>("git_get_status", { path }),
  getCurrentBranch: (path: string) => invoke<string>("git_get_current_branch", { path }),
  getBranches: (path: string) => invoke<Branch[]>("git_get_branches", { path }),
  getDiff: (path: string, file: string, staged: boolean, ignoreWhitespace?: boolean) =>
    invoke<string>("git_get_diff", { path, file, staged, ignoreWhitespace: ignoreWhitespace ?? false }),
  stageFile: (path: string, file: string) => invoke<void>("git_stage_file", { path, file }),
  unstageFile: (path: string, file: string) => invoke<void>("git_unstage_file", { path, file }),
  stageAll: (path: string) => invoke<void>("git_stage_all", { path }),
  unstageAll: (path: string) => invoke<void>("git_unstage_all", { path }),
  discardFile: (path: string, file: string) => invoke<void>("git_discard_file", { path, file }),
  commit: (path: string, message: string, amend: boolean) =>
    invoke<CommitResult>("git_commit", { path, message, amend }),
  push: (path: string, remote?: string, branch?: string) =>
    invoke<string>("git_push", { path, remote: remote ?? null, branch: branch ?? null }),
  pull: (path: string) => invoke<string>("git_pull", { path }),
  fetch: (path: string) => invoke<string>("git_fetch", { path }),
  abort: (path: string) => invoke<void>("git_abort", { path }),
  getLog: (path: string, limit?: number, allBranches?: boolean) =>
    invoke<CommitInfo[]>("git_get_log", { path, limit: limit ?? null, allBranches: allBranches ?? true }),
  getCommitDetail: (path: string, hash: string) =>
    invoke<string>("git_get_commit_detail", { path, hash }),
  checkoutBranch: (path: string, branch: string) =>
    invoke<void>("git_checkout_branch", { path, branch }),
  createBranch: (path: string, name: string, fromRef?: string, checkout?: boolean) =>
    invoke<void>("git_create_branch", { path, name, fromRef: fromRef ?? null, checkout: checkout ?? true }),
  deleteBranch: (path: string, name: string, force?: boolean) =>
    invoke<void>("git_delete_branch", { path, name, force: force ?? false }),
  renameBranch: (path: string, oldName: string, newName: string) =>
    invoke<void>("git_rename_branch", { path, oldName, newName }),
  stashPush: (path: string, message?: string, includeUntracked?: boolean) =>
    invoke<void>("git_stash_push", {
      path,
      message: message ?? null,
      includeUntracked: includeUntracked ?? true,
    }),
  stashList: (path: string) =>
    invoke<StashEntry[]>("git_stash_list", { path }),
  stashPop: (path: string, hash: string) =>
    invoke<void>("git_stash_pop", { path, hash }),
  stashApply: (path: string, hash: string) =>
    invoke<void>("git_stash_apply", { path, hash }),
  stashDrop: (path: string, hash: string) =>
    invoke<void>("git_stash_drop", { path, hash }),
  getCommitDiff: (path: string, hash: string) =>
    invoke<string>("git_get_commit_diff", { path, hash }),
  pushForceWithLease: (path: string, remote?: string, branch?: string) =>
    invoke<string>("git_push_force_with_lease", { path, remote: remote ?? null, branch: branch ?? null }),
  pushSetUpstream: (path: string, remote: string, branch: string) =>
    invoke<string>("git_push_set_upstream", { path, remote, branch }),
  cherryPick: (path: string, hash: string) =>
    invoke<void>("git_cherry_pick", { path, hash }),
  getTags: (path: string) =>
    invoke<string[]>("git_get_tags", { path }),
  createTag: (path: string, name: string, message?: string, hash?: string) =>
    invoke<void>("git_create_tag", { path, name, message: message ?? null, hash: hash ?? null }),
  deleteTag: (path: string, name: string) =>
    invoke<void>("git_delete_tag", { path, name }),
  pushTag: (path: string, name: string, remote?: string) =>
    invoke<string>("git_push_tag", { path, name, remote: remote ?? null }),
  getDiffStats: (path: string) =>
    invoke<FileDiffStat[]>("git_get_diff_stats", { path }),
  getCommitNumstat: (path: string, hash: string) =>
    invoke<string>("git_get_commit_numstat", { path, hash }),
  getRemoteUrl: (path: string, remote?: string) =>
    invoke<string>("git_get_remote_url", { path, remote: remote ?? null }),
  addToGitignore: (path: string, file: string) =>
    invoke<void>("git_add_to_gitignore", { path, file }),
  addToExclude: (path: string, file: string) =>
    invoke<void>("git_add_to_exclude", { path, file }),
};
