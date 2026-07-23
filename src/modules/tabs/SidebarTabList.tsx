import { closestCenter, DndContext } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Cancel01Icon, PlusSignIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { ContextMenu, ContextMenuTrigger } from "@/components/ui/context-menu";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { NonWorkspaceTabContextMenuContent } from "./components/NonWorkspaceTabContextMenuContent";
import { WorkspaceTabContextMenuContent } from "./components/WorkspaceTabContextMenuContent";
import { labelFor, NewTabDropdownItems, TabIconFor } from "./lib/tabUtils";
import { shouldMiddleClickClose, useTabList } from "./lib/useTabList";
import type { Tab, WorkspaceTab } from "./types";

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
  onCloseByKind,
  onDuplicate,
  onRename,
  onNewGitGraph,
}: Props) {
  const { tabs, activeId, sensors, handleDragEnd, isNewTab, editingId, startEditing, finishEditing } =
    useTabList();
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
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={tabs.map((t) => t.id)} strategy={verticalListSortingStrategy}>
            {tabs.map((t) => {
              const isActive = t.id === activeId;
              const isNew = isNewTab(t.id);

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
                          finishEditing();
                        }}
                        onCancel={finishEditing}
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
                  onAuxClick={(e) => {
                    if (shouldMiddleClickClose(e.button, tabs.length, t.kind)) {
                      e.preventDefault();
                      e.stopPropagation();
                      onClose(t.id);
                    }
                  }}
                  onMouseDown={(e) => {
                    if (e.button === 1) e.preventDefault();
                  }}
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

              return (
                <SortableSidebarTabWrapper key={t.id} id={t.id} disabled={false}>
                  <ContextMenu>
                    <ContextMenuTrigger asChild>{btn}</ContextMenuTrigger>
                    {t.kind === "workspace" ? (
                      <WorkspaceTabContextMenuContent
                        tab={t as WorkspaceTab}
                        tabsLength={tabs.length}
                        onStartRename={() => startEditing(t.id)}
                        onClose={onClose}
                        onCloseByKind={onCloseByKind}
                      />
                    ) : (
                      <NonWorkspaceTabContextMenuContent
                        tab={t}
                        onClose={onClose}
                        onDuplicate={onDuplicate}
                        onCloseOthers={onCloseOthers}
                        onCloseAll={onCloseAll}
                        onCloseByKind={onCloseByKind}
                      />
                    )}
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
