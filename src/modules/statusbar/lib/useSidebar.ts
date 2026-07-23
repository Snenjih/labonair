import { useCallback, useEffect, useRef, useState } from "react";
import type { PanelImperativeHandle } from "react-resizable-panels";
import { PANEL_TO_ITEM_ID } from "@/modules/settings/lib/barItems";
import { usePreferencesStore } from "@/modules/settings/preferences";
import {
  setSidebarActivePanel,
  setSidebarOpen,
  setSidebarRightActivePanel,
  setSidebarRightOpen,
} from "@/modules/settings/store";
import type { SidebarPanel } from "../StatusBar";
import { resolveResize, resolveToggle } from "./sidebarSlotLogic";

export type SidebarSide = "left" | "right";

export interface SidebarSlotState {
  ref: React.RefObject<PanelImperativeHandle | null>;
  activePanel: SidebarPanel;
  onResize: (size: { asPercentage: number }) => void;
}

export interface SidebarReturn {
  left: SidebarSlotState;
  right: SidebarSlotState;
  /** Toggle `panel` in the given slot (defaults to the slot the pre-dual-dock
   *  "sidebarPosition" preference points at, so existing callers that don't
   *  pass a side keep behaving exactly as before). */
  handlePanelToggle: (panel: SidebarPanel, side?: SidebarSide) => void;
  /** Open `panel` in its slot without toggling it closed if already open —
   *  used by command-palette/menu actions that mean "show me X", not "toggle X". */
  openPanel: (panel: SidebarPanel, side?: SidebarSide) => void;
  /** Move `panel` from one slot to the other (closes it in the old slot,
   *  opens it in the new one, displacing whatever was already there). */
  movePanel: (panel: SidebarPanel, fromSide: SidebarSide, toSide: SidebarSide) => void;
  /** Collapses/expands the primary (pre-dual-dock) slot — kept for the
   *  existing global "toggle sidebar" shortcut/menu item. */
  toggleSidebar: () => void;
}

type PersistablePanel = Exclude<SidebarPanel, null | "hosts">;

interface SlotOptions {
  storedOpen: boolean;
  storedPanel: PersistablePanel;
  persistOpen: (open: boolean) => Promise<void>;
  persistPanel: (panel: PersistablePanel) => Promise<void>;
  prefsHydrated: boolean;
  tabsLocation: "titlebar" | "sidebar";
}

interface Slot extends SidebarSlotState {
  toggle: (panel: SidebarPanel) => void;
  move: (panel: SidebarPanel) => void;
  collapse: () => void;
}

/** One dual-dock slot's full state machine (restore-from-prefs, persist,
 *  toggle, resize-sync). Both the left and right slot are just two instances
 *  of this, called unconditionally so hook order stays stable. */
function useSidebarSlot({
  storedOpen,
  storedPanel,
  persistOpen,
  persistPanel,
  prefsHydrated,
  tabsLocation,
}: SlotOptions): Slot {
  const ref = useRef<PanelImperativeHandle | null>(null);
  const [activePanel, setActivePanel] = useState<SidebarPanel>("explorer");
  const lastActivePanelRef = useRef<SidebarPanel>("explorer");
  const restoredRef = useRef(false);

  // One-time restore once preferences are loaded — guards the persist effect
  // below from firing during this init phase.
  useEffect(() => {
    if (!prefsHydrated || restoredRef.current) return;
    restoredRef.current = true;

    const resolvedPanel: SidebarPanel = !storedOpen
      ? null
      : storedPanel === "tabs" && tabsLocation !== "sidebar"
        ? "explorer"
        : storedPanel;

    setActivePanel(resolvedPanel);
    lastActivePanelRef.current = resolvedPanel ?? "explorer";

    const p = ref.current;
    if (p && !storedOpen) p.collapse();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefsHydrated]);

  // When tabs location changes away from sidebar, switch this slot away from "tabs".
  useEffect(() => {
    if (tabsLocation === "titlebar") {
      setActivePanel((prev) => {
        if (prev !== "tabs") return prev;
        lastActivePanelRef.current = "explorer";
        return "explorer";
      });
    }
  }, [tabsLocation]);

  // Persist whenever this slot's activePanel changes.
  useEffect(() => {
    if (!restoredRef.current) return;
    void persistOpen(activePanel !== null);
    if (activePanel && activePanel !== "hosts") {
      void persistPanel(activePanel);
    }
  }, [activePanel, persistOpen, persistPanel]);

  const toggle = useCallback(
    (panel: SidebarPanel) => {
      const p = ref.current;
      if (!p) return;
      const { nextPanel, action } = resolveToggle(activePanel, panel, p.getSize().asPercentage);
      if (panel) lastActivePanelRef.current = panel;
      if (action === "expand") p.expand();
      else if (action === "collapse") p.collapse();
      setActivePanel(nextPanel);
    },
    [activePanel],
  );

  const move = useCallback((panel: SidebarPanel) => {
    if (panel) lastActivePanelRef.current = panel;
    setActivePanel(panel);
    const p = ref.current;
    if (p && p.getSize().asPercentage <= 0) p.expand();
  }, []);

  const collapse = useCallback(() => {
    ref.current?.collapse();
    setActivePanel(null);
  }, []);

  const onResize = useCallback((size: { asPercentage: number }) => {
    setActivePanel((current) => {
      const { nextPanel } = resolveResize(size.asPercentage, current, lastActivePanelRef.current);
      if (nextPanel) lastActivePanelRef.current = nextPanel;
      return nextPanel;
    });
  }, []);

  return { ref, activePanel, onResize, toggle, move, collapse };
}

