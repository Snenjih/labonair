import { useEffect } from "react";
import { PANEL_ITEM_TO_PANEL } from "@/modules/settings/lib/barItems";
import { usePreferencesStore } from "@/modules/settings/preferences";
import type { SidebarReturn, SidebarSide } from "./useSidebar";

const PANEL_ITEMS = Object.entries(PANEL_ITEM_TO_PANEL) as Array<
  [keyof typeof PANEL_ITEM_TO_PANEL, (typeof PANEL_ITEM_TO_PANEL)[keyof typeof PANEL_ITEM_TO_PANEL]]
>;

/**
 * Keeps the dual-dock slots reconciled with each sidebar panel's assigned
 * `side` from the bar-item registry: if a panel is currently open and its
 * assigned side changes (via the right-click position menu or the Layout &
 * Panels settings), move it to the matching dock slot instead of leaving it
 * stranded on the side it used to be on.
 */
export function useBarPanelSync(sidebar: SidebarReturn): void {
  const placements = usePreferencesStore((s) => s.barItemPlacements);

  useEffect(() => {
    for (const [itemId, panel] of PANEL_ITEMS) {
      const assignedSide = placements[itemId]?.side as SidebarSide | undefined;
      if (!assignedSide) continue;
      if (sidebar.left.activePanel === panel && assignedSide === "right") {
        sidebar.movePanel(panel, "left", "right");
      } else if (sidebar.right.activePanel === panel && assignedSide === "left") {
        sidebar.movePanel(panel, "right", "left");
      }
    }
    // Deliberately reacting only to placement changes, not every
    // sidebar.left/right.activePanel change (which happens on every manual
    // toggle) — movePanel is a no-op when the panel is already on the
    // assigned side, so this only fires the intended reconciliation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placements]);
}
