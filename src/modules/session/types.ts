import type { PaneNode } from "@/modules/tabs";

export const SESSION_SNAPSHOT_VERSION = 1;

export interface SessionSnapshot {
  version: number;
  savedAt: number;
  activeTabIndex: number;
  tabs: TabSnapshot[];
}

export type TabSnapshot =
  | WorkspaceTabSnapshot
  | EditorTabSnapshot
  | PreviewTabSnapshot
  | HomeTabSnapshot
  | SftpTabSnapshot;

export interface WorkspaceTabSnapshot {
  kind: "workspace";
  title: string;
  activePaneId: string;
  layout: PaneNode;
  sessions: Record<string, SessionDataSnapshot>;
}

export interface SessionDataSnapshot {
  id: string;
  kind: "local" | "ssh";
  title: string;
  cwd?: string;
  hostId?: string;
  quickConnect?: { username: string; hostAddress: string; port: number };
  initialCommand?: string;
}

export interface EditorTabSnapshot {
  kind: "editor";
  title: string;
  path: string;
  isRemote: boolean;
  remotePath?: string;
  remoteHostTabIndex?: number;
}

export interface PreviewTabSnapshot {
  kind: "preview";
  title: string;
  url: string;
}

export interface HomeTabSnapshot {
  kind: "home";
}

export interface SftpTabSnapshot {
  kind: "sftp";
  title: string;
  hostId: string;
  remotePath?: string;
  localPath?: string;
}

export interface RestoreResult {
  restoredCount: number;
  failedTabs: Array<{ title: string; reason: string }>;
}
