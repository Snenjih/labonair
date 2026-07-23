import { describe, expect, it } from "vitest";
import { DEFAULT_BAR_ITEM_PLACEMENTS, migrateBarItemPlacements, visibleItemsFor } from "./barItems";

const untouchedOldPrefs = {
  sidebarPosition: "left" as const,
  titlebarsIconsPosition: "auto" as const,
  statusBarShowExplorerButton: true,
  statusBarShowSnippetsButton: true,
  statusBarShowSourceControlButton: true,
  statusBarShowTabsButton: true,
  statusBarShowCwdBreadcrumb: true,
  statusBarShowPreviewUrl: true,
  statusBarShowAiControls: true,
  editorShowCursorPosition: true,
};

describe("migrateBarItemPlacements", () => {
  it("reproduces today's exact default layout when run against untouched defaults", () => {
    expect(migrateBarItemPlacements(untouchedOldPrefs)).toEqual(DEFAULT_BAR_ITEM_PLACEMENTS);
  });

  it("maps a customized sidebarPosition + titlebarsIconsPosition + hidden buttons correctly", () => {
    const result = migrateBarItemPlacements({
      ...untouchedOldPrefs,
      sidebarPosition: "right",
      titlebarsIconsPosition: "left",
      statusBarShowSnippetsButton: false,
      statusBarShowAiControls: false,
    });

    expect(result.updater.side).toBe("left");
    expect(result.explorerPanel.side).toBe("right");
    expect(result.snippetsPanel.hidden).toBe(true);
    expect(result.ai.hidden).toBe(true);
    expect(result.ai.extra).toEqual({ surfaceMode: "panel" });
    // Unrelated items stay at their defaults
    expect(result.explorerPanel.hidden).toBe(false);
    expect(result.cwdBreadcrumb.side).toBe("left");
  });

  it("maps 'auto' titlebarsIconsPosition to the right side, matching today's IS_MAC-independent default", () => {
    const result = migrateBarItemPlacements({ ...untouchedOldPrefs, titlebarsIconsPosition: "auto" });
    expect(result.updater.side).toBe("right");
  });

  it("is idempotent: running it twice against the same input produces the same output", () => {
    const first = migrateBarItemPlacements(untouchedOldPrefs);
    const second = migrateBarItemPlacements(untouchedOldPrefs);
    expect(second).toEqual(first);
  });
});

describe("visibleItemsFor", () => {
  it("returns an empty array for an empty bucket", () => {
    expect(visibleItemsFor(DEFAULT_BAR_ITEM_PLACEMENTS, "titlebar", "left")).toEqual([]);
  });

  it("returns items in stable registration order for a populated bucket", () => {
    const items = visibleItemsFor(DEFAULT_BAR_ITEM_PLACEMENTS, "titlebar", "right");
    expect(items).toEqual(["updater", "notifications", "jumpHosts", "agentAccess", "transfers", "bookmarks"]);
  });

  it("excludes hidden items from the bucket", () => {
    const placements = {
      ...DEFAULT_BAR_ITEM_PLACEMENTS,
      notifications: { ...DEFAULT_BAR_ITEM_PLACEMENTS.notifications, hidden: true },
    };
    const items = visibleItemsFor(placements, "titlebar", "right");
    expect(items).not.toContain("notifications");
    expect(items).toContain("updater");
  });

  it("includes sidebar panel items in the statusbar bucket (their toggle button always lives there)", () => {
    const items = visibleItemsFor(DEFAULT_BAR_ITEM_PLACEMENTS, "statusbar", "left");
    expect(items).toEqual(["explorerPanel", "snippetsPanel", "sourceControlPanel", "tabsPanel", "cwdBreadcrumb"]);
  });

  it("never includes sidebar panel items in the titlebar bucket", () => {
    const items = visibleItemsFor(DEFAULT_BAR_ITEM_PLACEMENTS, "titlebar", "left");
    expect(items).not.toContain("explorerPanel");
  });
});
