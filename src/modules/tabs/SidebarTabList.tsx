import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  Cancel01Icon,
  PlusSignIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useRef } from "react";
import { useTabsStore } from "./store/tabsStore";
import { TabIconFor, labelFor, NewTabDropdownItems } from "./lib/tabUtils";

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
  onDuplicate: (id: number) => void;
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
  onDuplicate,
}: Props) {
  const tabs = useTabsStore((s) => s.tabs);
  const activeId = useTabsStore((s) => s.activeId);
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
                    <TabIconFor tab={t} active={isActive} />
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
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Close tab"
                      title="Close tab"
                      onClick={(e) => {
                        e.stopPropagation();
                        onClose(t.id);
                      }}
                      className="size-5 shrink-0 rounded opacity-0 transition-opacity hover:opacity-100 group-hover:opacity-60"
                    >
                      <HugeiconsIcon icon={Cancel01Icon} size={11} strokeWidth={2} />
                    </Button>
                  )}
                </button>
              </ContextMenuTrigger>
              <ContextMenuContent>
                <ContextMenuItem onSelect={() => onClose(t.id)}>Close Tab</ContextMenuItem>
                <ContextMenuItem onSelect={() => onDuplicate(t.id)}>Duplicate Tab</ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem onSelect={() => onCloseOthers(t.id)}>Close Others</ContextMenuItem>
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
            <NewTabDropdownItems
              onNew={onNew}
              onNewPreview={onNewPreview}
              onNewEditor={onNewEditor}
              onNewSsh={onNewSsh}
              onNewSftp={onNewSftp}
              onOpenHostManager={onOpenHostManager}
            />
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
