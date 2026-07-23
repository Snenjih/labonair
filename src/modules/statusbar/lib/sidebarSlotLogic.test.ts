import { describe, expect, it } from "vitest";
import { isCollapsed, resolveResize, resolveToggle } from "./sidebarSlotLogic";

describe("resolveToggle", () => {
  it("collapses when clicking the already-active, expanded panel", () => {
    expect(resolveToggle("explorer", "explorer", 20)).toEqual({ nextPanel: null, action: "collapse" });
  });

  it("re-expands when clicking the already-active panel while collapsed to 0%", () => {
    expect(resolveToggle("explorer", "explorer", 0)).toEqual({ nextPanel: "explorer", action: "expand" });
  });

  it("switches to a different panel and expands if the slot was collapsed", () => {
    expect(resolveToggle("explorer", "snippets", 0)).toEqual({ nextPanel: "snippets", action: "expand" });
  });

  it("switches to a different panel without re-expanding if already expanded", () => {
    expect(resolveToggle("explorer", "snippets", 20)).toEqual({ nextPanel: "snippets", action: "none" });
  });

  it("switches away from a null (closed) slot", () => {
    expect(resolveToggle(null, "source-control", 0)).toEqual({ nextPanel: "source-control", action: "expand" });
  });

  it("treats a sub-1% noise reading as still collapsed when toggling the same panel", () => {
    expect(resolveToggle("explorer", "explorer", 0.03)).toEqual({ nextPanel: "explorer", action: "expand" });
  });
});

describe("resolveResize", () => {
  it("clears the active panel when dragged to 0%", () => {
    expect(resolveResize(0, "explorer", "explorer")).toEqual({ nextPanel: null });
  });

  it("clears the active panel when dragged below 0%", () => {
    expect(resolveResize(-1, "explorer", "explorer")).toEqual({ nextPanel: null });
  });

  it("keeps the current panel when dragged open and a panel is already active", () => {
    expect(resolveResize(15, "snippets", "explorer")).toEqual({ nextPanel: "snippets" });
  });

  it("restores the last-active panel when dragged open from a closed (null) state", () => {
    expect(resolveResize(15, null, "source-control")).toEqual({ nextPanel: "source-control" });
  });

  it("falls back to explorer when dragged open with no prior panel at all", () => {
    expect(resolveResize(15, null, null)).toEqual({ nextPanel: "explorer" });
  });

  it("treats a sub-1% noise reading as still collapsed, not a genuine open (regression: spurious opens from ResizeObserver rounding)", () => {
    expect(resolveResize(0.03, null, "explorer")).toEqual({ nextPanel: null });
    expect(resolveResize(0.9, null, "explorer")).toEqual({ nextPanel: null });
  });

  it("still treats 1% and above as a genuine open", () => {
    expect(resolveResize(1, null, "explorer")).toEqual({ nextPanel: "explorer" });
  });
});

describe("isCollapsed", () => {
  it("treats 0% as collapsed", () => {
    expect(isCollapsed(0)).toBe(true);
  });

  it("treats a sub-1% noise reading as collapsed", () => {
    expect(isCollapsed(0.5)).toBe(true);
  });

  it("treats exactly 1% as not collapsed", () => {
    expect(isCollapsed(1)).toBe(false);
  });

  it("treats a genuine open size as not collapsed", () => {
    expect(isCollapsed(20)).toBe(false);
  });
});
