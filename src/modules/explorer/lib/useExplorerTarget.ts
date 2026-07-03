import { useMemo } from "react";
import type { Host } from "@/modules/hosts";
import { useHostsStore } from "@/modules/hosts";
// Imported from the source files directly (not the `@/modules/tabs` barrel)
// — that barrel re-exports useTabManagement, which imports from
// `@/modules/explorer`'s own barrel. Going through it here would close a
// circular import (explorer -> tabs -> explorer).
import { selectActiveTab, useTabsStore } from "@/modules/tabs/store/tabsStore";
import type { Tab } from "@/modules/tabs/types";
import { dirname } from "./useFileTree";

export type ExplorerTarget =
  | { type: "local"; path: string | null }
  | {
      type: "remote";
      hostId: string;
      /** Session identity the RemoteFsProvider should use for sftp_* invokes. */
      sessionId: string;
      path: string | null;
      /** Whether this session belongs to an already-open SFTP tab (reused as-is)
       *  or is a lazy session the sidebar tree owns and must manage the lifecycle of. */
      source: "sftp-tab" | "lazy-session";
    };

/**
 * Pure derivation, split out from the hook so it's testable without mounting
 * `useTabsStore`/`useHostsStore` — table-driven tests just pass plain
 * `activeTab`/`hosts` values.
 *
 * Session reuse rule: an active `sftp` tab already owns a live connection
 * (its tab id doubles as the session_id) — reuse it instead of opening a
 * second one. An active SSH workspace session has no browsing connection of
 * its own (PTY and SFTP are separate connections, see sftp_ssh_context.md),
 * so it gets a lazy session keyed by host id that `useLazyExplorerSession`
 * manages independently of any tab's lifecycle.
 */
export function deriveExplorerTarget(
  activeTab: Tab | undefined,
  hosts: Host[],
  explorerRoot: string | null,
): ExplorerTarget {
  if (activeTab?.kind === "sftp") {
    return {
      type: "remote",
      hostId: activeTab.hostId,
      sessionId: String(activeTab.id),
      path: activeTab.remotePath ?? null,
      source: "sftp-tab",
    };
  }

  // A remote file opened via the sidebar tree (or the SFTP dual-pane tab)
  // becomes an editor/preview tab holding a LOCAL temp path — without this
  // branch the tab falls through to the generic "local" case below and the
  // sidebar would jump back to the local tree while editing a remote file.
  // `remoteHostId`/`remoteSource` are snapshotted at open time (same
  // pinning `GitGraphTab` etc. already do), so the explorer stays anchored
  // to that file's containing remote folder for as long as the tab is
  // active, independent of whichever tab/session originally opened it.
  if (activeTab?.kind === "editor" || activeTab?.kind === "preview") {
    if (activeTab.remoteHostId && activeTab.remoteHostTabId && activeTab.remotePath) {
      return {
        type: "remote",
        hostId: activeTab.remoteHostId,
        sessionId: activeTab.remoteHostTabId,
        path: dirname(activeTab.remotePath),
        source: activeTab.remoteSource ?? "lazy-session",
      };
    }
  }

  if (activeTab?.kind === "workspace") {
    const session = activeTab.sessions[activeTab.activePaneId];
    if (session?.kind === "ssh" && session.hostId) {
      const host = hosts.find((h) => h.id === session.hostId);
      return {
        type: "remote",
        hostId: session.hostId,
        sessionId: `explorer:${session.hostId}`,
        // A remote shell without OSC7 shell-integration never reports its
        // cwd, so `session.cwd` commonly stays unset for the session's whole
        // lifetime — without this fallback the tree would show "no
        // directory" forever on a fully connected session. Mirrors
        // SftpPane's own `host?.default_path_sftp ?? "/"` fallback for the
        // dual-pane tab.
        path: session.cwd ?? host?.default_path_ssh ?? (host ? "/" : null),
        source: "lazy-session",
      };
    }
  }

  return { type: "local", path: explorerRoot };
}

/**
 * Derives what the sidebar explorer — and, identically, Source Control, Git
 * Graph, and the CwdBreadcrumb path bar — should currently browse from the
 * active tab. `explorerRoot` (from `useWorkspaceCwd`) is reused as-is for
 * the local fallback case so the existing "last local cwd" logic isn't
 * duplicated. All four consumers share this single derivation rather than
 * each re-deriving local/remote session identity independently.
 */
export function useExplorerTarget(explorerRoot: string | null): ExplorerTarget {
  const activeTab = useTabsStore(selectActiveTab);
  const hosts = useHostsStore((s) => s.hosts);

  return useMemo(
    () => deriveExplorerTarget(activeTab, hosts, explorerRoot),
    [activeTab, hosts, explorerRoot],
  );
}
