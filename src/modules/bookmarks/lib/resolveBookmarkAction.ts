import type { Tab } from "@/modules/tabs";
import type { PathBookmark } from "../store/pathBookmarksStore";

export type BookmarkActionKind = "new-terminal" | "current-terminal" | "current-sftp" | "new-sftp";

export type EnabledActions = Record<BookmarkActionKind, boolean>;

function isCurrentTerminalApplicable(bm: PathBookmark, activeTab: Tab | undefined): boolean {
  if (activeTab?.kind !== "workspace") return false;
  const session = activeTab.sessions[activeTab.activePaneId];
  if (session?.kind === "local") return bm.hostId === undefined;
  if (session?.kind === "ssh") return bm.hostId === session.hostId;
  return false;
}

function isCurrentSftpApplicable(bm: PathBookmark, activeTab: Tab | undefined): boolean {
  if (activeTab?.kind !== "sftp") return false;
  // A local bookmark always applies to the sftp tab's local side; a host
  // bookmark only applies when it matches this tab's own host.
  return bm.hostId === undefined || bm.hostId === activeTab.hostId;
}

/** Every action that is both enabled in settings and applicable to this
 *  bookmark given the currently active tab — in fixed display order. */
export function applicableActions(
  bm: PathBookmark,
  activeTab: Tab | undefined,
  enabledActions: EnabledActions,
): BookmarkActionKind[] {
  const out: BookmarkActionKind[] = [];
  if (enabledActions["new-terminal"]) out.push("new-terminal");
  if (enabledActions["current-terminal"] && isCurrentTerminalApplicable(bm, activeTab)) {
    out.push("current-terminal");
  }
  if (enabledActions["current-sftp"] && isCurrentSftpApplicable(bm, activeTab)) {
    out.push("current-sftp");
  }
  // Never shown for local bookmarks — there's no such thing as a local-only SFTP tab.
  if (enabledActions["new-sftp"] && bm.hostId !== undefined) out.push("new-sftp");
  return out;
}

/**
 * What clicking the bookmark's path/label text itself should do. Resolves
 * the `primaryClickSetting` ("current" | "new") against whichever surface
 * (terminal or sftp) the active tab already is, then falls back — in order —
 * to whichever "new" action is best-guessable, with an absolute floor of
 * `new-terminal` (even if the user disabled it in settings) so a click is
 * never fully inert. That floor only ever fires in the degenerate case (all
 * 4 actions disabled, or an unresolvable context) and only affects the
 * primary click — icon-slot actions always strictly honor the 4 toggles.
 */
export function resolvePrimaryAction(
  bm: PathBookmark,
  activeTab: Tab | undefined,
  primaryClickSetting: "current" | "new",
  enabledActions: EnabledActions,
): BookmarkActionKind {
  const applicable = applicableActions(bm, activeTab, enabledActions);
  const isTerminalSurface = activeTab?.kind === "workspace";
  const isSftpSurface = activeTab?.kind === "sftp";

  if (primaryClickSetting === "current") {
    if (isTerminalSurface && applicable.includes("current-terminal")) return "current-terminal";
    if (isSftpSurface && applicable.includes("current-sftp")) return "current-sftp";
  } else {
    if (isTerminalSurface && applicable.includes("new-terminal")) return "new-terminal";
    if (isSftpSurface && bm.hostId !== undefined && applicable.includes("new-sftp")) return "new-sftp";
  }

  // Fallback chain, shared by both settings once the "obvious" branch didn't apply.
  if (isSftpSurface && bm.hostId !== undefined && applicable.includes("new-sftp")) return "new-sftp";
  if (applicable.includes("new-terminal")) return "new-terminal";
  return "new-terminal"; // absolute floor — see doc comment above
}
