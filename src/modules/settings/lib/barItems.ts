import type { Preferences } from "@/modules/settings/store";
import type { SidebarPanel } from "@/modules/statusbar";

export type BarId = "titlebar" | "statusbar" | "sidebar";
export type BarSide = "left" | "right";

export interface BarItemPlacement {
  itemId: BarItemId;
  /** For panel items (`bar: "sidebar"`), this is metadata only — the
   *  statusbar toggle button still renders in the statusbar; "sidebar" just
   *  marks that `side` means "which dock slot", not "which bar". */
  bar: BarId;
  /** For titlebar/statusbar items: which end of that bar. For sidebar panel
   *  items: which dual-dock slot (left/right) the panel opens into. */
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
  // Sidebar dock panels (side = which dock slot)
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
  explorerPanel: make("explorerPanel", "sidebar", "left", false),
  snippetsPanel: make("snippetsPanel", "sidebar", "left", false),
  sourceControlPanel: make("sourceControlPanel", "sidebar", "left", false),
  tabsPanel: make("tabsPanel", "sidebar", "left", false),
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
    explorerPanel: make("explorerPanel", "sidebar", panelSide, !old.statusBarShowExplorerButton),
    snippetsPanel: make("snippetsPanel", "sidebar", panelSide, !old.statusBarShowSnippetsButton),
    sourceControlPanel: make(
      "sourceControlPanel",
      "sidebar",
      panelSide,
      !old.statusBarShowSourceControlButton,
    ),
    tabsPanel: make("tabsPanel", "sidebar", panelSide, !old.statusBarShowTabsButton),
    cwdBreadcrumb: make("cwdBreadcrumb", "statusbar", "left", !old.statusBarShowCwdBreadcrumb),
    cursorPosition: make("cursorPosition", "statusbar", "right", !old.editorShowCursorPosition),
    previewUrl: make("previewUrl", "statusbar", "right", !old.statusBarShowPreviewUrl),
    ai: make("ai", "statusbar", "right", !old.statusBarShowAiControls, { surfaceMode: "panel" }),
  };
}

/**
 * Visible items for a given (bar, side) bucket, in stable registration order.
 * Sidebar panel items (`bar: "sidebar"`) always render their toggle button in
 * the statusbar — they have no titlebar variant — so querying the
 * "statusbar" bucket also matches them (their `side` still means "which
 * dock slot", doing double duty as "which half of the statusbar the toggle
 * button sits in").
 */
export function visibleItemsFor(
  placements: Record<BarItemId, BarItemPlacement>,
  bar: BarId,
  side: BarSide,
): BarItemId[] {
  return BAR_ITEM_ORDER.filter((id) => {
    const p = placements[id];
    if (!p || p.side !== side || p.hidden) return false;
    if (bar === "statusbar") return p.bar === "statusbar" || p.bar === "sidebar";
    return p.bar === bar;
  });
}
