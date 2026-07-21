import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { Cancel01Icon, PencilEdit02Icon, PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { SortableContext, horizontalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useShallow } from "zustand/react/shallow";
import { setAgentAccessGrant, useAgentAccessStore } from "./store/agentAccessStore";
import { selectRenderStableTabs, useTabsStore } from "./store/tabsStore";
import { TabIconFor, labelFor, pluralLabelFor, NewTabDropdownItems } from "./lib/tabUtils";
import type { Tab } from "./types";

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
  onCloseByKind: (kind: Tab["kind"]) => void;
  onDuplicate: (id: number) => void;
  onRename: (id: number, label: string) => void;
  onNewGitGraph?: () => void;
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
  onCloseByKind,
  onDuplicate,
  onRename,
  onNewGitGraph,
  compact,
}: Props) {
  const tabs = useTabsStore(useShallow(selectRenderStableTabs));
  const activeId = useTabsStore((s) => s.activeId);
  const reorderTabs = useTabsStore((s) => s.reorderTabs);
  const agentAccessEntries = useAgentAccessStore((s) => s.entries);
  const scrollRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [editingId, setEditingId] = useState<number | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      reorderTabs(Number(active.id), Number(over.id));
    },
    [reorderTabs],
  );

  // ── Sliding pill ────────────────────────────────────────────────────────────
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null);
  const [pillReady, setPillReady] = useState(false);

  const measurePill = useCallback(() => {
    const el = listRef.current?.querySelector<HTMLElement>('[data-tab-active="true"]');
    setPill(el ? { left: el.offsetLeft, width: el.offsetWidth } : null);
  }, []);

  useLayoutEffect(() => {
    measurePill();
  }, [measurePill, activeId, tabs]);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const ro = new ResizeObserver(measurePill);
    ro.observe(list);
    return () => ro.disconnect();
  }, [measurePill]);

  // Suppress slide transition on first paint so pill doesn't animate from origin.
  useEffect(() => {
    if (pill && !pillReady) {
      const id = requestAnimationFrame(() => setPillReady(true));
      return () => cancelAnimationFrame(id);
    }
  }, [pill, pillReady]);

  // ── Tab enter animation ─────────────────────────────────────────────────────
  // Seed with all current IDs on first render so restored tabs don't animate.
  const seenRef = useRef<Set<number> | null>(null);
  const firstRender = seenRef.current === null;
  let seen = seenRef.current;
  if (seen === null) {
    seen = new Set(tabs.map((t) => t.id));
    seenRef.current = seen;
  }
  useEffect(() => {
    seenRef.current = new Set(tabs.map((t) => t.id));
  }, [tabs]);

  // ── Wheel scroll ────────────────────────────────────────────────────────────
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

  // Keep active tab visible after selection / open.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const active = el.querySelector<HTMLElement>(`[data-tab-id="${activeId}"]`);
    active?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeId, tabs.length]);

  // Clear editing state if the tab being renamed is closed externally.
  useEffect(() => {
    if (editingId !== null && !tabs.find((t) => t.id === editingId)) {
      setEditingId(null);
    }
  }, [tabs, editingId]);

  return (
    <div
      ref={scrollRef}
      data-tauri-drag-region
      className="min-w-0 shrink overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <div className="flex w-max items-center gap-0.5">
        <Tabs value={String(activeId)} onValueChange={(v) => onSelect(Number(v))}>
          <TabsList ref={listRef} className="relative h-7 w-max gap-0.5 bg-transparent p-0">
            {/* Sliding pill — sits behind all triggers via z-[1] on triggers */}
            <span
              aria-hidden
              className="pointer-events-none absolute left-0 top-1/2 h-7 rounded-md bg-foreground/[0.07] shadow-sm ring-1 ring-inset ring-foreground/[0.05]"
              style={
                pill
                  ? {
                      width: pill.width,
                      transform: `translate(${pill.left}px, -50%)`,
                      transitionProperty: pillReady ? "transform, width" : "none",
                      transitionDuration: "var(--dur-base)",
                      transitionTimingFunction: "var(--ease-premium)",
                    }
                  : { opacity: 0 }
              }
            />

            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={tabs.map((t) => t.id)} strategy={horizontalListSortingStrategy}>
                {tabs.map((t) => {
                  const isActive = t.id === activeId;
                  const isNew = !firstRender && !seen!.has(t.id);

                  // Render a non-button cell while renaming so <input> isn't nested
                  // inside <button> (invalid HTML; WebKit blocks focus/selection).
                  if (editingId === t.id && t.kind === "workspace") {
                    return (
                      <SortableTabWrapper key={t.id} id={t.id} disabled>
                        <div
                          data-tab-id={t.id}
                          className={cn(
                            "flex h-7 shrink-0 items-center gap-1.5 rounded-md text-xs bg-foreground/[0.07]",
                            compact ? "px-1.5" : "px-2",
                          )}
                        >
                          <TabIconFor tab={t} active={true} />
                          <TabRenameInput
                            initial={labelFor(t)}
                            onCommit={(value) => {
                              onRename(t.id, value);
                              setEditingId(null);
                            }}
                            onCancel={() => setEditingId(null)}
                          />
                        </div>
                      </SortableTabWrapper>
                    );
                  }

                  const trigger = (
                    <TabsTrigger
                      value={String(t.id)}
                      data-tab-id={t.id}
                      data-tab-active={isActive ? "true" : undefined}
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
                        "group relative z-[1] h-7 shrink-0 gap-1.5 rounded-md text-xs",
                        "bg-transparent data-active:bg-transparent dark:data-active:bg-transparent",
                        "transition-colors justify-between",
                        isNew && "labonair-tab-in",
                        isActive
                          ? "text-foreground dark:text-foreground"
                          : "text-muted-foreground hover:text-foreground/80",
                        compact ? "px-1.5!" : tabs.length === 1 ? "px-2!" : "ps-2! pe-1!",
                      )}
                    >
                      <span
                        className={cn(
                          "flex items-center gap-1.5 truncate",
                          compact ? "max-w-32" : "max-w-80",
                        )}
                      >
                        <TabIconFor tab={t} active={isActive} />
                        <span className="truncate">{labelFor(t)}</span>
                        {t.kind === "editor" && t.dirty ? (
                          <span
                            aria-label="Unsaved changes"
                            className="size-1.5 shrink-0 rounded-full bg-foreground/70"
                          />
                        ) : null}
                      </span>
                      {tabs.length > 1 && t.kind !== "home" && (
                        <span
                          role="button"
                          aria-label="Close tab"
                          data-no-drag
                          onClick={(e) => {
                            e.stopPropagation();
                            onClose(t.id);
                          }}
                          className="rounded p-0.5 opacity-0 transition-opacity hover:bg-accent hover:opacity-100 group-hover:opacity-60"
                        >
                          <HugeiconsIcon icon={Cancel01Icon} size={11} strokeWidth={2} />
                        </span>
                      )}
                    </TabsTrigger>
                  );

                  // Workspace tabs get a rename-focused context menu.
                  // All other types keep the original menu (duplicate, close others, close all).
                  if (t.kind === "workspace") {
                    const activeSession = t.sessions[t.activePaneId];
                    const isSsh = activeSession?.kind === "ssh";
                    const isGranted = Boolean(agentAccessEntries[t.id]);
                    return (
                      <SortableTabWrapper key={t.id} id={t.id} disabled={false}>
                        <ContextMenu>
                          <ContextMenuTrigger asChild>{trigger}</ContextMenuTrigger>
                          <ContextMenuContent
                            className="min-w-36"
                            onCloseAutoFocus={(e) => e.preventDefault()}
                          >
                            <ContextMenuItem onSelect={() => setEditingId(t.id)}>
                              <HugeiconsIcon icon={PencilEdit02Icon} size={14} strokeWidth={1.75} />
                              <span className="flex-1">Rename</span>
                            </ContextMenuItem>
                            {isSsh && activeSession && (
                              <>
                                <ContextMenuSeparator />
                                <ContextMenuCheckboxItem
                                  checked={isGranted}
                                  onCheckedChange={(checked) =>
                                    void setAgentAccessGrant(t.id, activeSession.id, checked, labelFor(t))
                                  }
                                >
                                  Grant AI Agent Access
                                </ContextMenuCheckboxItem>
                              </>
                            )}
                            {tabs.length > 1 && (
                              <>
                                <ContextMenuSeparator />
                                <ContextMenuItem onSelect={() => onClose(t.id)}>
                                  <HugeiconsIcon icon={Cancel01Icon} size={14} strokeWidth={1.75} />
                                  <span className="flex-1">Close</span>
                                </ContextMenuItem>
                                <ContextMenuItem onSelect={() => onCloseByKind(t.kind)}>
                                  <span className="flex-1">Close All {pluralLabelFor(t.kind)}</span>
                                </ContextMenuItem>
                              </>
                            )}
                          </ContextMenuContent>
                        </ContextMenu>
                      </SortableTabWrapper>
                    );
                  }

                  return (
                    <SortableTabWrapper key={t.id} id={t.id} disabled={false}>
                      <ContextMenu>
                        <ContextMenuTrigger asChild>{trigger}</ContextMenuTrigger>
                        <ContextMenuContent>
                          {t.kind !== "home" && (
                            <>
                              <ContextMenuItem onSelect={() => onClose(t.id)}>Close Tab</ContextMenuItem>
                              <ContextMenuItem onSelect={() => onDuplicate(t.id)}>
                                Duplicate Tab
                              </ContextMenuItem>
                              <ContextMenuSeparator />
                            </>
                          )}
                          <ContextMenuItem onSelect={() => onCloseOthers(t.id)}>Close Others</ContextMenuItem>
                          <ContextMenuItem onSelect={onCloseAll}>Close All</ContextMenuItem>
                          <ContextMenuItem onSelect={() => onCloseByKind(t.kind)}>
                            Close All {pluralLabelFor(t.kind)}
                          </ContextMenuItem>
                        </ContextMenuContent>
                      </ContextMenu>
                    </SortableTabWrapper>
                  );
                })}
              </SortableContext>
            </DndContext>
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
              onNewGitGraph={onNewGitGraph}
            />
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

