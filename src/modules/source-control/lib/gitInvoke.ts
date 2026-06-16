import { invoke } from "@tauri-apps/api/core";
import type { GitStatus, Branch, CommitInfo, CommitResult } from "../types";

export const git = {
  isRepo: (path: string) => invoke<boolean>("git_is_repo", { path }),
  getRepoRoot: (path: string) => invoke<string>("git_get_repo_root", { path }),
  getStatus: (path: string) => invoke<GitStatus>("git_get_status", { path }),
  getCurrentBranch: (path: string) => invoke<string>("git_get_current_branch", { path }),
  getBranches: (path: string) => invoke<Branch[]>("git_get_branches", { path }),
  getDiff: (path: string, file: string, staged: boolean) =>
    invoke<string>("git_get_diff", { path, file, staged }),
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
};
