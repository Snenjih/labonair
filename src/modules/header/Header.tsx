import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { WindowControls } from "@/components/WindowControls";
import { IS_MAC, USE_CUSTOM_WINDOW_CONTROLS } from "@/lib/platform";
import type { Tab } from "@/modules/tabs";
import { TabBar } from "@/modules/tabs";
import {
  KeyboardIcon,
  Settings01Icon,
  SidebarLeftIcon,
  Menu01Icon,
  Globe02Icon,
  EyeIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useRef } from "react";
import { NotificationDropdown } from "@/modules/notifications/components/NotificationDropdown";
import { TransferDropdown } from "./components/TransferDropdown";
import { UpdaterButton } from "./components/UpdaterButton";

type Props = {
  tabs: Tab[];
  activeId: number;
  onSelect: (id: number) => void;
  onNew: () => void;
  onNewPreview: () => void;
  onNewEditor: () => void;
  onNewSsh: (hostId: string, title: string) => void;
  onNewSftp: (hostId: string, title: string) => void;
  onClose: (id: number) => void;
  onCloseOthers: (id: number) => void;
  onCloseAll: () => void;
  onToggleSidebar: () => void;
  onOpenShortcuts: () => void;
  onOpenSettings: () => void;
  onOpenHostManager: () => void;
  onOpenThemes: () => void;
};

export function Header({
  tabs,
  activeId,
  onSelect,
  onNew,
  onNewPreview,
  onNewEditor,
  onNewSsh,
  onNewSftp,
  onClose,
  onCloseOthers,
  onCloseAll,
  onToggleSidebar,
  onOpenShortcuts,
  onOpenSettings,
  onOpenHostManager,
  onOpenThemes,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);

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
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onClick={onOpenSettings}>
          <HugeiconsIcon icon={Settings01Icon} size={16} strokeWidth={1.75} />
          <span>Settings</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onOpenShortcuts}>
          <HugeiconsIcon icon={KeyboardIcon} size={16} strokeWidth={1.75} />
          <span>Keyboard Shortcuts</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onOpenThemes}>
          <HugeiconsIcon icon={EyeIcon} size={16} strokeWidth={1.75} />
          <span>Themes...</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onOpenHostManager}>
          <HugeiconsIcon icon={Globe02Icon} size={16} strokeWidth={1.75} />
          <span>Host Manager</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <div
      ref={rootRef}
      data-tauri-drag-region
      className={`flex h-10 shrink-0 items-center gap-2 border-b border-border/60 bg-card select-none ${
        IS_MAC ? "pr-2 pl-20" : "pr-0 pl-2"
      }`}
    >
      <Button
        onClick={onToggleSidebar}
        title="Toggle sidebar"
        variant="ghost"
        size="icon"
        className="shrink-0 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <HugeiconsIcon icon={SidebarLeftIcon} size={18} strokeWidth={1.75} />
      </Button>

      {!IS_MAC && (
        <>
          {sideButtons}
          <span className="mx-1 h-5 w-px shrink-0 bg-border" />
        </>
      )}

      {IS_MAC && <span className="mr-1 h-full w-px shrink-0 bg-border" />}

      <div
        className="flex min-w-0 flex-1 items-center gap-2"
        data-tauri-drag-region
      >
        <TabBar
          tabs={tabs}
          activeId={activeId}
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
          compact={false}
        />
        <div data-tauri-drag-region className="h-full min-w-2 flex-1" />
      </div>

      <UpdaterButton />
      <NotificationDropdown />
      <TransferDropdown />

      {IS_MAC && sideButtons}

      {USE_CUSTOM_WINDOW_CONTROLS && (
        <>
          <span className="ml-1 h-5 w-px shrink-0 bg-border" />
          <WindowControls />
        </>
      )}
    </div>
  );
}
