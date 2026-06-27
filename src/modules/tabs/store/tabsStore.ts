import { create } from "zustand";
import { arrayMove } from "@dnd-kit/sortable";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { useHostsStore } from "@/modules/hosts/store/hostsStore";
import { useCommandSnippetsStore } from "@/modules/snippets/store/commandSnippetsStore";
import { useTransferStore } from "@/modules/sftp/store/transferStore";
import { invoke } from "@tauri-apps/api/core";
import {
  makeLeaf,
  newSessionId,
  findParent,
  replaceNode,
  collectLeafIds,
  basename,
  titleFromUrl,
  type AiDiffStatus,
  type CommitDiffTab,
  type GitDiffTab,
  type PaneDirection,
  type PaneNode,
  type PaneSplit,
  type Tab,
  type TabPatch,
  type TerminalSessionData,
  type WorkspaceTab,
} from "../types";

// Module-level guard — same pattern as usePreferencesStore
let _defaultTabOpened = false;

// ─── State shape ─────────────────────────────────────────────────────────────

export type TabsState = {
  tabs: Tab[];
  activeId: number;
  _nextId: number;

  // Actions
  setActiveId: (id: number) => void;
  newTab: (cwd?: string, initialCommand?: string, sessionId?: string) => number;
  newSshTab: (hostId: string, title: string, cwd?: string, initialCommand?: string, sessionId?: string) => number;
  newQuickSshTab: (username: string, hostAddress: string, port: number, sessionId?: string) => number;
  openDefaultTab: () => void;
  openHomeTab: () => void;
  openFileTab: (path: string) => number | null;
  openAiDiffTab: (input: {
    path: string;
    originalContent: string;
    proposedContent: string;
    approvalId: string;
    isNewFile: boolean;
  }) => number | null;
  setAiDiffStatus: (approvalId: string, status: AiDiffStatus) => void;
  newPreviewTab: (url: string, title?: string) => number;
  closeTab: (id: number) => void;
  updateTab: (id: number, patch: TabPatch) => void;
  selectByIndex: (idx: number) => void;
  newSftpTab: (hostId: string, title: string) => number;
  updateSftpPaths: (tabId: number, remotePath: string, localPath: string) => void;
  openUntitledTab: () => Promise<number>;
  openRemoteEditorTab: (sftpTabId: string, remotePath: string) => Promise<void>;
  openGitGraphTab: (repositoryPath: string, initialBranch: string) => number;
  openGitDiffTab: (repoRoot: string, filePath: string, staged: boolean, section: "staged" | "unstaged" | "untracked") => number;
  openCommitDiffTab: (repositoryPath: string, hash: string) => number;
  renameTab: (id: number, label: string) => void;
  reorderTabs: (activeTabId: number, overTabId: number) => void;
  setActivePaneId: (tabId: number, paneId: string) => void;
  updatePaneSessionCwd: (tabId: number, sessionId: string, cwd: string) => void;
  splitPane: (tabId: number, direction: PaneDirection) => void;
  closePane: (tabId: number, paneId: string) => void;
};

// ─── Selectors (exported for component use) ───────────────────────────────────

export const selectActiveTab = (s: TabsState): Tab | undefined =>
  s.tabs.find((t) => t.id === s.activeId);

export const selectActiveTabKind = (s: TabsState): Tab["kind"] | null =>
  s.tabs.find((t) => t.id === s.activeId)?.kind ?? null;

export const selectActivePaneId = (s: TabsState): string | null => {
  const tab = s.tabs.find((t) => t.id === s.activeId);
  return tab?.kind === "workspace" ? tab.activePaneId : null;
};

// ─── Store ────────────────────────────────────────────────────────────────────