export function useSidebar(): SidebarReturn {
  const prefsHydrated = usePreferencesStore((s) => s.hydrated);
  const tabsLocation = usePreferencesStore((s) => s.tabsLocation);
  const sidebarPosition = usePreferencesStore((s) => s.sidebarPosition);
  const placements = usePreferencesStore((s) => s.barItemPlacements);
  const primaryStoredOpen = usePreferencesStore((s) => s.sidebarOpen);
  const primaryStoredPanel = usePreferencesStore((s) => s.sidebarActivePanel);
  const secondaryStoredOpen = usePreferencesStore((s) => s.sidebarRightOpen);
  const secondaryStoredPanel = usePreferencesStore((s) => s.sidebarRightActivePanel);

  // "primary" is the pre-existing single sidebar slot (persisted under the
  // old sidebarOpen/sidebarActivePanel keys), still following the
  // `sidebarPosition` preference for which screen side it renders on — this
  // keeps dual-dock a zero-visual-change addition for existing users.
  // "secondary" is the brand-new, independent slot, always the opposite
  // screen side, closed by default.
  const primary = useSidebarSlot({
    storedOpen: primaryStoredOpen,
    storedPanel: primaryStoredPanel,
    persistOpen: setSidebarOpen,
    persistPanel: setSidebarActivePanel,
    prefsHydrated,
    tabsLocation,
  });
  const secondary = useSidebarSlot({
    storedOpen: secondaryStoredOpen,
    storedPanel: secondaryStoredPanel,
    persistOpen: setSidebarRightOpen,
    persistPanel: setSidebarRightActivePanel,
    prefsHydrated,
    tabsLocation,
  });

  const left = sidebarPosition === "right" ? secondary : primary;
  const right = sidebarPosition === "right" ? primary : secondary;

  const slotForSide = useCallback((side: SidebarSide) => (side === "left" ? left : right), [left, right]);

  // Falls back through: explicit `side` argument (an actual button click,
  // which already knows its own placement) → the panel's own registered
  // side in the bar-item registry → the legacy global `sidebarPosition`.
  // Without the middle step, callers that don't know their own placement
  // (command palette, JumpHostDropdown's explorer fallback) would silently
  // ignore a panel's per-item side and always open on `sidebarPosition`.
  const resolveSide = useCallback(
    (panel: SidebarPanel, side?: SidebarSide): SidebarSide => {
      if (side) return side;
      const itemId = panel ? PANEL_TO_ITEM_ID[panel] : undefined;
      return (itemId && placements[itemId]?.side) || sidebarPosition;
    },
    [placements, sidebarPosition],
  );

  const handlePanelToggle = useCallback(
    (panel: SidebarPanel, side?: SidebarSide) => {
      slotForSide(resolveSide(panel, side)).toggle(panel);
    },
    [slotForSide, resolveSide],
  );

  const openPanel = useCallback(
    (panel: SidebarPanel, side?: SidebarSide) => {
      slotForSide(resolveSide(panel, side)).move(panel);
    },
    [slotForSide, resolveSide],
  );

  const movePanel = useCallback(
    (panel: SidebarPanel, fromSide: SidebarSide, toSide: SidebarSide) => {
      if (fromSide === toSide) return;
      slotForSide(fromSide).collapse();
      slotForSide(toSide).move(panel);
    },
    [slotForSide],
  );

  const toggleSidebar = useCallback(() => {
    const p = primary.ref.current;
    if (!p) return;
    if (p.getSize().asPercentage <= 0) p.expand();
    else p.collapse();
  }, [primary.ref]);

  return {
    left: { ref: left.ref, activePanel: left.activePanel, onResize: left.onResize },
    right: { ref: right.ref, activePanel: right.activePanel, onResize: right.onResize },
    handlePanelToggle,
    openPanel,
    movePanel,
    toggleSidebar,
  };
}
