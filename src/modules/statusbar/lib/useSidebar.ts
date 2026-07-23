import { useCallback, useEffect, useRef, useState } from "react";
import type { PanelImperativeHandle } from "react-resizable-panels";
import { PANEL_TO_ITEM_ID } from "@/modules/settings/lib/barItems";
import { usePreferencesStore } from "@/modules/settings/preferences";
import {
  setSidebarActivePanel,
  setSidebarOpen,
  setSidebarRightActivePanel,
  setSidebarRightOpen,
  setSidebarRightWidth,
  setSidebarWidth,
} from "@/modules/settings/store";
import type { SidebarPanel } from "../StatusBar";
import { isCollapsed, resolveResize, resolveToggle } from "./sidebarSlotLogic";

export type SidebarSide = "left" | "right";

/** Debounce for persisting a slot's dragged width — avoids writing on every
 *  pointer-move tick of a drag (disk I/O + a round-trip back into
 *  usePreferencesStore via onPreferencesChange, which would re-render every
 *  subscriber on every tick). Group's onLayoutChanged already coalesces
 *  pointer-driven drags to a single fire on release, but an OS-level window
 *  resize still reflows (and fires onLayoutChanged) on every tick, so this
 *  debounce is still needed as a safety net. */
const WIDTH_PERSIST_DEBOUNCE_MS = 300;

export interface SidebarSlotState {
  ref: React.RefObject<PanelImperativeHandle | null>;
  activePanel: SidebarPanel;
  /** Width (px) to physically mount the panel at — see SidebarContent's
   *  defaultSize. A static mount-time guess, not reactive state; see
   *  useSidebarSlot for why. */
  width: number;
  onResize: (size: { asPercentage: number; inPixels: number }) => void;
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
  /** Wire to the main ResizablePanelGroup's onLayoutChanged — notifies both
   *  slots to (debounced-)persist their current width if open. */
  onLayoutChanged: () => void;
}

type PersistablePanel = Exclude<SidebarPanel, null | "hosts">;

interface SlotOptions {
  /** Starting `activePanel` before the async prefs restore lands — must
   *  match what `SidebarContent`'s `defaultSize` assumes for this slot
   *  (non-null → 225px, null → 0px), so the panel is physically born at the
   *  right width instead of relying on an imperative correction. Calling
   *  `.collapse()` on a panel immediately after mount (before the resizable
   *  panel group's first layout pass) is unreliable — see useSidebar.ts's
   *  restore effect for the follow-up correction this still needs for the
   *  case where persisted state disagrees with this initial guess. */
  initialPanel: SidebarPanel;
  storedOpen: boolean;
  storedPanel: PersistablePanel;
  persistOpen: (open: boolean) => Promise<void>;
  persistPanel: (panel: PersistablePanel) => Promise<void>;
  /** Mount-time width guess (px) — same role as `initialPanel`, but width
   *  doesn't affect the born-open-vs-closed bug `initialPanel` guards
   *  against, since a closed slot always mounts at "0px" regardless of
   *  width. Kept as a plain constant, not derived from `storedWidth`. */
  initialWidth: number;
  storedWidth: number;
  persistWidth: (width: number) => Promise<void>;
  prefsHydrated: boolean;
  tabsLocation: "titlebar" | "sidebar";
}

interface Slot extends SidebarSlotState {
  toggle: (panel: SidebarPanel) => void;
  move: (panel: SidebarPanel) => void;
  collapse: () => void;
  /** Re-opens the panel at its last known open width. Deliberately does NOT
   *  rely on the panel's own `.expand()` — react-resizable-panels only
   *  remembers a pre-collapse size (`expandToSize`) as a side effect of its
   *  own `.collapse()` being called, not when a slot is closed by dragging
   *  the separator all the way shut (a real, common interaction). `.resize()`
   *  applies a size unconditionally (still respecting min/max), so tracking
   *  the width ourselves and resizing to it here works regardless of how the
   *  slot got collapsed. */
  expand: () => void;
  /** Debounced width-persist trigger — call from the group's onLayoutChanged. */
  notifyLayoutSettled: () => void;
}

/** One dual-dock slot's full state machine (restore-from-prefs, persist,
 *  toggle, resize-sync). Both the left and right slot are just two instances
 *  of this, called unconditionally so hook order stays stable. */