export const useTabsStore = create<TabsState>((set, get) => ({
  tabs: [],
  activeId: -1,
  _nextId: 1,

  setActiveId: (id) => set({ activeId: id }),

  newTab: (cwd, initialCommand, sessionId) => {
    const tabId = get()._nextId;
    sessionId = sessionId ?? newSessionId();
    const tab: WorkspaceTab = {
      id: tabId,
      kind: "workspace",
      title: "shell",
      activePaneId: sessionId,
      layout: makeLeaf(sessionId),
      sessions: {
        [sessionId]: { id: sessionId, kind: "local", title: "shell", cwd, initialCommand },
      },
    };
    set((s) => ({ tabs: [...s.tabs, tab], activeId: tabId, _nextId: s._nextId + 1 }));
    return tabId;
  },

  newSshTab: (hostId, title, cwd, initialCommand, sessionId) => {
    const tabId = get()._nextId;
    sessionId = sessionId ?? newSessionId();

    const host = useHostsStore.getState().hosts.find((h) => h.id === hostId);
    let startupSnippet: { command: string; mode: "execute" | "inject" } | null = null;
    if (host?.startup_snippet_id) {
      const snippet = useCommandSnippetsStore
        .getState()
        .snippets.find((s) => s.id === host.startup_snippet_id);
      if (snippet) {
        startupSnippet = {
          command: snippet.command,
          mode: (host.startup_snippet_mode as "execute" | "inject") ?? "execute",
        };
      }
    }

    const tab: WorkspaceTab = {
      id: tabId,
      kind: "workspace",
      title,
      activePaneId: sessionId,
      layout: makeLeaf(sessionId),
      sessions: {
        [sessionId]: {
          id: sessionId,
          kind: "ssh",
          title,
          hostId,
          cwd,
          initialCommand,
          startupSnippet,
        },
      },
    };
    set((s) => ({ tabs: [...s.tabs, tab], activeId: tabId, _nextId: s._nextId + 1 }));
    return tabId;
  },

  newQuickSshTab: (username, hostAddress, port, sessionId) => {
    const tabId = get()._nextId;
    sessionId = sessionId ?? newSessionId();
    const title = `${username}@${hostAddress}`;
    const tab: WorkspaceTab = {
      id: tabId,
      kind: "workspace",
      title,
      activePaneId: sessionId,
      layout: makeLeaf(sessionId),
      sessions: {
        [sessionId]: {
          id: sessionId,
          kind: "ssh",
          title,
          quickConnect: { username, hostAddress, port },
        },
      },
    };
    set((s) => ({ tabs: [...s.tabs, tab], activeId: tabId, _nextId: s._nextId + 1 }));
    return tabId;
  },

  openDefaultTab: () => {
    if (_defaultTabOpened) return;
    _defaultTabOpened = true;
    const prefs = usePreferencesStore.getState();
    const defaultStartupTab = prefs.defaultStartupTab;
    const startupTerminalCount = Math.min(3, Math.max(1, prefs.startupTerminalCount ?? 1));
    const homeId = get()._nextId;
    const homeTab = { id: homeId, kind: "home" as const, title: "Home" };
    if (defaultStartupTab === "terminal") {
      const newTabs: (typeof homeTab | WorkspaceTab)[] = [homeTab];
      let nextId = homeId + 1;
      let lastTermId = homeId;
      for (let i = 0; i < startupTerminalCount; i++) {
        const sessionId = newSessionId();
        const termTab: WorkspaceTab = {
          id: nextId,
          kind: "workspace",
          title: "shell",
          activePaneId: sessionId,
          layout: makeLeaf(sessionId),
          sessions: { [sessionId]: { id: sessionId, kind: "local", title: "shell" } },
        };
        newTabs.push(termTab);
        lastTermId = nextId;
        nextId++;
      }
      set((s) => ({
        tabs: newTabs,
        activeId: lastTermId,
        _nextId: s._nextId + 1 + startupTerminalCount,
      }));
    } else {
      set((s) => ({
        tabs: [homeTab],
        activeId: homeId,
        _nextId: s._nextId + 1,
      }));
    }
  },

  openHomeTab: () => {
    const existing = get().tabs.find((t) => t.kind === "home");
    if (existing) {
      set({ activeId: existing.id });
      return;
    }
    const id = get()._nextId;
    set((s) => ({
      tabs: [{ id, kind: "home" as const, title: "Home" }, ...s.tabs],
      activeId: id,
      _nextId: s._nextId + 1,
    }));
  },

  openFileTab: (path) => {
    const existing = get().tabs.find((t) => t.kind === "editor" && t.path === path);
    if (existing) {
      set({ activeId: existing.id });
      return existing.id;
    }
    const id = get()._nextId;
    set((s) => ({
      tabs: [
        ...s.tabs,
        { id, kind: "editor" as const, title: basename(path), path, dirty: false },
      ],
      activeId: id,
      _nextId: s._nextId + 1,
    }));
    return id;
  },

  openAiDiffTab: (input) => {
    const existing = get().tabs.find(
      (t) => t.kind === "ai-diff" && t.approvalId === input.approvalId,
    );
    if (existing) {
      set({ activeId: existing.id });
      return existing.id;
    }
    const id = get()._nextId;
    const title = `${basename(input.path)} (AI diff)`;
    set((s) => ({
      tabs: [
        ...s.tabs,
        {
          id,
          kind: "ai-diff" as const,
          title,
          path: input.path,
          originalContent: input.originalContent,
          proposedContent: input.proposedContent,
          approvalId: input.approvalId,
          status: "pending" as const,
          isNewFile: input.isNewFile,
        },
      ],
      activeId: id,
      _nextId: s._nextId + 1,
    }));
    return id;
  },

  setAiDiffStatus: (approvalId, status) => {
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.kind === "ai-diff" && t.approvalId === approvalId ? { ...t, status } : t,
      ),
    }));
  },

  newPreviewTab: (url, title) => {
    const id = get()._nextId;
    set((s) => ({
      tabs: [...s.tabs, { id, kind: "preview" as const, title: title ?? titleFromUrl(url), url }],
      activeId: id,
      _nextId: s._nextId + 1,
    }));
    return id;
  },

  renameTab: (id, label) => {
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === id && t.kind === "workspace"
          ? { ...t, customTitle: label.trim() || undefined }
          : t,
      ),
    }));
  },

  closeTab: (id) => {
    const { tabs, activeId } = get();
    if (tabs.find((t) => t.id === id)?.kind === "home") return;
    if (tabs.length <= 1) return;
    const idx = tabs.findIndex((t) => t.id === id);
    const next = tabs.filter((t) => t.id !== id);
    const newActiveId = id === activeId ? next[Math.max(0, idx - 1)].id : activeId;
    set({ tabs: next, activeId: newActiveId });
  },

  updateTab: (id, patch) => {
    set((s) => ({
      tabs: s.tabs.map((x) => {
        if (x.id !== id) return x;
        if (x.kind === "workspace") {
          return {
            ...x,
            ...(patch.title !== undefined && { title: patch.title }),
          };
        }
        if (x.kind === "preview") {
          return {
            ...x,
            ...(patch.title !== undefined && { title: patch.title }),
            ...(patch.url !== undefined && {
              url: patch.url,
              title: patch.title ?? titleFromUrl(patch.url),
            }),
          };
        }
        return {
          ...x,
          ...(patch.title !== undefined && { title: patch.title }),
          ...(patch.dirty !== undefined && { dirty: patch.dirty }),
          ...(patch.path !== undefined && { path: patch.path, isUntitled: false }),
          ...(patch.languageOverride !== undefined && {
            languageOverride: patch.languageOverride ?? undefined,
          }),
        };
      }),
    }));
  },

  selectByIndex: (idx) => {
    const t = get().tabs[idx];
    if (t) set({ activeId: t.id });
  },

  newSftpTab: (hostId, title) => {
    const id = get()._nextId;
    set((s) => ({
      tabs: [...s.tabs, { id, kind: "sftp" as const, title, hostId }],
      activeId: id,
      _nextId: s._nextId + 1,
    }));
    return id;
  },

  updateSftpPaths: (tabId, remotePath, localPath) => {
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.kind === "sftp" && t.id === tabId ? { ...t, remotePath, localPath } : t,
      ),
    }));
  },

  openUntitledTab: async () => {
    const id = get()._nextId;
    set((s) => ({ _nextId: s._nextId + 1 }));
    const tempPath = await invoke<string>("fs_create_temp_file", {
      prefix: `untitled-${id}`,
    });
    set((s) => ({
      tabs: [
        ...s.tabs,
        {
          id,
          kind: "editor" as const,
          title: "Untitled",
          path: tempPath,
          dirty: false,
          isUntitled: true,
        },
      ],
      activeId: id,
    }));
    return id;
  },

  openRemoteEditorTab: async (sftpTabId, remotePath) => {
    const showTransfers = usePreferencesStore.getState().sftpRemoteEditShowTransfers;
    const jobId = crypto.randomUUID();

    if (showTransfers) {
      useTransferStore.getState().addJob({
        id: jobId,
        session_id: sftpTabId,
        src_path: remotePath,
        dest_path: "(editor)",
        direction: "download",
        status: "running",
        bytes_total: 0,
        bytes_transferred: 0,
        speed_bps: 0,
      });
    }

    let localTempPath: string;
    try {
      localTempPath = await invoke<string>("prepare_remote_edit", {
        sessionId: sftpTabId,
        remotePath,
      });
    } catch (e) {
      if (showTransfers) {
        useTransferStore.getState().updateJob({
          id: jobId,
          session_id: sftpTabId,
          src_path: remotePath,
          dest_path: "(editor)",
          direction: "download",
          status: { failed: String(e) },
          bytes_total: 0,
          bytes_transferred: 0,
          speed_bps: 0,
        });
      }
      throw e;
    }

    if (showTransfers) {
      useTransferStore.getState().updateJob({
        id: jobId,
        session_id: sftpTabId,
        src_path: remotePath,
        dest_path: "(editor)",
        direction: "download",
        status: "completed",
        bytes_total: 1,
        bytes_transferred: 1,
        speed_bps: 0,
      });
    }

    const fileName = remotePath.split("/").pop() ?? "remote-file";
    const id = get()._nextId;
    set((s) => ({
      tabs: [
        ...s.tabs,
        {
          id,
          kind: "editor" as const,
          title: `✦ ${fileName}`,
          path: localTempPath,
          dirty: false,
          remoteHostTabId: sftpTabId,
          remotePath,
        },
      ],
      activeId: id,
      _nextId: s._nextId + 1,
    }));
  },

  openGitGraphTab: (repositoryPath, initialBranch) => {
    const existing = get().tabs.find(
      (t) =>
        t.kind === "git-graph" &&
        t.repositoryPath === repositoryPath &&
        t.initialBranch === initialBranch,
    );
    if (existing) {
      set({ activeId: existing.id });
      return existing.id;
    }
    const id = get()._nextId;
    set((s) => ({
      tabs: [
        ...s.tabs,
        {
          id,
          kind: "git-graph" as const,
          title: `Git Graph · ${initialBranch}`,
          repositoryPath,
          initialBranch,
        },
      ],
      activeId: id,
      _nextId: s._nextId + 1,
    }));
    return id;
  },

  openGitDiffTab: (repoRoot, filePath, staged, section) => {
    const existing = get().tabs.find(
      (t) =>
        t.kind === "git-diff" &&
        t.repoRoot === repoRoot &&
        t.filePath === filePath &&
        t.staged === staged,
    );
    if (existing) {
      set({ activeId: existing.id });
      return existing.id;
    }
    const id = get()._nextId;
    const fileName = filePath.split("/").pop() ?? filePath;
    const tab: GitDiffTab = {
      id,
      kind: "git-diff",
      title: fileName,
      repoRoot,
      filePath,
      staged,
      section,
    };
    set((s) => ({
      tabs: [...s.tabs, tab],
      activeId: id,
      _nextId: s._nextId + 1,
    }));
    return id;
  },

  openCommitDiffTab: (repositoryPath, hash) => {
    const shortHash = hash.slice(0, 7);
    const existing = get().tabs.find(
      (t) => t.kind === "commit-diff" && t.repositoryPath === repositoryPath && t.hash === hash,
    );
    if (existing) {
      set({ activeId: existing.id });
      return existing.id;
    }
    const id = get()._nextId;
    const tab: CommitDiffTab = {
      id,
      kind: "commit-diff",
      title: shortHash,
      repositoryPath,
      hash,
    };
    set((s) => ({
      tabs: [...s.tabs, tab],
      activeId: id,
      _nextId: s._nextId + 1,
    }));
    return id;
  },

  reorderTabs: (activeTabId, overTabId) => {
    set((s) => {
      const from = s.tabs.findIndex((t) => t.id === activeTabId);
      const to = s.tabs.findIndex((t) => t.id === overTabId);
      if (from === -1 || to === -1 || from === to) return s;
      return { tabs: arrayMove(s.tabs, from, to) };
    });
  },

  setActivePaneId: (tabId, paneId) => {
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.kind === "workspace" && t.id === tabId ? { ...t, activePaneId: paneId } : t,
      ),
    }));
  },

  updatePaneSessionCwd: (tabId, sessionId, cwd) => {
    set((s) => ({
      tabs: s.tabs.map((t) => {
        if (t.kind !== "workspace" || t.id !== tabId) return t;
        const session = t.sessions[sessionId];
        if (!session) return t;
        return {
          ...t,
          sessions: {
            ...t.sessions,
            [sessionId]: { ...session, cwd },
          },
        };
      }),
    }));
  },

  splitPane: (tabId, direction) => {
    set((s) => ({
      tabs: s.tabs.map((t) => {
        if (t.kind !== "workspace" || t.id !== tabId) return t;
        const activeSessionId = t.activePaneId;
        const activeSession = t.sessions[activeSessionId];
        if (!activeSession) return t;

        const newSessId = newSessionId();
        const newSession: TerminalSessionData = {
          ...activeSession,
          id: newSessId,
          cwd: activeSession.cwd,
        };

        const splitNode: PaneSplit = {
          type: "split",
          id: newSessionId(),
          direction,
          sizes: [50, 50],
          children: [makeLeaf(activeSessionId), makeLeaf(newSessId)],
        };

        const newLayout = replaceNode(t.layout, activeSessionId, splitNode);

        return {
          ...t,
          layout: newLayout,
          activePaneId: newSessId,
          sessions: { ...t.sessions, [newSessId]: newSession },
        };
      }),
    }));
  },

  closePane: (tabId, paneId) => {
    const { tabs, activeId } = get();
    const tabIdx = tabs.findIndex((t) => t.id === tabId);
    if (tabIdx === -1) return;
    const t = tabs[tabIdx];
    if (t.kind !== "workspace") return;

    // Only pane → close the entire tab
    if (t.layout.type === "pane") {
      if (tabs.length <= 1) return;
      const next = tabs.filter((x) => x.id !== tabId);
      const newActiveId =
        activeId === tabId ? next[Math.max(0, tabIdx - 1)].id : activeId;
      set({ tabs: next, activeId: newActiveId });
      return;
    }

    // Multi-pane: promote sibling
    const result = findParent(t.layout, paneId);
    if (!result) return;

    const { parent: parentSplit, siblingIndex } = result;
    const sibling = parentSplit.children[siblingIndex];

    let newLayout: PaneNode;
    if (t.layout.id === parentSplit.id) {
      newLayout = sibling;
    } else {
      newLayout = replaceNode(t.layout, parentSplit.id, sibling);
    }

    const siblingLeaves = collectLeafIds(sibling);
    const newActivePaneId = siblingLeaves[0] ?? t.activePaneId;

    const newSessions = { ...t.sessions };
    delete newSessions[paneId];

    const updatedTab: WorkspaceTab = {
      ...t,
      layout: newLayout,
      activePaneId: newActivePaneId,
      sessions: newSessions,
    };
    const next = [...tabs];
    next[tabIdx] = updatedTab;
    set({ tabs: next });
  },
}));
