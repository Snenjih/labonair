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
  initialCommand?: string;
  startupSnippet?: { command: string; mode: "execute" | "inject" } | null;
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
  languageOverride?: string;
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
  remotePath?: string;
  localPath?: string;
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
  languageOverride: string | null;
}>;

// ─── Tree helpers (used by tabsStore) ────────────────────────────────────────

export function makeLeaf(sessionId: string): PaneLeaf {
  return { type: "pane", id: sessionId };
}

export function newSessionId(): string {
  return crypto.randomUUID();
}

export function findParent(
  root: PaneNode,
  targetId: string,
): { parent: PaneSplit; siblingIndex: 0 | 1 } | null {
  if (root.type === "pane") return null;
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

export function replaceNode(root: PaneNode, targetId: string, replacement: PaneNode): PaneNode {
  if (root.id === targetId) return replacement;
  if (root.type === "pane") return root;
  return {
    ...root,
    children: [
      replaceNode(root.children[0], targetId, replacement),
      replaceNode(root.children[1], targetId, replacement),
    ] as [PaneNode, PaneNode],
  };
}

export function collectLeafIds(node: PaneNode, out: string[] = []): string[] {
  if (node.type === "pane") {
    out.push(node.id);
  } else {
    collectLeafIds(node.children[0], out);
    collectLeafIds(node.children[1], out);
  }
  return out;
}

export function basename(path: string): string {
  const parts = path.split("/").filter(Boolean);
  return parts.length ? parts[parts.length - 1] : path;
}

export function titleFromUrl(url: string): string {
  try {
    const u = new URL(url);
    return u.host || url;
  } catch {
    return url || "preview";
  }
}
