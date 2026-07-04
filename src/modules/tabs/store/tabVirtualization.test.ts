import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceTab } from "../types";
import { useTabsStore } from "./tabsStore";
import { useTabVirtualizationStore } from "./tabVirtualization";

function makeWorkspaceTab(id: number): WorkspaceTab {
  const paneId = `pane-${id}`;
  return {
    id,
    kind: "workspace",
    title: "shell",
    activePaneId: paneId,
    layout: { type: "pane", id: paneId },
    sessions: { [paneId]: { id: paneId, kind: "local", title: "shell" } },
  };
}

// Each test uses its own numeric-id range so a stray timer left over from a
// previous test (the module's suspend-debounce timers are process-wide, not
// reset between tests) can never affect this test's assertions.
function resetStores(tabIds: number[], activeId: number): void {
  useTabsStore.setState({
    tabs: tabIds.map(makeWorkspaceTab),
    activeId,
    _nextId: Math.max(...tabIds) + 1,
  });
  useTabVirtualizationStore.setState({ suspendedTabIds: new Set(), recentTabIds: [] });
}

function cycleThrough(ids: number[]): void {
  for (const id of ids) useTabsStore.setState({ activeId: id });
}

describe("tabVirtualization", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("suspends a tab once it falls out of the LRU floor and past the debounce", () => {
    vi.useFakeTimers();
    resetStores([1, 2, 3, 4, 5, 6, 7], 1);
    cycleThrough([2, 3, 4, 5, 6, 7]);

    vi.advanceTimersByTime(15_000);

    expect(useTabVirtualizationStore.getState().suspendedTabIds.has(1)).toBe(true);
  });

  it("never suspends the 6 most-recently-active tabs regardless of idle time", () => {
    vi.useFakeTimers();
    resetStores([11, 12, 13, 14, 15, 16, 17], 11);
    cycleThrough([12, 13, 14, 15, 16, 17]);

    vi.advanceTimersByTime(15_000);

    for (const id of [12, 13, 14, 15, 16, 17]) {
      expect(useTabVirtualizationStore.getState().suspendedTabIds.has(id)).toBe(false);
    }
  });

  it("does not suspend before the debounce elapses", () => {
    vi.useFakeTimers();
    resetStores([21, 22], 21);
    cycleThrough([22]);

    vi.advanceTimersByTime(14_999);

    expect(useTabVirtualizationStore.getState().suspendedTabIds.has(21)).toBe(false);
  });

  it("cancels a pending suspend if the tab is reactivated before the debounce fires", () => {
    vi.useFakeTimers();
    resetStores([31, 32], 31);
    cycleThrough([32]);
    vi.advanceTimersByTime(5_000);
    cycleThrough([31]); // switch back well within the 15s debounce

    vi.advanceTimersByTime(20_000);

    expect(useTabVirtualizationStore.getState().suspendedTabIds.has(31)).toBe(false);
  });

  it("resumes (un-suspends) a tab instantly on reactivation, with no debounce", () => {
    vi.useFakeTimers();
    resetStores([41, 42, 43, 44, 45, 46, 47], 41);
    cycleThrough([42, 43, 44, 45, 46, 47]);
    vi.advanceTimersByTime(15_000);
    expect(useTabVirtualizationStore.getState().suspendedTabIds.has(41)).toBe(true);

    cycleThrough([41]);

    expect(useTabVirtualizationStore.getState().suspendedTabIds.has(41)).toBe(false);
  });
});