function useSidebarSlot({
  initialPanel,
  storedOpen,
  storedPanel,
  persistOpen,
  persistPanel,
  initialWidth,
  storedWidth,
  persistWidth,
  prefsHydrated,
  tabsLocation,
}: SlotOptions): Slot {
  const ref = useRef<PanelImperativeHandle | null>(null);
  const [activePanel, setActivePanel] = useState<SidebarPanel>(initialPanel);
  const lastActivePanelRef = useRef<SidebarPanel>(initialPanel ?? "explorer");
  const restoredRef = useRef(false);
  const widthPersistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Our own record of "the width to reopen at", continuously kept fresh by
  // onResize while the slot is open — the single source of truth `expand()`
  // uses instead of the panel library's own (drag-collapse-fragile)
  // pre-collapse-size memory. See the `expand` doc comment below for why.
  const lastOpenWidthPxRef = useRef<number>(initialWidth);

  useEffect(() => {
    return () => {
      if (widthPersistTimerRef.current) clearTimeout(widthPersistTimerRef.current);
    };
  }, []);

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

    // Correct the physical panel size only when persisted state disagrees
    // with `initialPanel`'s guess — the common case (agreement) needs no
    // imperative call at all, since `SidebarContent`'s `defaultSize` already
    // matches. By now (post-hydration, not mount-synchronous) the panel
    // group has had a full layout pass, so collapse()/expand() are reliable.
    const p = ref.current;
    if (p) {
      if (!storedOpen) {
        p.collapse();
      } else {
        p.expand();
        if (storedWidth !== initialWidth) p.resize(storedWidth);
      }
    }
    // Seed our own "reopen at this width" record regardless of open/closed —
    // this is what `expand()` below actually uses, not the panel's own
    // .expand(), so it must be correct even for a slot that starts closed.
    lastOpenWidthPxRef.current = storedWidth;
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

  // See the `expand` doc comment on the `Slot` interface — deliberately
  // resizes to our own tracked width instead of calling the panel's
  // `.expand()`, which only reopens correctly if the slot was closed via
  // its own `.collapse()` (not e.g. by dragging the separator shut).
  const expand = useCallback(() => {
    const p = ref.current;
    if (!p) return;
    p.resize(lastOpenWidthPxRef.current || initialWidth);
  }, [initialWidth]);

  const toggle = useCallback(
    (panel: SidebarPanel) => {
      const p = ref.current;
      if (!p) return;
      const { nextPanel, action } = resolveToggle(activePanel, panel, p.getSize().asPercentage);
      if (panel) lastActivePanelRef.current = panel;
      if (action === "expand") expand();
      else if (action === "collapse") p.collapse();
      setActivePanel(nextPanel);
    },
    [activePanel, expand],
  );

  const move = useCallback(
    (panel: SidebarPanel) => {
      if (panel) lastActivePanelRef.current = panel;
      setActivePanel(panel);
      const p = ref.current;
      if (p && p.getSize().asPercentage <= 0) expand();
    },
    [expand],
  );

  const collapse = useCallback(() => {
    ref.current?.collapse();
    setActivePanel(null);
  }, []);

  const onResize = useCallback((size: { asPercentage: number; inPixels: number }) => {
    // Ignore resize events reported before the one-time prefs restore has
    // run — react-resizable-panels' ResizeObserver reports the panel's
    // initial physical layout on mount, which can still be nonzero for a
    // slot the restore is about to (or just did) collapse imperatively.
    // Treating that report as a real drag would "heal" activePanel back
    // open even though the slot is supposed to be closed. Real user drags
    // only ever happen after mount, well after restoredRef is set.
    if (!restoredRef.current) return;
    // Keep our own "last open width" fresh on every real (open) resize tick
    // — this is what `expand()` restores to, independent of the prefs
    // debounce/persistence below and independent of the panel library's own
    // (drag-collapse-fragile) pre-collapse-size memory.
    if (!isCollapsed(size.asPercentage)) {
      lastOpenWidthPxRef.current = size.inPixels;
    }
    setActivePanel((current) => {
      const { nextPanel } = resolveResize(size.asPercentage, current, lastActivePanelRef.current);
      if (nextPanel) lastActivePanelRef.current = nextPanel;
      return nextPanel;
    });
  }, []);

  const notifyLayoutSettled = useCallback(() => {
    // Same gate as the persist-on-activePanel-change effect above — don't
    // write anything before the one-time restore has landed.
    if (!restoredRef.current) return;
    if (widthPersistTimerRef.current) clearTimeout(widthPersistTimerRef.current);
    widthPersistTimerRef.current = setTimeout(() => {
      widthPersistTimerRef.current = null;
      const p = ref.current;
      if (!p) return;
      // Re-read fresh at fire time, not at schedule time — if several
      // layout-changed events land inside the debounce window (e.g. an OS
      // window-resize drag), only the final size is ever persisted, and if
      // the slot got collapsed before the timer fired, this bails out
      // instead of persisting a near-zero width.
      const { asPercentage, inPixels } = p.getSize();
      if (isCollapsed(asPercentage)) return;
      void persistWidth(Math.round(inPixels));
    }, WIDTH_PERSIST_DEBOUNCE_MS);
  }, [persistWidth]);

  return { ref, activePanel, width: initialWidth, onResize, toggle, move, collapse, expand, notifyLayoutSettled };
}

