import { load } from "@tauri-apps/plugin-store";
import { create } from "zustand";
import type {
  Branch,
  FileDiffStat,
  FileListViewMode,
  GitStatus,
  SelectionMode,
  StashEntry,
  SubmoduleStatus,
} from "../types";

const STORE_FILE = "labonair-git.json";
const STORE_KEY = "recentMessages";

function getStore() {
  return load(STORE_FILE);
}

export interface SourceControlState {
  repoRoot: string | null;
  /** Set when the resolved target is a remote SSH host — passed to every
   *  `git.*` call so it routes through that session instead of the local
   *  filesystem. `null` for local targets. */
  sessionId: string | null;
  hostId: string | null;
  isRepo: boolean;
  status: GitStatus | null;
  selectionMode: SelectionMode | null;
  diffContent: string | null;
  isDiffLoading: boolean;
  isStatusLoading: boolean;
  operationInProgress: "commit" | "push" | "pull" | "fetch" | "abort" | "continue" | null;
  error: string | null;
  commitMessage: string;
  diffViewMode: "unified" | "split";
  ignoreWhitespace: boolean;

  // file list display
  fileListViewMode: FileListViewMode;
  sortByPath: boolean;

  // branch
  branchList: Branch[];
  isBranchLoading: boolean;
  currentBranch: string;

  // stash
  stashEntries: StashEntry[];
  isStashLoading: boolean;
  stashError: string | null;

  // tags
  tags: string[];

  // diff stats per file
  diffStats: FileDiffStat[];

  // submodules (recognize + label only — see FileChangeItem's badge)
  submodules: SubmoduleStatus[];

  // recent commit messages
  recentMessages: string[];

  // actions
  setRepoInfo: (isRepo: boolean, repoRoot: string | null) => void;
  setTarget: (hostId: string | null, sessionId: string | null) => void;
  setDiffStats: (stats: FileDiffStat[]) => void;
  setSubmodules: (submodules: SubmoduleStatus[]) => void;
  setStatus: (status: GitStatus | null) => void;
  setIsStatusLoading: (loading: boolean) => void;
  selectFile: (path: string, staged: boolean) => void;
  selectSection: (section: "staged" | "unstaged" | "untracked") => void;
  selectAll: () => void;
  selectCommitDiff: (hash: string, repositoryPath: string, sessionId?: string) => void;
  clearSelectedFile: () => void;
  setDiffContent: (content: string | null) => void;
  setIsDiffLoading: (loading: boolean) => void;
  setOperationInProgress: (op: SourceControlState["operationInProgress"]) => void;
  setError: (error: string | null) => void;
  setCommitMessage: (msg: string) => void;
  setDiffViewMode: (mode: "unified" | "split") => void;
  setIgnoreWhitespace: (v: boolean) => void;
  setFileListViewMode: (mode: FileListViewMode) => void;
  setSortByPath: (v: boolean) => void;

  // branch actions
  setBranchList: (branches: Branch[]) => void;
  setIsBranchLoading: (v: boolean) => void;
  setCurrentBranch: (b: string) => void;

  // stash actions
  setStashEntries: (entries: StashEntry[]) => void;
  setIsStashLoading: (v: boolean) => void;
  setStashError: (err: string | null) => void;

  // tag actions
  setTags: (tags: string[]) => void;

  // recent message actions
  addRecentMessage: (msg: string) => void;
  hydrateRecentMessages: () => Promise<void>;
}

export const useSourceControlStore = create<SourceControlState>()((set) => ({
  repoRoot: null,
  sessionId: null,
  hostId: null,
  isRepo: false,
  status: null,
  selectionMode: null,
  diffContent: null,
  isDiffLoading: false,
  isStatusLoading: false,
  operationInProgress: null,
  error: null,
  commitMessage: "",
  diffViewMode: "unified",
  ignoreWhitespace: false,

  fileListViewMode: "list",
  sortByPath: true,

  branchList: [],
  isBranchLoading: false,
  currentBranch: "",

  stashEntries: [],
  isStashLoading: false,
  stashError: null,

  tags: [],

  diffStats: [],
  submodules: [],
  recentMessages: [],

  setRepoInfo: (isRepo, repoRoot) => set({ isRepo, repoRoot }),
  setTarget: (hostId, sessionId) => set({ hostId, sessionId }),
  setDiffStats: (diffStats) => set({ diffStats }),
  setSubmodules: (submodules) => set({ submodules }),
  setStatus: (status) => set({ status }),
  setIsStatusLoading: (isStatusLoading) => set({ isStatusLoading }),
  selectFile: (path, staged) => set({ selectionMode: { type: "file", path, staged } }),
  selectSection: (section) => set({ selectionMode: { type: "section", section } }),
  selectAll: () => set({ selectionMode: { type: "all" } }),
  selectCommitDiff: (hash, repositoryPath, sessionId) =>
    set({ selectionMode: { type: "commit", hash, repositoryPath, sessionId } }),
  clearSelectedFile: () => set({ selectionMode: null, diffContent: null }),
  setDiffContent: (diffContent) => set({ diffContent }),
  setIsDiffLoading: (isDiffLoading) => set({ isDiffLoading }),
  setOperationInProgress: (operationInProgress) => set({ operationInProgress }),
  setError: (error) => set({ error }),
  setCommitMessage: (commitMessage) => set({ commitMessage }),
  setDiffViewMode: (diffViewMode) => set({ diffViewMode }),
  setIgnoreWhitespace: (ignoreWhitespace) => set({ ignoreWhitespace }),
  setFileListViewMode: (fileListViewMode) => set({ fileListViewMode }),
  setSortByPath: (sortByPath) => set({ sortByPath }),

  setBranchList: (branchList) => set({ branchList }),
  setIsBranchLoading: (isBranchLoading) => set({ isBranchLoading }),
  setCurrentBranch: (currentBranch) => set({ currentBranch }),

  setStashEntries: (stashEntries) => set({ stashEntries }),
  setIsStashLoading: (isStashLoading) => set({ isStashLoading }),
  setStashError: (stashError) => set({ stashError }),

  setTags: (tags) => set({ tags }),

  addRecentMessage: (msg) =>
    set((state) => {
      const deduped = [msg, ...state.recentMessages.filter((m) => m !== msg)].slice(0, 10);
      // Fire-and-forget persist
      getStore()
        .then((store) => store.set(STORE_KEY, deduped))
        .catch(() => {});
      return { recentMessages: deduped };
    }),

  hydrateRecentMessages: async () => {
    try {
      const store = await getStore();
      const msgs = await store.get<string[]>(STORE_KEY);
      useSourceControlStore.setState({ recentMessages: msgs ?? [] });
    } catch {
      // silently keep []
    }
  },
}));
