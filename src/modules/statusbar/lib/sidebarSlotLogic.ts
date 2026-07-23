import type { SidebarPanel } from "../StatusBar";

export type ToggleAction = "expand" | "collapse" | "none";

export interface ToggleResult {
  nextPanel: SidebarPanel;
  action: ToggleAction;
}

/**
 * Below this percentage, a panel counts as "collapsed" — not just `<= 0`.
 * `react-resizable-panels` reports size via a `ResizeObserver` on the
 * panel's real DOM element, and a supposedly-collapsed panel (`collapsedSize:
 * 0`) can still occasionally report a tiny nonzero width during layout
 * churn (window resize, a sibling panel's own resize/collapse, etc.) even
 * though nothing about *this* panel actually changed. `minSize` is 130px,
 * which is comfortably above 1% on any realistic window width, so treating
 * anything under this threshold as "still collapsed" can't misfire on a
 * genuine small-but-real open size.
 */
const COLLAPSED_THRESHOLD_PCT = 1;

function isCollapsed(sizePct: number): boolean {
  return sizePct < COLLAPSED_THRESHOLD_PCT;
}

/**
 * Pure decision logic behind a sidebar slot's toggle button: clicking the
 * already-active panel collapses it (or re-expands if it was dragged to 0%
 * without changing panel); clicking a different panel switches to it,
 * expanding the slot if it was collapsed. Factored out of the hook so it's
 * unit-testable without mounting React or a PanelImperativeHandle.
 */
export function resolveToggle(
  currentPanel: SidebarPanel,
  requestedPanel: SidebarPanel,
  currentSizePct: number,
): ToggleResult {
  if (currentPanel === requestedPanel) {
    if (isCollapsed(currentSizePct)) {
      return { nextPanel: requestedPanel, action: "expand" };
    }
    return { nextPanel: null, action: "collapse" };
  }
  return {
    nextPanel: requestedPanel,
    action: isCollapsed(currentSizePct) ? "expand" : "none",
  };
}

export interface ResizeResult {
  nextPanel: SidebarPanel;
}

/**
 * Pure decision logic for a slot's onResize callback — keeps `activePanel`
 * in sync when the user manually drags the resize handle (collapsing clears
 * the active panel; dragging back open restores the last-active one).
 *
 * Only ever restores `lastActivePanel` when this slot already has a real
 * `currentPanel` set (i.e. it was already logically open, just resized) or
 * was genuinely dragged open from a real collapsed state above the noise
 * threshold — see `isCollapsed` above for why `< 1%`, not `<= 0`, is the
 * right cutoff.
 */
export function resolveResize(
  sizePct: number,
  currentPanel: SidebarPanel,
  lastActivePanel: SidebarPanel,
): ResizeResult {
  if (isCollapsed(sizePct)) return { nextPanel: null };
  return { nextPanel: currentPanel ?? lastActivePanel ?? "explorer" };
}