export function useSidebar(): SidebarReturn {
  const prefsHydrated = usePreferencesStore((s) => s.hydrated);
  const tabsLocation = usePreferencesStore((s) => s.tabsLocation);
  const sidebarPosition = usePreferencesStore((s) => s.sidebarPosition);
  const placements = usePreferencesStore((s) => s.barItemPlacements);
  const primaryStoredOpen = usePreferencesStore((s) => s.sidebarOpen);
  const primaryStoredPanel = usePreferencesStore((s) => s.sidebarActivePanel);
  const primaryStoredWidth = usePreferencesStore((s) => s.sidebarWidth);
  const secondaryStoredOpen = usePreferencesStore((s) => s.sidebarRightOpen);
  const secondaryStoredPanel = usePreferencesStore((s) => s.sidebarRightActivePanel);
  const secondaryStoredWidth = usePreferencesStore((s) => s.sidebarRightWidth);

  // "primary" is the pre-existing single sidebar slot (persisted under the
  // old sidebarOpen/sidebarActivePanel keys), still following the
  // `sidebarPosition` preference for which screen side it renders on — this
  // keeps dual-dock a zero-visual-change addition for existing users.
  // "secondary" is the brand-new, independent slot, always the opposite
  // screen side, closed by default.
  //
  // Width is bound to primary/secondary here too, not to left/right (which
  // are only derived below from sidebarPosition) — so flipping
  // sidebarPosition carries each slot's width along with it to its new
  // screen side instead of the two slots swapping widths.
  const primary = useSidebarSlot({
    initialPanel: "explorer",
    storedOpen: primaryStoredOpen,
    storedPanel: primaryStoredPanel,
    persistOpen: setSidebarOpen,
    persistPanel: setSidebarActivePanel,
    initialWidth: 225,
    storedWidth: primaryStoredWidth,
    persistWidth: setSidebarWidth,
    prefsHydrated,
    tabsLocation,
  });
  const secondary = useSidebarSlot({
    initialPanel: null,
    storedOpen: secondaryStoredOpen,
    storedPanel: secondaryStoredPanel,
    persistOpen: setSidebarRightOpen,
    persistPanel: setSidebarRightActivePanel,
    initialWidth: 225,
    storedWidth: secondaryStoredWidth,
    persistWidth: setSidebarRightWidth,
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
    if (p.getSize().asPercentage <= 0) primary.expand();
    else p.collapse();
  }, [primary]);

  const onLayoutChanged = useCallback(() => {
    primary.notifyLayoutSettled();
    secondary.notifyLayoutSettled();
  }, [primary, secondary]);

  return {
    left: { ref: left.ref, activePanel: left.activePanel, width: left.width, onResize: left.onResize },
    right: { ref: right.ref, activePanel: right.activePanel, width: right.width, onResize: right.onResize },
    handlePanelToggle,
    openPanel,
    movePanel,
    toggleSidebar,
    onLayoutChanged,
  };
}
