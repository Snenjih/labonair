import { EyeIcon, Key01Icon, KeyboardIcon, Menu01Icon, Settings01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import React, { useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { WindowControls } from "@/components/WindowControls";
import { IS_MAC, USE_CUSTOM_WINDOW_CONTROLS } from "@/lib/platform";
import { cn } from "@/lib/utils";
import { useChatStore } from "@/modules/ai";
import { useEditorCursorStore } from "@/modules/editor/lib/cursorStore";
import { useLazyExplorerSession } from "@/modules/explorer/lib/useLazyExplorerSession";
import { useJumpHostGroups } from "@/modules/header/components/JumpHostDropdown";
import { useNotificationStore } from "@/modules/notifications/store/useNotificationStore";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { useTransferStore } from "@/modules/sftp/store/transferStore";
import type { SidebarPanel } from "@/modules/statusbar";
import { buildBarBucket } from "@/modules/statusbar/lib/renderBarItem";
import type { Tab } from "@/modules/tabs";
import { TabBar } from "@/modules/tabs";
import { useAgentAccessStore } from "@/modules/tabs/store/agentAccessStore";
import { useTabsStore } from "@/modules/tabs/store/tabsStore";
import type { WorkspaceTab } from "@/modules/tabs/types";

type Props = {
  onSelect: (id: number) => void;
  onNew: () => void;
  onNewPreview: () => void;
  onNewEditor: () => void;
  onNewSsh: (hostId: string, title: string) => void;
  onNewSftp: (hostId: string, title: string) => void;
  onClose: (id: number) => void;
  onCloseOthers: (id: number) => void;
  onCloseAll: () => void;
  onCloseByKind: (kind: Tab["kind"]) => void;
  onDuplicate: (id: number) => void;
  onRename: (id: number, label: string) => void;
  onOpenShortcuts: () => void;
  onOpenSettings: () => void;
  onOpenKeybindings: () => void;
  onOpenHostManager: () => void;
  onOpenThemes: () => void;
  onNewGitGraph?: () => void;
  onPanelToggle?: (panel: SidebarPanel, side?: "left" | "right") => void;
  /** Active panel in each dual-dock slot — drives the panel switcher button
   *  highlight, mirrors StatusBar.tsx's identical props. */
  leftActivePanel: SidebarPanel;
  rightActivePanel: SidebarPanel;
  sendCd: (path: string) => void;
  /** Threaded down so titlebar-repositioned info/AI items (breadcrumb,
   *  cursor position, preview chip, AI cluster) render identically to how
   *  they'd look in the statusbar — see StatusBar.tsx for the counterparts. */
  home: string | null;
  onCd: (path: string) => void;
  onCdInNewTab?: (path: string) => void;
  onOpenMini: () => void;
  hasComposer: boolean;
  detectedPreviewUrl?: string | null;
  onOpenPreview?: () => void;
};

export const Header = React.memo(function Header({
  onSelect,
  onNew,
  onNewPreview,
  onNewEditor,
  onNewSsh,
  onNewSftp,
  onClose,
  onCloseOthers,
  onCloseAll,
  onCloseByKind,
  onDuplicate,
  onRename,
  onOpenShortcuts,
  onOpenSettings,
  onOpenKeybindings,
  onOpenHostManager,
  onOpenThemes,
  onNewGitGraph,
  onPanelToggle,
  leftActivePanel,
  rightActivePanel,
  sendCd,
  home,
  onCd,
  onCdInNewTab,
  onOpenMini,
  hasComposer,
  detectedPreviewUrl,
  onOpenPreview,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const tabsLocation = usePreferencesStore((s) => s.tabsLocation);
  const bookmarksEnabled = usePreferencesStore((s) => s.bookmarksEnabled);
  const badgesAlwaysVisible = usePreferencesStore((s) => s.badgesAlwaysVisible);
  const placements = usePreferencesStore((s) => s.barItemPlacements);
  const panelOpen = useChatStore((s) => s.panelOpen);
  const openAiPanel = useChatStore((s) => s.openPanel);
  const aiEnabled = usePreferencesStore((s) => s.aiEnabled);

  // These four badges each self-hide (return null) when empty and "Always
  // show badges" is off — precomputed here (not inside renderBarItem's
  // per-id switch, which runs in a loop and can't call hooks) so
  // buildBarBucket's divider logic can tell a badge is about to render
  // nothing and skip placing a divider next to it.
  const hasNotifications = useNotificationStore((s) => s.notifications.length > 0);
  const hasTransferJobs = useTransferStore((s) => s.jobs.length > 0);
  const bridgeEnabled = useAgentAccessStore((s) => s.bridgeEnabled);
  const hasAgentAccessEntries = useAgentAccessStore((s) => Object.keys(s.entries).length > 0);
  const jumpHostGroups = useJumpHostGroups();
  const notificationsVisible = badgesAlwaysVisible || hasNotifications;
  const transfersVisible = badgesAlwaysVisible || hasTransferJobs;
  const agentAccessVisible = bridgeEnabled && (badgesAlwaysVisible || hasAgentAccessEntries);
  const jumpHostsVisible = badgesAlwaysVisible || jumpHostGroups.length > 0;

  // cwd/cursor/filePath only feed cwdBreadcrumb/cursorPosition — gating
  // their selectors' *return value* (not the hook call, which must stay
  // unconditional) on whether those items actually live in the titlebar
  // keeps Header from re-rendering on every keystroke/cursor-move for the
  // majority of users, who have them in the statusbar by default.
  const showBreadcrumbInTitlebar = placements.cwdBreadcrumb.bar === "titlebar";
  const showCursorInTitlebar = placements.cursorPosition.bar === "titlebar";
  const needsActiveTabInfo = showBreadcrumbInTitlebar || showCursorInTitlebar;

  const cursorLine = useEditorCursorStore((s) => (showCursorInTitlebar ? s.line : null));
  const cursorCol = useEditorCursorStore((s) => (showCursorInTitlebar ? s.col : null));

  const cwd = useTabsStore((s) => {
    if (!showBreadcrumbInTitlebar) return null;
    const tab = s.tabs.find((t) => t.id === s.activeId);
    if (tab?.kind !== "workspace") return null;
    const wt = tab as WorkspaceTab;
    const session = wt.sessions[wt.activePaneId];
    if (session?.kind === "local") return session.cwd ?? null;
    if (session?.kind === "ssh") return session.cwd ?? null;
    return null;
  });
  const sshHostId = useTabsStore((s) => {
    if (!showBreadcrumbInTitlebar) return null;
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
    if (!needsActiveTabInfo) return null;
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
    notificationsVisible,
    jumpHostsVisible,
    agentAccessVisible,
    transfersVisible,
    sendCd,
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

  const titlebarLeft = buildBarBucket("titlebar", "left", ctx, "mx-0.5 h-5 w-px shrink-0 bg-border/60");
  const titlebarRight = buildBarBucket("titlebar", "right", ctx, "mx-0.5 h-5 w-px shrink-0 bg-border/60");

  const sideButtons = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 shrink-0 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          title="Menu"
        >
          <HugeiconsIcon icon={Menu01Icon} size={16} strokeWidth={1.75} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem onClick={onOpenSettings}>
          <HugeiconsIcon icon={Settings01Icon} size={16} strokeWidth={1.75} />
          <span className="flex-1">Settings</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onOpenShortcuts}>
          <HugeiconsIcon icon={KeyboardIcon} size={16} strokeWidth={1.75} />
          <span className="flex-1">Keyboard Shortcuts</span>
          <DropdownMenuShortcut>⌘?</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onOpenKeybindings}>
          <HugeiconsIcon icon={Key01Icon} size={16} strokeWidth={1.75} />
          <span className="flex-1">Keymap</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onOpenThemes}>
          <HugeiconsIcon icon={EyeIcon} size={16} strokeWidth={1.75} />
          <span className="flex-1">Themes...</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <div
      ref={rootRef}
      data-tauri-drag-region
      className={cn(
        "flex h-10 shrink-0 items-center gap-2 border-b border-border/60 bg-toolbar select-none",
        IS_MAC ? "pr-2 pl-20" : "pr-0 pl-2",
      )}
    >
      {!IS_MAC && sideButtons}

      {IS_MAC && <span className="mr-1 h-full w-px shrink-0 bg-border" />}

      {titlebarLeft.length > 0 && (
        <>
          {titlebarLeft}
          <span className="mx-1 h-5 w-px shrink-0 bg-border" />
        </>
      )}

      <div className="flex min-w-0 flex-1 items-center gap-2" data-tauri-drag-region>
        {tabsLocation === "titlebar" && (
          <TabBar
            onSelect={onSelect}
            onNew={onNew}
            onNewPreview={onNewPreview}
            onNewEditor={onNewEditor}
            onNewSsh={onNewSsh}
            onNewSftp={onNewSftp}
            onOpenHostManager={onOpenHostManager}
            onClose={onClose}
            onCloseOthers={onCloseOthers}
            onCloseAll={onCloseAll}
            onCloseByKind={onCloseByKind}
            onDuplicate={onDuplicate}
            onRename={onRename}
            onNewGitGraph={onNewGitGraph}
            compact={false}
          />
        )}
        <div data-tauri-drag-region className="h-full min-w-2 flex-1" />
      </div>

      {titlebarRight.length > 0 && (
        <>
          <span className="mx-1 h-5 w-px shrink-0 bg-border" />
          {titlebarRight}
        </>
      )}

      {IS_MAC && sideButtons}

      {USE_CUSTOM_WINDOW_CONTROLS && <WindowControls />}
    </div>
  );
});
