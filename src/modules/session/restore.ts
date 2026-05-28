import { invoke } from "@tauri-apps/api/core";
import { useHostsStore } from "@/modules/hosts/store/hostsStore";
import { useTabsStore } from "@/modules/tabs/store/tabsStore";
import type { PaneLeaf, PaneNode, PaneSplit } from "@/modules/tabs";
import { loadSnapshot } from "./store";
import type {
  RestoreResult,
  SessionSnapshot,
  SftpTabSnapshot,
  TabSnapshot,
  WorkspaceTabSnapshot,
} from "./types";

export interface TabActions {
  setActiveId: (id: number) => void;
  newTab: (cwd?: string) => number;
  newSshTab: (hostId: string, title: string, cwd?: string) => number;
  newQuickSshTab: (username: string, hostAddress: string, port: number) => number;
  openFileTab: (path: string) => number | null;
  newPreviewTab: (url: string) => number;
  openHomeTab: () => void;
  newSftpTab: (hostId: string, title: string) => number;
  splitPane: (tabId: number, direction: "horizontal" | "vertical") => void;
  setActivePaneId: (tabId: number, paneId: string) => void;
}

function collectLeaves(node: PaneNode): PaneLeaf[] {
  if (node.type === "pane") return [node];
  return [...collectLeaves(node.children[0]), ...collectLeaves(node.children[1])];
}

async function restoreWorkspaceTab(
  snap: WorkspaceTabSnapshot,
  actions: TabActions,
  failedTabs: RestoreResult["failedTabs"],
): Promise<number | null> {
  const leaves = collectLeaves(snap.layout);
  if (leaves.length === 0) return null;

  // Validate hosts for SSH panes
  const hosts = useHostsStore.getState().hosts;
  const validatedSessions: typeof snap.sessions = {};
  for (const [paneId, session] of Object.entries(snap.sessions)) {
    if (session.kind === "ssh" && session.hostId) {
      const hostExists = hosts.some((h) => h.id === session.hostId);
      if (!hostExists) {
        failedTabs.push({
          title: session.title,
          reason: `Host no longer exists (was: ${session.title})`,
        });
        validatedSessions[paneId] = { ...session, kind: "local" };
        continue;
      }
    }
    validatedSessions[paneId] = session;
  }

  // Open the root tab using the first leaf's session
  const rootLeafId = leaves[0].id;
  const rootSession = validatedSessions[rootLeafId];
  let tabId: number;

  if (!rootSession) return null;

  if (rootSession.kind === "ssh") {
    if (rootSession.quickConnect) {
      tabId = actions.newQuickSshTab(
        rootSession.quickConnect.username,
        rootSession.quickConnect.hostAddress,
        rootSession.quickConnect.port,
      );
    } else if (rootSession.hostId) {
      tabId = actions.newSshTab(rootSession.hostId, rootSession.title, rootSession.cwd);
    } else {
      tabId = actions.newTab(rootSession.cwd);
    }
  } else {
    tabId = actions.newTab(rootSession.cwd);
  }

  // Reconstruct the split pane tree if there are multiple panes
  if (leaves.length > 1) {
    await reconstructPaneTree(snap.layout, snap.layout, tabId, actions, validatedSessions, rootLeafId);
  }

  return tabId;
}

async function reconstructPaneTree(
  root: PaneNode,
  node: PaneNode,
  tabId: number,
  actions: TabActions,
  sessions: WorkspaceTabSnapshot["sessions"],
  _currentActiveId: string,
): Promise<void> {
  if (node.type === "pane") return;

  const split = node as PaneSplit;
  // Split the current active pane in the given direction
  actions.splitPane(tabId, split.direction);
  // Allow React state to settle before recursing
  await new Promise<void>((resolve) => setTimeout(resolve, 0));

  await reconstructPaneTree(root, split.children[0], tabId, actions, sessions, _currentActiveId);
  await reconstructPaneTree(root, split.children[1], tabId, actions, sessions, _currentActiveId);
}

async function restoreSftpTab(
  snap: SftpTabSnapshot,
  actions: TabActions,
  failedTabs: RestoreResult["failedTabs"],
): Promise<number | null> {
  const hosts = useHostsStore.getState().hosts;
  const hostExists = hosts.some((h) => h.id === snap.hostId);
  if (!hostExists) {
    failedTabs.push({ title: snap.title, reason: "Host no longer exists" });
    return null;
  }
  const tabId = actions.newSftpTab(snap.hostId, snap.title);
  return tabId;
}

async function restoreTab(
  snap: TabSnapshot,
  actions: TabActions,
  failedTabs: RestoreResult["failedTabs"],
): Promise<number | null> {
  switch (snap.kind) {
    case "home": {
      actions.openHomeTab();
      const homeTab = useTabsStore.getState().tabs.find((t) => t.kind === "home");
      return homeTab?.id ?? null;
    }

    case "preview": {
      if (!snap.url) return null;
      return actions.newPreviewTab(snap.url);
    }

    case "editor": {
      if (snap.isRemote) {
        // Remote editor tabs depend on SFTP — skip, show toast
        failedTabs.push({
          title: snap.title,
          reason: "Remote editor tabs cannot be restored automatically",
        });
        return null;
      }
      try {
        const exists = await invoke<boolean>("fs_file_exists", { path: snap.path });
        if (!exists) {
          failedTabs.push({ title: snap.title, reason: `File not found: ${snap.path}` });
          return null;
        }
        return actions.openFileTab(snap.path);
      } catch {
        failedTabs.push({ title: snap.title, reason: `Could not check file: ${snap.path}` });
        return null;
      }
    }

    case "workspace": {
      return restoreWorkspaceTab(snap, actions, failedTabs);
    }

    case "sftp": {
      return restoreSftpTab(snap, actions, failedTabs);
    }
  }
}

export async function restoreSnapshot(
  snapshot: SessionSnapshot,
  actions: TabActions,
): Promise<RestoreResult> {
  const failedTabs: RestoreResult["failedTabs"] = [];
  let restoredCount = 0;
  const newTabIds: (number | null)[] = [];

  for (const snap of snapshot.tabs) {
    const tabId = await restoreTab(snap, actions, failedTabs);
    newTabIds.push(tabId);
    if (tabId !== null) restoredCount++;
  }

  // Restore the active tab
  const targetNewId = newTabIds[snapshot.activeTabIndex];
  if (targetNewId !== null && targetNewId !== undefined) {
    actions.setActiveId(targetNewId);
  }

  return { restoredCount, failedTabs };
}

export async function restoreIfEnabled(actions: TabActions): Promise<RestoreResult | null> {
  try {
    const snapshot = await loadSnapshot();
    if (!snapshot || snapshot.tabs.length === 0) return null;
    return await restoreSnapshot(snapshot, actions);
  } catch (e) {
    console.warn("[session] restore failed:", e);
    return null;
  }
}
