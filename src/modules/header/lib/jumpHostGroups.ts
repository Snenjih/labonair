import { getLazySessionHostId } from "@/modules/explorer/lib/useLazyExplorerSession";
import type { LazySessionStatus } from "@/modules/explorer/lib/useLazyExplorerSession";
import type { ConnectionEntry, Host } from "@/modules/hosts";
import type { Tab } from "@/modules/tabs";

export interface HostGroup {
  hostId: string;
  hostLabel: string;
  jumpHostName: string;
  terminalConnections: ConnectionEntry[];
  sftpConnection: ConnectionEntry | null;
  explorerStatus: LazySessionStatus | null;
  /** A Git tab (git-graph/git-diff/commit-diff) riding the same lazy
   *  Explorer session, if one is open — lets the Explorer pill focus a real
   *  tab on click instead of being a dead end. */
  explorerTabId: number | null;
  hasError: boolean;
}

/**
 * Groups every live terminal/SFTP connection (from `useConnectionStatusStore`)
 * and every live Explorer/Git lazy session (from `useLazySessionStore`) by
 * host, keeping only hosts that are actually routed through a jump host.
 * Pure and unit-testable — no store reads happen inside, callers pass in
 * already-selected state (see `JumpHostDropdown.tsx`'s `useJumpHostGroups`).
 */
export function buildHostGroups(
  connections: Record<string, ConnectionEntry>,
  lazySessions: Record<string, { status: LazySessionStatus; error: string | null }>,
  hosts: Host[],
  tabs: Tab[],
): HostGroup[] {
  const groups = new Map<string, HostGroup>();

  function getOrCreate(hostId: string, hostLabel: string, jumpHostName: string): HostGroup {
    const existing = groups.get(hostId);
    if (existing) return existing;
    const created: HostGroup = {
      hostId,
      hostLabel,
      jumpHostName,
      terminalConnections: [],
      sftpConnection: null,
      explorerStatus: null,
      explorerTabId: null,
      hasError: false,
    };
    groups.set(hostId, created);
    return created;
  }

  // Terminal + SFTP — jumpHostName is a snapshot taken at connect time (see
  // ConnectionEntry doc comment), so a since-changed/removed jump_host_id on
  // the host record doesn't retroactively hide or alter an already-open
  // connection's row.
  for (const entry of Object.values(connections)) {
    if (!entry.jumpHostName) continue;
    const group = getOrCreate(entry.hostId, entry.hostLabel, entry.jumpHostName);
    if (entry.kind === "terminal") group.terminalConnections.push(entry);
    else group.sftpConnection = entry;
    if (entry.status === "error") group.hasError = true;
  }
  for (const group of groups.values()) {
    group.terminalConnections.sort((a, b) => b.connectedAt - a.connectedAt);
  }

  // Explorer/Git — no per-session snapshot exists (see useLazyExplorerSession.ts),
  // so jump_host_id is resolved live against the current host record. A host
  // that's been deleted entirely (evictForDeletedHost already surfaced that
  // via a notification) is skipped rather than shown as a broken row.
  for (const [sessionId, session] of Object.entries(lazySessions)) {
    const hostId = getLazySessionHostId(sessionId);
    if (!hostId) continue;
    const host = hosts.find((h) => h.id === hostId);
    if (!host?.jump_host_id) continue;
    const jumpHostName = hosts.find((h) => h.id === host.jump_host_id)?.name ?? "unknown host";
    const group = getOrCreate(hostId, host.name, jumpHostName);
    group.explorerStatus = session.status;
    if (session.status === "error") group.hasError = true;
    const gitTab = tabs.find(
      (t) =>
        (t.kind === "git-graph" || t.kind === "git-diff" || t.kind === "commit-diff") &&
        t.sessionId === sessionId,
    );
    if (gitTab) group.explorerTabId = gitTab.id;
  }

  return [...groups.values()].sort((a, b) => a.hostLabel.localeCompare(b.hostLabel));
}
