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
  customTitle?: string;
  activePaneId: string;
  layout: PaneNode;
  sessions: Record<string, TerminalSessionData>;
  /** True for a tab restored from a session snapshot that hasn't been
   *  activated yet — no PTY/SSH connection has been spawned for any of its
   *  sessions. `WorkspaceStack` doesn't mount a cold tab at all, so its panes
   *  never call `useTerminalSession`/`SshTerminalPane`'s connect logic.
   *  Cleared exactly once, by `setActiveId`, the moment the tab is first
   *  activated. Never set for interactively-created tabs (only restore.ts
   *  passes `cold: true`), so it's always `false`/absent outside restore. */
  cold?: boolean;
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
  /** Host + session-lifecycle-ownership snapshotted at open time — lets the
   *  sidebar explorer stay pinned to this file's remote host/folder while
   *  the tab is active, instead of falling back to the local tree (see
   *  `deriveExplorerTarget`). Mirrors the pinning `GitGraphTab`/`GitDiffTab`
   *  already do for `hostId`/`sessionId`. */
  remoteHostId?: string;
  remoteSource?: "sftp-tab" | "lazy-session";
  languageOverride?: string;
};

export type PreviewTab = {
  id: number;
  kind: "preview";
  title: string;
  url: string;
  /** Set when previewing a remote file staged via `prepare_remote_edit` —
   *  mirrors `EditorTab`'s `remoteHostTabId`/`remotePath`, used only to
   *  clean up the local temp file on tab close (previews are read-only, no
   *  save-back). */
  remoteHostTabId?: string;
  remotePath?: string;
  remoteTempPath?: string;
  /** Same pinning purpose as `EditorTab.remoteHostId`/`remoteSource`. */
  remoteHostId?: string;
  remoteSource?: "sftp-tab" | "lazy-session";
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
  /** Target path a bookmark's "open in new SFTP tab" action wants to land
   *  on — consulted only by the connect effect's initial directory load, not
   *  re-applied afterward (see `SftpPane.tsx`). */
  initialRemotePath?: string;
};

export type QuickConnectParams = {
  username: string;
  hostAddress: string;
  port: number;
};

export type GitGraphTab = {
  id: number;
  kind: "git-graph";
  title: string;
  repositoryPath: string; // locked at open time — never changes
  initialBranch: string;
  // Snapshotted at open time alongside repositoryPath, same "frozen" rule —
  // a Git Graph tab must stay pinned to the repo/host it was opened
  // against, independent of whatever the sidebar switches to afterward.
  hostId?: string;
  sessionId?: string;
};

export type GitDiffTab = {
  id: number;
  kind: "git-diff";
  title: string;
  repoRoot: string;
  filePath: string;
  staged: boolean;
  section: "staged" | "unstaged" | "untracked";
  hostId?: string;
  sessionId?: string;
};

export type CommitDiffTab = {
  id: number;
  kind: "commit-diff";
  title: string;
  repositoryPath: string;
  hash: string;
  hostId?: string;
  sessionId?: string;
};

export type Tab =
  | WorkspaceTab
  | EditorTab
  | PreviewTab
  | AiDiffTab
  | HomeTab
  | SftpTab
  | GitGraphTab
  | GitDiffTab
  | CommitDiffTab;

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
