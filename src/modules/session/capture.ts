import { useTabsStore } from "@/modules/tabs/store/tabsStore";
import {
  SESSION_SNAPSHOT_VERSION,
  type AgentFleetTabSnapshot,
  type EditorTabSnapshot,
  type HomeTabSnapshot,
  type PreviewTabSnapshot,
  type SessionDataSnapshot,
  type SessionSnapshot,
  type SftpTabSnapshot,
  type TabSnapshot,
  type WorkspaceTabSnapshot,
} from "./types";
import { saveSnapshot } from "./store";

function toSessionDataSnapshot(s: {
  id: string;
  kind: "local" | "ssh";
  title: string;
  cwd?: string;
  hostId?: string;
  quickConnect?: { username: string; hostAddress: string; port: number };
  initialCommand?: string;
}): SessionDataSnapshot {
  return {
    id: s.id,
    kind: s.kind,
    title: s.title,
    cwd: s.cwd,
    hostId: s.hostId,
    quickConnect: s.quickConnect,
    initialCommand: s.initialCommand,
  };
}

export function captureSnapshot(): SessionSnapshot {
  const { tabs, activeId } = useTabsStore.getState();
  const snapshots: TabSnapshot[] = [];

  for (const tab of tabs) {
    if (tab.kind === "ai-diff") continue;
    if (tab.kind === "editor" && tab.isUntitled) continue;

    if (tab.kind === "workspace") {
      const snap: WorkspaceTabSnapshot = {
        kind: "workspace",
        title: tab.title,
        activePaneId: tab.activePaneId,
        layout: structuredClone(tab.layout),
        sessions: Object.fromEntries(
          Object.entries(tab.sessions).map(([k, v]) => [k, toSessionDataSnapshot(v)]),
        ),
      };
      snapshots.push(snap);
    } else if (tab.kind === "editor") {
      const snap: EditorTabSnapshot = {
        kind: "editor",
        title: tab.title,
        path: tab.path,
        isRemote: !!tab.remoteHostTabId,
        remotePath: tab.remotePath,
      };
      snapshots.push(snap);
    } else if (tab.kind === "preview") {
      const snap: PreviewTabSnapshot = {
        kind: "preview",
        title: tab.title,
        url: tab.url,
      };
      snapshots.push(snap);
    } else if (tab.kind === "home") {
      const snap: HomeTabSnapshot = { kind: "home" };
      snapshots.push(snap);
    } else if (tab.kind === "sftp") {
      const snap: SftpTabSnapshot = {
        kind: "sftp",
        title: tab.title,
        hostId: tab.hostId,
        remotePath: tab.remotePath,
        localPath: tab.localPath,
      };
      snapshots.push(snap);
    } else if (tab.kind === "agent-fleet") {
      const snap: AgentFleetTabSnapshot = {
        kind: "agent-fleet",
        title: tab.title,
        viewMode: tab.viewMode,
        focusedAgentId: tab.focusedAgentId,
        agents: structuredClone(tab.agents),
        panelSizes: tab.panelSizes ? structuredClone(tab.panelSizes) : undefined,
      };
      snapshots.push(snap);
    }
  }

  const activeIndex = tabs.findIndex((t) => t.id === activeId);

  return {
    version: SESSION_SNAPSHOT_VERSION,
    savedAt: Date.now(),
    activeTabIndex: Math.max(0, activeIndex),
    tabs: snapshots,
  };
}

export async function captureAndSave(): Promise<void> {
  try {
    const snapshot = captureSnapshot();
    await saveSnapshot(snapshot);
  } catch (e) {
    console.warn("[session] capture failed:", e);
  }
}
