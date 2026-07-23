import React from "react";
import { useChatStore } from "@/modules/ai";
import { useEditorCursorStore } from "@/modules/editor/lib/cursorStore";
import { useLazyExplorerSession } from "@/modules/explorer/lib/useLazyExplorerSession";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { useTabsStore } from "@/modules/tabs/store/tabsStore";
import type { WorkspaceTab } from "@/modules/tabs/types";
import { buildBarBucket } from "./lib/renderBarItem";

export type SidebarPanel = "explorer" | "snippets" | "source-control" | "hosts" | "tabs" | null;

type Props = {
  home: string | null;
  onCd: (path: string) => void;
  onCdInNewTab?: (path: string) => void;
  onOpenMini: () => void;
  /** Only rendered when the AI panel is open and a key is loaded. */
  hasComposer: boolean;
  /** When set, render a one-click "Open preview" chip pointing at this URL. */
  detectedPreviewUrl?: string | null;
  onOpenPreview?: () => void;
  /** Active panel in each dual-dock slot — drives the panel switcher button highlight */
  leftActivePanel?: SidebarPanel;
  rightActivePanel?: SidebarPanel;
  onPanelToggle?: (panel: SidebarPanel, side?: "left" | "right") => void;
};

export const StatusBar = React.memo(function StatusBar({
  home,
  onCd,
  onCdInNewTab,
  onOpenMini,
  hasComposer,
  detectedPreviewUrl,
  onOpenPreview,
  leftActivePanel,
  rightActivePanel,
  onPanelToggle,
}: Props) {
  const panelOpen = useChatStore((s) => s.panelOpen);
  const openAiPanel = useChatStore((s) => s.openPanel);
  const aiEnabled = usePreferencesStore((s) => s.aiEnabled);
  const tabsLocation = usePreferencesStore((s) => s.tabsLocation);
  const bookmarksEnabled = usePreferencesStore((s) => s.bookmarksEnabled);
  const placements = usePreferencesStore((s) => s.barItemPlacements);
  const cursorLine = useEditorCursorStore((s) => s.line);
  const cursorCol = useEditorCursorStore((s) => s.col);

  const cwd = useTabsStore((s) => {
    const tab = s.tabs.find((t) => t.id === s.activeId);
    if (tab?.kind !== "workspace") return null;
    const wt = tab as WorkspaceTab;
    const session = wt.sessions[wt.activePaneId];
    if (session?.kind === "local") return session.cwd ?? null;
    if (session?.kind === "ssh") return session.cwd ?? null;
    return null;
  });
  // Same {hostId} the sidebar tree's ExplorerTarget resolves to for an SSH
  // workspace pane — acquiring it here (ref-counted, idempotent) reuses the
  // sidebar's already-open session when there is one, or lazily connects a
  // shared one otherwise, instead of the breadcrumb standing up its own.
  const sshHostId = useTabsStore((s) => {
    const tab = s.tabs.find((t) => t.id === s.activeId);
    if (tab?.kind !== "workspace") return null;
    const wt = tab as WorkspaceTab;
    const session = wt.sessions[wt.activePaneId];
    return session?.kind === "ssh" ? (session.hostId ?? null) : null;
  });
  const lazySession = useLazyExplorerSession(sshHostId);
  const remoteTarget =
    sshHostId && lazySession ? { hostId: sshHostId, sessionId: lazySession.sessionId } : null;
  const filePath = useTabsStore((s) => {
    const tab = s.tabs.find((t) => t.id === s.activeId);
    if (tab?.kind !== "editor") return null;
    const et = tab as { isUntitled: boolean; path: string };
    return et.isUntitled ? (et.path.split("/").pop() ?? "untitled.txt") : et.path;
  });

  const ctx = {
    placements,
    onPanelToggle,
    leftActivePanel,
    rightActivePanel,
    tabsLocation,
    bookmarksEnabled,
    sendCd: onCd,
    home,
    cwd,
    filePath,
    remoteTarget,
    onCd,
    onCdInNewTab,
    cursorLine,
    cursorCol,
    detectedPreviewUrl,
    onOpenPreview,
    aiEnabled,
    panelOpen,
    hasComposer,
    onOpenMini,
    openAiPanel,
  };

  return (
    <footer className="flex h-8 shrink-0 items-center justify-between gap-3 border-t border-border/60 bg-status-bar px-3 text-[11px]">
      <div className="flex min-w-0 flex-1 items-center gap-1 truncate">
        {buildBarBucket("statusbar", "left", ctx, "mx-1 h-3.5 w-px shrink-0 bg-border/60")}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {buildBarBucket("statusbar", "right", ctx, "mx-1 h-3.5 w-px shrink-0 bg-border/60")}
      </div>
    </footer>
  );
});
