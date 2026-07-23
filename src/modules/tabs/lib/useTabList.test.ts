import type { DragEndEvent } from "@dnd-kit/core";
import { describe, expect, it } from "vitest";
import { computeIsNewTab, isEditingStale, resolveDragReorder, shouldMiddleClickClose } from "./useTabList";
import type { Tab } from "../types";

function makeDragEndEvent(activeId: number, overId: number | null): DragEndEvent {
  return {
    active: { id: activeId },
    over: overId === null ? null : { id: overId },
  } as DragEndEvent;
}

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

describe("resolveDragReorder", () => {
  it("returns null when dropped outside any droppable (over is null)", () => {
    expect(resolveDragReorder(makeDragEndEvent(1, null))).toBeNull();
  });

  it("returns null when dropped on itself", () => {
    expect(resolveDragReorder(makeDragEndEvent(1, 1))).toBeNull();
  });

  it("returns the from/to ids on a real reorder", () => {
    expect(resolveDragReorder(makeDragEndEvent(1, 2))).toEqual({ from: 1, to: 2 });
  });
});

describe("computeIsNewTab", () => {
  it("is false on first render regardless of the seen set", () => {
    expect(computeIsNewTab(true, new Set(), 1)).toBe(false);
    expect(computeIsNewTab(true, new Set([1]), 1)).toBe(false);
  });

  it("is true for an unseen id after the first render", () => {
    expect(computeIsNewTab(false, new Set([1]), 2)).toBe(true);
  });

  it("is false for an already-seen id after the first render", () => {
    expect(computeIsNewTab(false, new Set([1, 2]), 2)).toBe(false);
  });
});
