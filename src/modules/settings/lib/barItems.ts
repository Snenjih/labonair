import type { Preferences } from "@/modules/settings/store";
import type { SidebarPanel } from "@/modules/statusbar";

export type BarId = "titlebar" | "statusbar";
export type BarSide = "left" | "right";

export interface BarItemPlacement {
  itemId: BarItemId;
  /** Which bar the trigger button itself renders in. Fully general for every
   *  item, including panel toggles — a panel's button can live in either bar
   *  just like a badge can. */
  bar: BarId;
  /** Which end of that bar the button sits at. For panel items, `side` is
   *  also what the dual-dock (see useSidebar/useBarPanelSync) uses to decide
   *  which sidebar slot the panel content opens into — independent of which
   *  bar its own toggle button happens to live in. */
  side: BarSide;
  /** Hides the trigger button. Never disables the underlying feature,
   *  keyboard shortcut, or command-palette command. */
  hidden: boolean;
  /** Per-item extension point — e.g. `{ surfaceMode: "panel" | "mini" }` for "ai". */
  extra?: Record<string, unknown>;
}

export type BarItemId =
  // Titlebar badges
  | "updater"
  | "notifications"
  | "jumpHosts"
  | "agentAccess"
  | "transfers"
  | "bookmarks"
  // Sidebar dock panel toggles
  | "explorerPanel"
  | "snippetsPanel"
  | "sourceControlPanel"
  | "tabsPanel"
  // Statusbar info
  | "cwdBreadcrumb"
  | "cursorPosition"
  | "previewUrl"
  // AI cluster (one entry, renders both the status pill and open/controls together)
  | "ai";

/** Groups items for divider placement: a divider only ever appears between
 *  two *different* categories, never between two items of the same one
 *  (e.g. never between two badges, even if they're adjacent in a bucket). */
export type BarItemCategory = "badge" | "panel" | "info" | "ai";

export const BAR_ITEM_CATEGORY: Record<BarItemId, BarItemCategory> = {
  updater: "badge",
  notifications: "badge",
  jumpHosts: "badge",
  agentAccess: "badge",
  transfers: "badge",
  bookmarks: "badge",
  explorerPanel: "panel",
  snippetsPanel: "panel",
  sourceControlPanel: "panel",
  tabsPanel: "panel",
  cwdBreadcrumb: "info",
  cursorPosition: "info",
  previewUrl: "info",
  ai: "ai",
};

/** Stable registration order — bucket iteration uses this, not object-key order. */
const BAR_ITEM_ORDER: BarItemId[] = [
  "updater",
  "notifications",
  "jumpHosts",
  "agentAccess",
  "transfers",
  "bookmarks",
  "explorerPanel",
  "snippetsPanel",
  "sourceControlPanel",
  "tabsPanel",
  "cwdBreadcrumb",
  "cursorPosition",
  "previewUrl",
  "ai",
];

export const PANEL_ITEM_TO_PANEL: Record<
  "explorerPanel" | "snippetsPanel" | "sourceControlPanel" | "tabsPanel",
  Exclude<SidebarPanel, null | "hosts">
> = {
  explorerPanel: "explorer",
  snippetsPanel: "snippets",
  sourceControlPanel: "source-control",
  tabsPanel: "tabs",
};

/** Reverse of `PANEL_ITEM_TO_PANEL` — looks up a panel's own `BarItemId` so
 *  its per-item registered `side` can be resolved without every caller of
 *  `useSidebar`'s `openPanel`/`handlePanelToggle` needing to know it. */
export const PANEL_TO_ITEM_ID: Partial<
  Record<Exclude<SidebarPanel, null>, keyof typeof PANEL_ITEM_TO_PANEL>
> = Object.fromEntries(
  Object.entries(PANEL_ITEM_TO_PANEL).map(([itemId, panel]) => [panel, itemId]),
) as Partial<Record<Exclude<SidebarPanel, null>, keyof typeof PANEL_ITEM_TO_PANEL>>;

function make(
  itemId: BarItemId,
  bar: BarId,
  side: BarSide,
  hidden: boolean,
  extra?: Record<string, unknown>,
): BarItemPlacement {
  return { itemId, bar, side, hidden, extra };
}

