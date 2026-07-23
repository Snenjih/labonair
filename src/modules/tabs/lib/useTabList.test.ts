import { describe, expect, it } from "vitest";
import { isEditingStale, shouldMiddleClickClose } from "./useTabList";
import type { Tab } from "../types";

function makeTab(id: number, kind: Tab["kind"] = "home"): Tab {
  return { id, kind } as Tab;
}

describe("isEditingStale", () => {
  it("is false when editingId is null", () => {
    expect(isEditingStale([makeTab(1)], null)).toBe(false);
  });

  it("is false when the editing tab still exists", () => {
    expect(isEditingStale([makeTab(1), makeTab(2)], 2)).toBe(false);
  });

  it("is true when the editing tab no longer exists", () => {
    expect(isEditingStale([makeTab(1)], 2)).toBe(true);
  });

  it("is true when the tab list is empty", () => {
    expect(isEditingStale([], 1)).toBe(true);
  });
});

describe("shouldMiddleClickClose", () => {
  it("closes on middle-click (button 1) when there's more than one tab and it's not home", () => {
    expect(shouldMiddleClickClose(1, 2, "editor")).toBe(true);
  });

  it("does not close on left-click (button 0)", () => {
    expect(shouldMiddleClickClose(0, 2, "editor")).toBe(false);
  });

  it("does not close the last remaining tab", () => {
    expect(shouldMiddleClickClose(1, 1, "editor")).toBe(false);
  });

  it("never closes the home tab, even with other tabs open", () => {
    expect(shouldMiddleClickClose(1, 3, "home")).toBe(false);
  });
});
