import type { DragEndEvent } from "@dnd-kit/core";
import { PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { selectRenderStableTabs, useTabsStore } from "../store/tabsStore";
import type { Tab } from "../types";

export interface UseTabListReturn {
  tabs: Tab[];
  activeId: number;
  sensors: ReturnType<typeof useSensors>;
  handleDragEnd: (event: DragEndEvent) => void;
  /** Whether `id` should play the tab-enter animation this render — false on
   *  the very first render (so restored tabs don't animate) and false for
   *  any tab already seen in a prior render. */
  isNewTab: (id: number) => boolean;
  editingId: number | null;
  startEditing: (id: number) => void;
  finishEditing: () => void;
}

/**
 * Shared list-level state machine behind both `TabBar` (horizontal,
 * titlebar) and `SidebarTabList` (vertical, sidebar panel) — tabs/activeId
 * subscription, drag-reorder wiring, enter-animation bookkeeping, and the
 * rename-in-progress lifecycle. Presentation (Radix Tabs vs. plain buttons,
 * pill animation, wheel-scroll, sort-strategy direction) stays local to each
 * caller; this hook only owns behavior that both need identically, so a new
 * tab feature only ever needs to be added once.
 */
export function useTabList(): UseTabListReturn {
  const tabs = useTabsStore(useShallow(selectRenderStableTabs));
  const activeId = useTabsStore((s) => s.activeId);
  const reorderTabs = useTabsStore((s) => s.reorderTabs);
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
  const isNewTab = useCallback((id: number) => !firstRender && !seen.has(id), [firstRender, seen]);

  // Clear editing state if the tab being renamed is closed externally.
  useEffect(() => {
    if (isEditingStale(tabs, editingId)) setEditingId(null);
  }, [tabs, editingId]);

  const startEditing = useCallback((id: number) => setEditingId(id), []);
  const finishEditing = useCallback(() => setEditingId(null), []);

  return { tabs, activeId, sensors, handleDragEnd, isNewTab, editingId, startEditing, finishEditing };
}

/** Pure — whether an active rename should be cancelled because its tab no
 *  longer exists (e.g. closed via a different affordance mid-rename). */
export function isEditingStale(tabs: Tab[], editingId: number | null): boolean {
  return editingId !== null && !tabs.some((t) => t.id === editingId);
}

/** Pure — middle-click (button 1) closes a tab, except the last remaining
 *  tab or the home tab (which can't be closed at all). */
export function shouldMiddleClickClose(button: number, tabsLength: number, kind: Tab["kind"]): boolean {
  return button === 1 && tabsLength > 1 && kind !== "home";
}
