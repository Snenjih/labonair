import type { Host } from "@/modules/hosts";
import type { Tab } from "@/modules/tabs";
import type { PathBookmark } from "../store/pathBookmarksStore";

type BookmarkSection = { title: string; hostId: string | undefined; bookmarks: PathBookmark[] };

export type BookmarkFilterResult =
  | { mode: "single"; hostId: string | undefined; sections: BookmarkSection[] } // exactly 1 section
  | { mode: "sftp-split"; sections: BookmarkSection[] } // exactly 2 sections: host, local
  | { mode: "fallback"; sections: BookmarkSection[] }; // N sections, grouped by Local + each host

function hostTitle(hostId: string, hosts: Host[]): string {
  return hosts.find((h) => h.id === hostId)?.name ?? "Unknown host";
}

/**
 * Pure derivation of which bookmarks the titlebar dropdown should show for
 * the currently active tab — mirrors `deriveExplorerTarget`'s "pure function
 * over (activeTab, hosts, ...)" shape so it's unit-testable without mounting
 * any store.
 *
 * Bookmarks are connection-agnostic (no separate ssh/sftp concept), so a
 * workspace tab's active *pane* (not the tab as a whole — a workspace tab
 * can be a split with both a local and an ssh pane open) and an sftp tab's
 * `hostId` both just resolve to "show every bookmark tagged with this host".
 */
export function filterBookmarksForContext(
  activeTab: Tab | undefined,
  bookmarks: PathBookmark[],
  hosts: Host[],
): BookmarkFilterResult {
  if (activeTab?.kind === "workspace") {
    const session = activeTab.sessions[activeTab.activePaneId];
    if (session?.kind === "local") {
      return {
        mode: "single",
        hostId: undefined,
        sections: [
          { title: "Local", hostId: undefined, bookmarks: bookmarks.filter((b) => b.hostId === undefined) },
        ],
      };
    }
    if (session?.kind === "ssh" && session.hostId) {
      const hostId = session.hostId;
      return {
        mode: "single",
        hostId,
        sections: [
          {
            title: hostTitle(hostId, hosts),
            hostId,
            bookmarks: bookmarks.filter((b) => b.hostId === hostId),
          },
        ],
      };
    }
  }

  if (activeTab?.kind === "sftp") {
    const hostId = activeTab.hostId;
    return {
      mode: "sftp-split",
      sections: [
        {
          title: hostTitle(hostId, hosts),
          hostId,
          bookmarks: bookmarks.filter((b) => b.hostId === hostId),
        },
        { title: "Local", hostId: undefined, bookmarks: bookmarks.filter((b) => b.hostId === undefined) },
      ],
    };
  }

  // Fallback: no path context (Editor/Home/Preview/Git-Graph/AI-diff/Commit-diff,
  // or a workspace tab with no matching session) — show everything, grouped.
  const byHost = new Map<string | undefined, PathBookmark[]>();
  for (const b of bookmarks) {
    byHost.set(b.hostId, [...(byHost.get(b.hostId) ?? []), b]);
  }
  const sections: BookmarkSection[] = [];
  if (byHost.has(undefined)) {
    sections.push({ title: "Local", hostId: undefined, bookmarks: byHost.get(undefined)! });
  }
  for (const [hostId, list] of byHost) {
    if (hostId === undefined) continue;
    sections.push({ title: hostTitle(hostId, hosts), hostId, bookmarks: list });
  }
  return { mode: "fallback", sections };
}