/** Fresh-install defaults — must reproduce today's pre-registry layout exactly. */
export const DEFAULT_BAR_ITEM_PLACEMENTS: Record<BarItemId, BarItemPlacement> = {
  updater: make("updater", "titlebar", "right", false),
  notifications: make("notifications", "titlebar", "right", false),
  jumpHosts: make("jumpHosts", "titlebar", "right", false),
  agentAccess: make("agentAccess", "titlebar", "right", false),
  transfers: make("transfers", "titlebar", "right", false),
  bookmarks: make("bookmarks", "titlebar", "right", false),
  explorerPanel: make("explorerPanel", "statusbar", "left", false),
  snippetsPanel: make("snippetsPanel", "statusbar", "left", false),
  sourceControlPanel: make("sourceControlPanel", "statusbar", "left", false),
  tabsPanel: make("tabsPanel", "statusbar", "left", false),
  cwdBreadcrumb: make("cwdBreadcrumb", "statusbar", "left", false),
  cursorPosition: make("cursorPosition", "statusbar", "right", false),
  previewUrl: make("previewUrl", "statusbar", "right", false),
  ai: make("ai", "statusbar", "right", false, { surfaceMode: "panel" }),
};

/**
 * Pure migration from the old scattered prefs (`sidebarPosition`,
 * `titlebarsIconsPosition`, the 7 `statusBarShowXXX` booleans +
 * `editorShowCursorPosition`) to the unified registry. Input is a snapshot
 * of the old preferences; output reproduces the exact pre-registry layout —
 * this is the single most important regression test in the whole rollout.
 */
export function migrateBarItemPlacements(
  old: Pick<
    Preferences,
    | "sidebarPosition"
    | "titlebarsIconsPosition"
    | "statusBarShowExplorerButton"
    | "statusBarShowSnippetsButton"
    | "statusBarShowSourceControlButton"
    | "statusBarShowTabsButton"
    | "statusBarShowCwdBreadcrumb"
    | "statusBarShowPreviewUrl"
    | "statusBarShowAiControls"
    | "editorShowCursorPosition"
  >,
): Record<BarItemId, BarItemPlacement> {
  const titlebarSide: BarSide = old.titlebarsIconsPosition === "left" ? "left" : "right";
  const panelSide: BarSide = old.sidebarPosition;

  return {
    updater: make("updater", "titlebar", titlebarSide, false),
    notifications: make("notifications", "titlebar", titlebarSide, false),
    jumpHosts: make("jumpHosts", "titlebar", titlebarSide, false),
    agentAccess: make("agentAccess", "titlebar", titlebarSide, false),
    transfers: make("transfers", "titlebar", titlebarSide, false),
    bookmarks: make("bookmarks", "titlebar", titlebarSide, false),
    explorerPanel: make("explorerPanel", "statusbar", panelSide, !old.statusBarShowExplorerButton),
    snippetsPanel: make("snippetsPanel", "statusbar", panelSide, !old.statusBarShowSnippetsButton),
    sourceControlPanel: make(
      "sourceControlPanel",
      "statusbar",
      panelSide,
      !old.statusBarShowSourceControlButton,
    ),
    tabsPanel: make("tabsPanel", "statusbar", panelSide, !old.statusBarShowTabsButton),
    cwdBreadcrumb: make("cwdBreadcrumb", "statusbar", "left", !old.statusBarShowCwdBreadcrumb),
    cursorPosition: make("cursorPosition", "statusbar", "right", !old.editorShowCursorPosition),
    previewUrl: make("previewUrl", "statusbar", "right", !old.statusBarShowPreviewUrl),
    ai: make("ai", "statusbar", "right", !old.statusBarShowAiControls, { surfaceMode: "panel" }),
  };
}

/** Visible items for a given (bar, side) bucket, in stable registration order. */
export function visibleItemsFor(
  placements: Record<BarItemId, BarItemPlacement>,
  bar: BarId,
  side: BarSide,
): BarItemId[] {
  return BAR_ITEM_ORDER.filter((id) => {
    const p = placements[id];
    return p && p.bar === bar && p.side === side && !p.hidden;
  });
}
