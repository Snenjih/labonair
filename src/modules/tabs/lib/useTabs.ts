import { invoke } from "@tauri-apps/api/core";
import { useCallback, useRef, useState } from "react";

// ─── Pane tree ────────────────────────────────────────────────────────────────

export type PaneDirection = "horizontal" | "vertical";

export type PaneSplit = {
  type: "split";
  id: string;
  direction: PaneDirection;
  sizes: number[];
  children: [PaneNode, PaneNode];
};

export type PaneLeaf = {
  type: "pane";
  id: string; // acts as session_id
};

export type PaneNode = PaneSplit | PaneLeaf;

export type TerminalSessionData = {
  id: string;
  kind: "local" | "ssh";
  title: string;
  cwd?: string;
  hostId?: string;
  quickConnect?: QuickConnectParams;
};

// ─── Tab types ────────────────────────────────────────────────────────────────

export type WorkspaceTab = {
  id: number;
  kind: "workspace";
  title: string;
  activePaneId: string;
  layout: PaneNode;
  sessions: Record<string, TerminalSessionData>;
};

export type EditorTab = {
  id: number;
  kind: "editor";
  title: string;
  path: string;
  dirty: boolean;
  isUntitled?: boolean;
  remoteHostTabId?: string;
  remotePath?: string;
};

export type PreviewTab = {
  id: number;
  kind: "preview";
  title: string;
  url: string;
};

export type AiDiffStatus = "pending" | "approved" | "rejected";

export type AiDiffTab = {
  id: number;
  kind: "ai-diff";
  title: string;
  path: string;
  originalContent: string;
  proposedContent: string;
  approvalId: string;
  status: AiDiffStatus;
  isNewFile: boolean;
};

export type HomeTab = {
  id: number;
  kind: "home";
  title: string;
};

export type SftpTab = {
  id: number;
  kind: "sftp";
  title: string;
  hostId: string;
};

export type QuickConnectParams = {
  username: string;
  hostAddress: string;
  port: number;
};

export type Tab = WorkspaceTab | EditorTab | PreviewTab | AiDiffTab | HomeTab | SftpTab;

export type TabPatch = Partial<{
  title: string;
  cwd: string;
  path: string;
  dirty: boolean;
  url: string;
}>;

// ─── Tree helpers ─────────────────────────────────────────────────────────────

function makeLeaf(sessionId: string): PaneLeaf {
  return { type: "pane", id: sessionId };
}

function newSessionId(): string {
  return crypto.randomUUID();
}

/** Find the parent split and sibling of a leaf node. Returns null if root or not found. */
function findParent(
  root: PaneNode,
  targetId: string,
): { parent: PaneSplit; siblingIndex: 0 | 1 } | null {
  if (root.type === "pane") {
    return null;
  }
  for (let i = 0; i < 2; i++) {
    const child = root.children[i];
    if (child.type === "pane" && child.id === targetId) {
      return { parent: root, siblingIndex: (1 - i) as 0 | 1 };
    }
    const found = findParent(child, targetId);
    if (found) return found;
  }
  return null;
}

/** Replace a node at targetId with a replacement node. */
function replaceNode(root: PaneNode, targetId: string, replacement: PaneNode): PaneNode {
  if (root.type === "pane") {
    return root.id === targetId ? replacement : root;
  }
  return {
    ...root,
    children: [
      replaceNode(root.children[0], targetId, replacement),
      replaceNode(root.children[1], targetId, replacement),
    ] as [PaneNode, PaneNode],
  };
}

/** Collect all leaf IDs from the tree. */
function collectLeafIds(node: PaneNode, out: string[] = []): string[] {
  if (node.type === "pane") {
    out.push(node.id);
  } else {
    collectLeafIds(node.children[0], out);
    collectLeafIds(node.children[1], out);
  }
  return out;
}

// ─── String helpers ───────────────────────────────────────────────────────────

function basename(path: string): string {
  const parts = path.split("/").filter(Boolean);
  return parts.length ? parts[parts.length - 1] : path;
}

function titleFromUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.host || url;
  } catch {
    return url || "preview";
  }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useTabs() {
  const [tabs, setTabs] = useState<Tab[]>([
    { id: 1, kind: "home", title: "Home" },
  ]);
  const [activeId, setActiveId] = useState(1);
  const nextIdRef = useRef(2);

  // ── Workspace / terminal tabs ────────────────────────────────────────────────

  const newTab = useCallback((cwd?: string) => {
    const tabId = nextIdRef.current++;
    const sessionId = newSessionId();
    const tab: WorkspaceTab = {
      id: tabId,
      kind: "workspace",
      title: "shell",
      activePaneId: sessionId,
      layout: makeLeaf(sessionId),
      sessions: {
        [sessionId]: { id: sessionId, kind: "local", title: "shell", cwd },
      },
    };
    setTabs((t) => [...t, tab]);
    setActiveId(tabId);
    return tabId;
  }, []);

  const newSshTab = useCallback((hostId: string, title: string, cwd?: string) => {
    const tabId = nextIdRef.current++;
    const sessionId = newSessionId();
    const tab: WorkspaceTab = {
      id: tabId,
      kind: "workspace",
      title,
      activePaneId: sessionId,
      layout: makeLeaf(sessionId),
      sessions: {
        [sessionId]: { id: sessionId, kind: "ssh", title, hostId, cwd },
      },
    };
    setTabs((t) => [...t, tab]);
    setActiveId(tabId);
    return tabId;
  }, []);

  const newQuickSshTab = useCallback((username: string, hostAddress: string, port: number) => {
    const tabId = nextIdRef.current++;
    const sessionId = newSessionId();
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
    setTabs((t) => [...t, tab]);
    setActiveId(tabId);
    return tabId;
  }, []);

  // ── Pane tree mutations ──────────────────────────────────────────────────────

  const setActivePaneId = useCallback((tabId: number, paneId: string) => {
    setTabs((curr) =>
      curr.map((t) =>
        t.kind === "workspace" && t.id === tabId
          ? { ...t, activePaneId: paneId }
          : t,
      ),
    );
  }, []);

  const updatePaneSessionCwd = useCallback((tabId: number, sessionId: string, cwd: string) => {
    setTabs((curr) =>
      curr.map((t) => {
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
    );
  }, []);

  const splitPane = useCallback((tabId: number, direction: PaneDirection) => {
    setTabs((curr) =>
      curr.map((t) => {
        if (t.kind !== "workspace" || t.id !== tabId) return t;
        const activeId = t.activePaneId;
        const activeSession = t.sessions[activeId];
        if (!activeSession) return t;

        const newSessionId_ = newSessionId();
        const newSession: TerminalSessionData = {
          ...activeSession,
          id: newSessionId_,
          cwd: activeSession.cwd,
        };

        const splitNode: PaneSplit = {
          type: "split",
          id: newSessionId(),
          direction,
          sizes: [50, 50],
          children: [makeLeaf(activeId), makeLeaf(newSessionId_)],
        };

        const newLayout = replaceNode(t.layout, activeId, splitNode);

        return {
          ...t,
          layout: newLayout,
          activePaneId: newSessionId_,
          sessions: { ...t.sessions, [newSessionId_]: newSession },
        };
      }),
    );
  }, []);

  const closePane = useCallback((tabId: number, paneId: string) => {
    setTabs((curr) => {
      const tabIdx = curr.findIndex((t) => t.id === tabId);
      if (tabIdx === -1) return curr;
      const t = curr[tabIdx];
      if (t.kind !== "workspace") return curr;

      // If this is the only pane, close the entire tab
      if (t.layout.type === "pane") {
        if (curr.length <= 1) return curr;
        const next = curr.filter((x) => x.id !== tabId);
        setActiveId((active) =>
          active === tabId ? next[Math.max(0, tabIdx - 1)].id : active,
        );
        return next;
      }

      // Find parent split and promote sibling
      const result = findParent(t.layout, paneId);
      if (!result) return curr;

      const { parent: parentSplit, siblingIndex } = result;
      const sibling = parentSplit.children[siblingIndex];

      // Build new layout: replace parent split with sibling
      let newLayout: PaneNode;
      if (t.layout.id === parentSplit.id) {
        newLayout = sibling;
      } else {
        newLayout = replaceNode(t.layout, parentSplit.id, sibling);
      }

      // Determine new active pane: pick first leaf of sibling subtree
      const siblingLeaves = collectLeafIds(sibling);
      const newActiveId = siblingLeaves[0] ?? t.activePaneId;

      // Remove closed session from sessions dict
      const newSessions = { ...t.sessions };
      delete newSessions[paneId];

      const updated: WorkspaceTab = {
        ...t,
        layout: newLayout,
        activePaneId: newActiveId,
        sessions: newSessions,
      };
      const next = [...curr];
      next[tabIdx] = updated;
      return next;
    });
  }, []);

  // ── Other tab types ──────────────────────────────────────────────────────────

  const openHomeTab = useCallback(() => {
    let targetId: number | null = null;
    setTabs((curr) => {
      const existing = curr.find((t) => t.kind === "home");
      if (existing) {
        targetId = existing.id;
        return curr;
      }
      const id = nextIdRef.current++;
      targetId = id;
      return [...curr, { id, kind: "home", title: "Home" }];
    });
    if (targetId !== null) setActiveId(targetId);
  }, []);

  const openFileTab = useCallback((path: string) => {
    let targetId: number | null = null;
    setTabs((curr) => {
      const existing = curr.find(
        (t) => t.kind === "editor" && t.path === path,
      );
      if (existing) {
        targetId = existing.id;
        return curr;
      }
      const id = nextIdRef.current++;
      targetId = id;
      return [
        ...curr,
        {
          id,
          kind: "editor",
          title: basename(path),
          path,
          dirty: false,
        },
      ];
    });
    if (targetId !== null) setActiveId(targetId);
    return targetId as number | null;
  }, []);

  const openAiDiffTab = useCallback(
    (input: {
      path: string;
      originalContent: string;
      proposedContent: string;
      approvalId: string;
      isNewFile: boolean;
    }) => {
      let targetId: number | null = null;
      setTabs((curr) => {
        const existing = curr.find(
          (t) => t.kind === "ai-diff" && t.approvalId === input.approvalId,
        );
        if (existing) {
          targetId = existing.id;
          return curr;
        }
        const id = nextIdRef.current++;
        targetId = id;
        const title = `${basename(input.path)} (AI diff)`;
        return [
          ...curr,
          {
            id,
            kind: "ai-diff",
            title,
            path: input.path,
            originalContent: input.originalContent,
            proposedContent: input.proposedContent,
            approvalId: input.approvalId,
            status: "pending",
            isNewFile: input.isNewFile,
          },
        ];
      });
      if (targetId !== null) setActiveId(targetId);
      return targetId as number | null;
    },
    [],
  );

  const setAiDiffStatus = useCallback(
    (approvalId: string, status: AiDiffStatus) => {
      setTabs((curr) =>
        curr.map((t) =>
          t.kind === "ai-diff" && t.approvalId === approvalId
            ? { ...t, status }
            : t,
        ),
      );
    },
    [],
  );

  const newPreviewTab = useCallback((url: string) => {
    const id = nextIdRef.current++;
    setTabs((t) => [
      ...t,
      { id, kind: "preview", title: titleFromUrl(url), url },
    ]);
    setActiveId(id);
    return id;
  }, []);

  const closeTab = useCallback((id: number) => {
    setTabs((curr) => {
      if (curr.length <= 1) return curr;
      const idx = curr.findIndex((t) => t.id === id);
      const next = curr.filter((t) => t.id !== id);
      setActiveId((active) =>
        id === active ? next[Math.max(0, idx - 1)].id : active,
      );
      return next;
    });
  }, []);

  const updateTab = useCallback((id: number, patch: TabPatch) => {
    setTabs((t) =>
      t.map((x) => {
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
        };
      }),
    );
  }, []);

  const selectByIndex = useCallback(
    (idx: number) => {
      const t = tabs[idx];
      if (t) setActiveId(t.id);
    },
    [tabs],
  );

  const newSftpTab = useCallback((hostId: string, title: string) => {
    const id = nextIdRef.current++;
    setTabs((t) => [...t, { id, kind: "sftp", title, hostId }]);
    setActiveId(id);
    return id;
  }, []);

  const openUntitledTab = useCallback(async () => {
    const id = nextIdRef.current++;
    const tempPath = await invoke<string>("fs_create_temp_file", { prefix: `untitled-${id}` });
    setTabs((t) => [
      ...t,
      {
        id,
        kind: "editor" as const,
        title: "Untitled",
        path: tempPath,
        dirty: false,
        isUntitled: true,
      },
    ]);
    setActiveId(id);
    return id;
  }, []);

  const openRemoteEditorTab = useCallback(
    async (sftpTabId: string, remotePath: string) => {
      const localTempPath = await invoke<string>("prepare_remote_edit", {
        sessionId: sftpTabId,
        remote_path: remotePath,
      });
      const fileName = remotePath.split("/").pop() ?? "remote-file";
      const id = nextIdRef.current++;
      setTabs((t) => [
        ...t,
        {
          id,
          kind: "editor",
          title: `✦ ${fileName}`,
          path: localTempPath,
          dirty: false,
          remoteHostTabId: sftpTabId,
          remotePath,
        },
      ]);
      setActiveId(id);
    },
    [],
  );

  return {
    tabs,
    activeId,
    setActiveId,
    newTab,
    openHomeTab,
    openFileTab,
    newPreviewTab,
    openAiDiffTab,
    setAiDiffStatus,
    closeTab,
    updateTab,
    selectByIndex,
    newSshTab,
    newQuickSshTab,
    newSftpTab,
    openRemoteEditorTab,
    openUntitledTab,
    // Workspace/pane actions
    setActivePaneId,
    updatePaneSessionCwd,
    splitPane,
    closePane,
  };
}