function SortableTabWrapper({
  id,
  disabled,
  children,
}: {
  id: number;
  disabled: boolean;
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled,
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={isDragging ? "relative z-50 opacity-50" : undefined}
      {...attributes}
      {...listeners}
    >
      {children}
    </div>
  );
}

function TabRenameInput({
  initial,
  onCommit,
  onCancel,
}: {
  initial: string;
  onCommit: (value: string) => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false);

  useEffect(() => {
    // Delay focus to after context menu restores focus to its trigger on close.
    const raf = requestAnimationFrame(() => {
      ref.current?.focus();
      ref.current?.select();
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  const finish = (fn: () => void) => {
    if (done.current) return;
    done.current = true;
    fn();
  };

  // explicit=true (Enter pressed) commits even if label is unchanged —
  // this freezes customTitle so cwd updates no longer override it.
  const commit = (value: string, explicit: boolean) => {
    if (!explicit && value.trim() === initial.trim()) finish(onCancel);
    else finish(() => onCommit(value));
  };

  return (
    <input
      ref={ref}
      defaultValue={initial}
      aria-label="Rename tab"
      className="w-28 min-w-0 rounded-sm bg-background px-1 text-xs text-foreground outline-none ring-1 ring-border focus:ring-ring"
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") commit(e.currentTarget.value, true);
        else if (e.key === "Escape") finish(onCancel);
      }}
      onBlur={(e) => {
        if (!document.hasFocus()) return;
        commit(e.currentTarget.value, false);
      }}
    />
  );
}
