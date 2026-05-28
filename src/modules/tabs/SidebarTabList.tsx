import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useHostsStore } from "@/modules/hosts/store/hostsStore";
import { cn } from "@/lib/utils";
import { fileIconUrl } from "@/modules/explorer/lib/iconResolver";
import {
  Cancel01Icon,
  CloudServerIcon,
  ComputerTerminal02Icon,
  Folder01Icon,
  Folder02Icon,
  GitCompareIcon,
  Globe02Icon,
  Home03Icon,
  PencilEdit02Icon,
  PlusSignIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useRef } from "react";
import type { Tab, WorkspaceTab } from "./lib/useTabs";
import { useTabsStore } from "./store/tabsStore";

type Props = {
  onSelect: (id: number) => void;
  onNew: () => void;
  onNewPreview: () => void;
  onNewEditor: () => void;
  onNewSsh: (hostId: string, title: string) => void;
  onNewSftp: (hostId: string, title: string) => void;
  onOpenHostManager: () => void;
  onClose: (id: number) => void;
  onCloseOthers: (id: number) => void;
  onCloseAll: () => void;
};

export function SidebarTabList({
  onSelect,
  onNew,
  onNewPreview,
  onNewEditor,
  onNewSsh,
  onNewSftp,
  onOpenHostManager,
  onClose,
  onCloseOthers,
  onCloseAll,
}: Props) {
  const tabs = useTabsStore((s) => s.tabs);
  const activeId = useTabsStore((s) => s.activeId);
  const hosts = useHostsStore((s) => s.hosts);
  const recentHosts = [...hosts]
    .sort((a, b) => (b.last_connected_at ?? 0) - (a.last_connected_at ?? 0))
    .slice(0, 5);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const active = el.querySelector<HTMLElement>(`[data-tab-id="${activeId}"]`);
    active?.scrollIntoView({ block: "nearest" });
  }, [activeId, tabs.length]);

  return (
    <div className="flex h-full flex-col">
      <div
        ref={scrollRef}
        className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto p-1.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {tabs.map((t) => {
          const isActive = t.id === activeId;
          return (
            <ContextMenu key={t.id}>
              <ContextMenuTrigger asChild>
                <button
                  type="button"
                  data-tab-id={t.id}
                  onClick={() => onSelect(t.id)}
                  className={cn(
                    "group flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-xs transition-colors",
                    isActive
                      ? "bg-accent text-foreground"
                      : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
                  )}
                >
                  <span className="shrink-0">
                    <TabIcon tab={t} active={isActive} />
                  </span>
                  <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate">
                    <span className="truncate">{labelFor(t)}</span>
                    {t.kind === "editor" && t.dirty ? (
                      <span
                        aria-label="Unsaved changes"
                        className="size-1.5 shrink-0 rounded-full bg-foreground/70"
                      />
                    ) : null}
                  </span>
                  {tabs.length > 1 && (
                    <span
                      role="button"
                      aria-label="Close tab"
                      onClick={(e) => {
                        e.stopPropagation();
                        onClose(t.id);
                      }}
                      className="shrink-0 rounded p-0.5 opacity-0 transition-opacity hover:bg-accent hover:opacity-100 group-hover:opacity-60"
                    >
                      <HugeiconsIcon icon={Cancel01Icon} size={11} strokeWidth={2} />
                    </span>
                  )}
                </button>
              </ContextMenuTrigger>
              <ContextMenuContent>
                <ContextMenuItem onSelect={() => onClose(t.id)}>
                  Close Tab
                </ContextMenuItem>
                <ContextMenuItem onSelect={() => onCloseOthers(t.id)}>
                  Close Others
                </ContextMenuItem>
                <ContextMenuItem onSelect={onCloseAll}>Close All</ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          );
        })}
      </div>

      <div className="shrink-0 border-t border-border/60 p-1.5">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
              title="New tab"
            >
              <HugeiconsIcon icon={PlusSignIcon} size={13} strokeWidth={2} />
              New Tab
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-44">
            <DropdownMenuItem onSelect={() => onNew()}>
              <HugeiconsIcon icon={ComputerTerminal02Icon} size={14} strokeWidth={1.75} />
              <span className="flex-1">Terminal</span>
              <span className="text-xs text-muted-foreground">⌘T</span>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onNewEditor()}>
              <HugeiconsIcon icon={PencilEdit02Icon} size={14} strokeWidth={1.75} />
              <span className="flex-1">Editor</span>
              <span className="text-xs text-muted-foreground">⌘E</span>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onNewPreview()}>
              <HugeiconsIcon icon={Globe02Icon} size={14} strokeWidth={1.75} />
              <span className="flex-1">Preview</span>
              <span className="text-xs text-muted-foreground">⌘P</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <HugeiconsIcon icon={ComputerTerminal02Icon} size={14} strokeWidth={1.75} />
                <span className="flex-1">SSH</span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="min-w-48">
                {recentHosts.length === 0 ? (
                  <DropdownMenuItem disabled>
                    <span>No hosts yet</span>
                  </DropdownMenuItem>
                ) : (
                  recentHosts.map((host) => (
                    <DropdownMenuItem
                      key={host.id}
                      onSelect={() => onNewSsh(host.id, host.name)}
                    >
                      <span className="flex-1 truncate">{host.name}</span>
                      <span className="ml-2 max-w-28 truncate text-xs text-muted-foreground">
                        {host.host_address}
                      </span>
                    </DropdownMenuItem>
                  ))
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={onOpenHostManager}>
                  <span>All hosts...</span>
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <HugeiconsIcon icon={CloudServerIcon} size={14} strokeWidth={1.75} />
                <span className="flex-1">SFTP</span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="min-w-48">
                {recentHosts.length === 0 ? (
                  <DropdownMenuItem disabled>
                    <span>No hosts yet</span>
                  </DropdownMenuItem>
                ) : (
                  recentHosts.map((host) => (
                    <DropdownMenuItem
                      key={host.id}
                      onSelect={() => onNewSftp(host.id, host.name)}
                    >
                      <span className="flex-1 truncate">{host.name}</span>
                      <span className="ml-2 max-w-28 truncate text-xs text-muted-foreground">
                        {host.host_address}
                      </span>
                    </DropdownMenuItem>
                  ))
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={onOpenHostManager}>
                  <span>All hosts...</span>
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

function TabIcon({ tab, active }: { tab: Tab; active: boolean }) {
  if (tab.kind === "editor") {
    const url = fileIconUrl(tab.title);
    return url ? <img src={url} alt="" className="size-3.5 shrink-0" /> : null;
  }
  if (tab.kind === "preview") {
    return <HugeiconsIcon icon={Globe02Icon} size={14} strokeWidth={1.75} className="shrink-0" />;
  }
  if (tab.kind === "ai-diff") {
    return (
      <HugeiconsIcon
        icon={GitCompareIcon}
        size={14}
        strokeWidth={1.75}
        className="shrink-0 text-warning"
      />
    );
  }
  if (tab.kind === "home") {
    return <HugeiconsIcon icon={Home03Icon} size={14} strokeWidth={1.75} className="shrink-0" />;
  }
  if (tab.kind === "sftp") {
    return <HugeiconsIcon icon={CloudServerIcon} size={14} strokeWidth={1.75} className="shrink-0" />;
  }
  if (tab.kind === "workspace") {
    return (
      <HugeiconsIcon icon={ComputerTerminal02Icon} size={14} strokeWidth={1.75} className="shrink-0" />
    );
  }
  return (
    <HugeiconsIcon
      icon={active ? Folder02Icon : Folder01Icon}
      size={14}
      strokeWidth={2}
      className="shrink-0"
    />
  );
}

function labelFor(t: Tab): string {
  if (t.kind === "editor") return t.title;
  if (t.kind === "preview") return t.title;
  if (t.kind === "ai-diff") return t.title;
  if (t.kind === "home") return t.title;
  if (t.kind === "sftp") return t.title;
  const wt = t as WorkspaceTab;
  const activeSession = wt.sessions[wt.activePaneId];
  if (activeSession?.kind === "local" && activeSession.cwd) {
    const parts = activeSession.cwd.split("/").filter(Boolean);
    return parts.length ? parts[parts.length - 1] : "/";
  }
  return wt.title;
}
