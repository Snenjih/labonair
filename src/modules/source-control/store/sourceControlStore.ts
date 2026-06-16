import { create } from "zustand";
import type { GitStatus } from "../types";

export interface SourceControlState {
  repoRoot: string | null;
  isRepo: boolean;
  status: GitStatus | null;
  selectedFile: { path: string; staged: boolean } | null;
  diffContent: string | null;
  isDiffLoading: boolean;
  isStatusLoading: boolean;
  operationInProgress: "commit" | "push" | "pull" | "fetch" | "abort" | null;
  error: string | null;
  commitMessage: string;

  // actions
  setRepoInfo: (isRepo: boolean, repoRoot: string | null) => void;
  setStatus: (status: GitStatus | null) => void;
  setIsStatusLoading: (loading: boolean) => void;
  selectFile: (path: string, staged: boolean) => void;
  clearSelectedFile: () => void;
  setDiffContent: (content: string | null) => void;
  setIsDiffLoading: (loading: boolean) => void;
  setOperationInProgress: (op: SourceControlState["operationInProgress"]) => void;
  setError: (error: string | null) => void;
  setCommitMessage: (msg: string) => void;
}

export const useSourceControlStore = create<SourceControlState>()((set) => ({
  repoRoot: null,
  isRepo: false,
  status: null,
  selectedFile: null,
  diffContent: null,
  isDiffLoading: false,
  isStatusLoading: false,
  operationInProgress: null,
  error: null,
  commitMessage: "",

  setRepoInfo: (isRepo, repoRoot) => set({ isRepo, repoRoot }),
  setStatus: (status) => set({ status }),
  setIsStatusLoading: (isStatusLoading) => set({ isStatusLoading }),
  selectFile: (path, staged) => set({ selectedFile: { path, staged } }),
  clearSelectedFile: () => set({ selectedFile: null, diffContent: null }),
  setDiffContent: (diffContent) => set({ diffContent }),
  setIsDiffLoading: (isDiffLoading) => set({ isDiffLoading }),
  setOperationInProgress: (operationInProgress) => set({ operationInProgress }),
  setError: (error) => set({ error }),
  setCommitMessage: (commitMessage) => set({ commitMessage }),
}));
