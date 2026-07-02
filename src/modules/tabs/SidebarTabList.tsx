import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
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
import { SortableContext, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
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
  onRename: (id: number, label: string) => void;
  onNewGitGraph?: () => void;
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
  onRename,
  onNewGitGraph,
}: Props) {
  const tabs = useTabsStore((s) => s.tabs);
  const activeId = useTabsStore((s) => s.activeId);
  const reorderTabs = useTabsStore((s) => s.reorderTabs);
  const scrollRef = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const active = el.querySelector<HTMLElement>(`[data-tab-id="${activeId}"]`);
    active?.scrollIntoView({ block: "nearest" });
  }, [activeId, tabs.length]);

  // Clear editing state if the tab being renamed is closed externally.
  useEffect(() => {
    if (editingId !== null && !tabs.find((t) => t.id === editingId)) {
      setEditingId(null);
    }
  }, [tabs, editingId]);

  // Tab enter animation — seed seen set on first render so restored tabs don't animate.
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

  return (
    <div className="flex h-full flex-col">
      <div
        ref={scrollRef}
        className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto p-1.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={tabs.map((t) => t.id)} strategy={verticalListSortingStrategy}>
            {tabs.map((t) => {
              const isActive = t.id === activeId;
              const isNew = !firstRender && !seen!.has(t.id);

              // Render a non-button cell while renaming (input can't be inside button).
              if (editingId === t.id && t.kind === "workspace") {
                return (
                  <SortableSidebarTabWrapper key={t.id} id={t.id} disabled>
                    <div
                      data-tab-id={t.id}
                      className="flex w-full items-center gap-1.5 rounded-lg bg-foreground/[0.07] px-2 py-1.5 text-xs"
                    >
                      <span className="shrink-0">
                        <TabIconFor tab={t} active={true} />
                      </span>
                      <SidebarRenameInput
                        initial={labelFor(t)}
                        onCommit={(value) => {
                          onRename(t.id, value);
                          setEditingId(null);
                        }}
                        onCancel={() => setEditingId(null)}
                      />
                    </div>
                  </SortableSidebarTabWrapper>
                );
              }

              const btn = (
                <button
                  type="button"
                  data-tab-id={t.id}
                  onClick={() => onSelect(t.id)}
                  className={cn(
                    "group flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left text-xs transition-colors",
                    isNew && "labonair-tab-in",
                    isActive
                      ? "bg-foreground/[0.07] text-foreground"
                      : "text-muted-foreground hover:bg-accent/30 hover:text-foreground",
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
                  {tabs.length > 1 && t.kind !== "home" && (
                    <span
                      role="button"
                      aria-label="Close tab"
                      onClick={(e) => {
                        e.stopPropagation();
                        onClose(t.id);
                      }}
                      className="rounded p-0.5 opacity-0 transition-opacity hover:bg-accent hover:opacity-100 group-hover:opacity-60"
                    >
                      <HugeiconsIcon icon={Cancel01Icon} size={11} strokeWidth={2} />
                    </span>
                  )}
                </button>
              );

              if (t.kind === "workspace") {
                return (
                  <SortableSidebarTabWrapper key={t.id} id={t.id} disabled={false}>
                    <ContextMenu>
                      <ContextMenuTrigger asChild>{btn}</ContextMenuTrigger>
                      <ContextMenuContent className="min-w-36" onCloseAutoFocus={(e) => e.preventDefault()}>
                        <ContextMenuItem onSelect={() => setEditingId(t.id)}>
                          <HugeiconsIcon icon={PencilEdit02Icon} size={14} strokeWidth={1.75} />
                          <span className="flex-1">Rename</span>
                        </ContextMenuItem>
                        {tabs.length > 1 && (
                          <>
                            <ContextMenuSeparator />
                            <ContextMenuItem onSelect={() => onClose(t.id)}>
                              <HugeiconsIcon icon={Cancel01Icon} size={14} strokeWidth={1.75} />
                              <span className="flex-1">Close</span>
                            </ContextMenuItem>
                          </>
                        )}
                      </ContextMenuContent>
                    </ContextMenu>
                  </SortableSidebarTabWrapper>
                );
              }

              return (
                <SortableSidebarTabWrapper key={t.id} id={t.id} disabled={false}>
                  <ContextMenu>
                    <ContextMenuTrigger asChild>{btn}</ContextMenuTrigger>
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
                </SortableSidebarTabWrapper>
              );
            })}
          </SortableContext>
        </DndContext>
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
              onNewGitGraph={onNewGitGraph}
            />
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

function SortableSidebarTabWrapper({
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

function SidebarRenameInput({
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

  const commit = (value: string, explicit: boolean) => {
    if (!explicit && value.trim() === initial.trim()) finish(onCancel);
    else finish(() => onCommit(value));
  };

  return (
    <input
      ref={ref}
      defaultValue={initial}
      aria-label="Rename tab"
      className="min-w-0 flex-1 rounded-sm bg-background px-1 text-xs text-foreground outline-none ring-1 ring-border focus:ring-ring"
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
