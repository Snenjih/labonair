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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  compact?: boolean;
};

export function TabBar({
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
  compact,
}: Props) {
  const tabs = useTabsStore((s) => s.tabs);
  const activeId = useTabsStore((s) => s.activeId);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Horizontal wheel scroll without holding shift.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      if (el.scrollWidth <= el.clientWidth) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // Keep the active tab visible after selection / open.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const active = el.querySelector<HTMLElement>(`[data-tab-id="${activeId}"]`);
    active?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeId, tabs.length]);

  return (
    <div
      ref={scrollRef}
      data-tauri-drag-region
      className="min-w-0 shrink overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <div className="flex w-max items-center gap-0.5">
        <Tabs
          value={String(activeId)}
          onValueChange={(v) => onSelect(Number(v))}
        >
          <TabsList className="h-7 w-max gap-0.5 bg-transparent p-0">
            {tabs.map((t) => (
              <ContextMenu key={t.id}>
                <ContextMenuTrigger asChild>
                  <TabsTrigger
                    value={String(t.id)}
                    data-tab-id={t.id}
                    onAuxClick={(e) => {
                      if (e.button === 1 && tabs.length > 1 && t.kind !== "home") {
                        e.preventDefault();
                        e.stopPropagation();
                        onClose(t.id);
                      }
                    }}
                    onMouseDown={(e) => {
                      if (e.button === 1) e.preventDefault();
                    }}
                    className={cn(
                      "group h-7 shrink-0 gap-1.5 rounded-xl text-xs text-muted-foreground transition-colors data-[state=active]:bg-accent data-[state=active]:text-foreground hover:bg-accent/60 hover:text-foreground justify-between",
                      compact ? "px-1.5!" : "ps-2! pe-1!",
                    )}
                  >
                    <span
                      className={cn(
                        "flex items-center gap-1.5 truncate",
                        compact ? "max-w-32" : "max-w-56",
                      )}
                    >
                      <TabIconFor tab={t} active={t.id === activeId} />
                      <span className="truncate">{labelFor(t)}</span>
                      {t.kind === "editor" && t.dirty ? (
                        <span
                          aria-label="Unsaved changes"
                          className="size-1.5 shrink-0 rounded-full bg-foreground/70"
                        />
                      ) : null}
                    </span>
                    {tabs.length > 1 && t.kind !== "home" && (
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
                  </TabsTrigger>
                </ContextMenuTrigger>
                <ContextMenuContent>
                  {t.kind !== "home" && (
                    <>
                      <ContextMenuItem onSelect={() => onClose(t.id)}>Close Tab</ContextMenuItem>
                      <ContextMenuItem onSelect={() => onDuplicate(t.id)}>Duplicate Tab</ContextMenuItem>
                      <ContextMenuSeparator />
                    </>
                  )}
                  <ContextMenuItem onSelect={() => onCloseOthers(t.id)}>Close Others</ContextMenuItem>
                  <ContextMenuItem onSelect={onCloseAll}>Close All</ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            ))}
          </TabsList>
        </Tabs>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-7 shrink-0 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
              title="New tab"
            >
              <HugeiconsIcon icon={PlusSignIcon} size={14} strokeWidth={2} />
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
