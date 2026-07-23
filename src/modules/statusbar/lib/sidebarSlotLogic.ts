import type { SidebarPanel } from "../StatusBar";

export type ToggleAction = "expand" | "collapse" | "none";

export interface ToggleResult {
  nextPanel: SidebarPanel;
  action: ToggleAction;
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
    if (currentSizePct <= 0) {
      return { nextPanel: requestedPanel, action: "expand" };
    }
    return { nextPanel: null, action: "collapse" };
  }
  return {
    nextPanel: requestedPanel,
    action: currentSizePct <= 0 ? "expand" : "none",
  };
}

export interface ResizeResult {
  nextPanel: SidebarPanel;
}

/**
 * Pure decision logic for a slot's onResize callback — keeps `activePanel`
 * in sync when the user manually drags the resize handle (collapsing to 0%
 * clears the active panel; dragging back open restores the last-active one).
 */
export function resolveResize(
  sizePct: number,
  currentPanel: SidebarPanel,
  lastActivePanel: SidebarPanel,
): ResizeResult {
  if (sizePct <= 0) return { nextPanel: null };
  return { nextPanel: currentPanel ?? lastActivePanel ?? "explorer" };
}
