import { EyeIcon, Key01Icon, KeyboardIcon, Menu01Icon, Settings01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ReactNode } from "react";
import React, { useRef } from "react";
import { Button } from "@/components/ui/button";
import { ContextMenu, ContextMenuTrigger } from "@/components/ui/context-menu";
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
import { BookmarksDropdown } from "@/modules/bookmarks";
import { NotificationDropdown } from "@/modules/notifications/components/NotificationDropdown";
import { BarItemContextMenu } from "@/modules/settings/components/BarItemContextMenu";
import { withDividers } from "@/modules/settings/lib/barItemLayout";
import type { BarItemId } from "@/modules/settings/lib/barItems";
import { visibleItemsFor } from "@/modules/settings/lib/barItems";
import { usePreferencesStore } from "@/modules/settings/preferences";
import type { SidebarPanel } from "@/modules/statusbar";
import type { Tab } from "@/modules/tabs";
import { TabBar } from "@/modules/tabs";
import { AgentAccessBadge } from "./components/AgentAccessBadge";
import { JumpHostDropdown } from "./components/JumpHostDropdown";
import { TransferDropdown } from "./components/TransferDropdown";
import { UpdaterButton } from "./components/UpdaterButton";

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
  sendCd: (path: string) => void;
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
  sendCd,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const tabsLocation = usePreferencesStore((s) => s.tabsLocation);
  const bookmarksEnabled = usePreferencesStore((s) => s.bookmarksEnabled);
  const placements = usePreferencesStore((s) => s.barItemPlacements);

  function renderBadge(id: BarItemId): ReactNode {
    switch (id) {
      case "updater":
        return <UpdaterButton />;
      case "notifications":
        return <NotificationDropdown />;
      case "jumpHosts":
        return <JumpHostDropdown onPanelToggle={onPanelToggle} />;
      case "agentAccess":
        return <AgentAccessBadge />;
      case "transfers":
        return <TransferDropdown />;
      case "bookmarks":
        return bookmarksEnabled ? <BookmarksDropdown sendCd={sendCd} /> : null;
      default:
        return null;
    }
  }

  function renderBucket(side: "left" | "right") {
    const ids = visibleItemsFor(placements, "titlebar", side);
    const clusters = ids
      .map((id) => {
        const content = renderBadge(id);
        if (content === null) return null;
        return {
          key: id,
          node: (
            <ContextMenu key={id}>
              <ContextMenuTrigger asChild>
                <div className="flex shrink-0 items-center">{content}</div>
              </ContextMenuTrigger>
              <BarItemContextMenu itemId={id} />
            </ContextMenu>
          ),
        };
      })
      .filter((c): c is NonNullable<typeof c> => c !== null);
    return withDividers(clusters, "mx-0.5 h-5 w-px shrink-0 bg-border/60");
  }

  const titlebarLeft = renderBucket("left");
  const titlebarRight = renderBucket("right");

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
      {!IS_MAC && (
        <>
          {sideButtons}
          <span className="mx-1 h-5 w-px shrink-0 bg-border" />
        </>
      )}

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

      {IS_MAC && (
        <>
          <span className="mx-1 h-5 w-px shrink-0 bg-border" />
          {sideButtons}
        </>
      )}

      {USE_CUSTOM_WINDOW_CONTROLS && (
        <>
          <span className="ml-1 h-5 w-px shrink-0 bg-border" />
          <WindowControls />
        </>
      )}
    </div>
  );
});
