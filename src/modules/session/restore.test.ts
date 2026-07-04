import { describe, expect, it, vi } from "vitest";
import { makeLeaf } from "@/modules/tabs/types";
import { restoreSnapshot, type TabActions } from "./restore";
import type { SessionSnapshot, WorkspaceTabSnapshot } from "./types";

function workspaceSnap(id: string, title = "shell"): WorkspaceTabSnapshot {
  return {
    kind: "workspace",
    title,
    activePaneId: id,
    layout: makeLeaf(id),
    sessions: { [id]: { id, kind: "local", title } },
  };
}

function makeActions(overrides: Partial<TabActions> = {}): TabActions {
  let nextId = 1;
  return {
    setActiveId: vi.fn(),
    newTab: vi.fn(() => nextId++),
    newSshTab: vi.fn(() => nextId++),
    newQuickSshTab: vi.fn(() => nextId++),
    openFileTab: vi.fn(() => null),
    newPreviewTab: vi.fn(() => nextId++),
    openHomeTab: vi.fn(),
    newSftpTab: vi.fn(() => nextId++),
    updateSftpPaths: vi.fn(),
    splitPane: vi.fn(),
    setActivePaneId: vi.fn(),
    ...overrides,
  };
}

describe("restoreSnapshot cold-tab threading", () => {
  it("restores only the previously-active tab warm; every other workspace tab cold", async () => {
    const actions = makeActions();
    const snapshot: SessionSnapshot = {
      version: 1,
      savedAt: Date.now(),
      activeTabIndex: 1,
      tabs: [workspaceSnap("a"), workspaceSnap("b"), workspaceSnap("c")],
    };

    await restoreSnapshot(snapshot, actions);

    const calls = (actions.newTab as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls).toHaveLength(3);
    // newTab(cwd, initialCommand, sessionId, cold)
    expect(calls[0][3]).toBe(true); // index 0 !== activeTabIndex 1 -> cold
    expect(calls[1][3]).toBe(false); // index 1 === activeTabIndex -> warm
    expect(calls[2][3]).toBe(true); // index 2 !== activeTabIndex -> cold
  });

  it("activates the snapshotted active tab when it restores successfully", async () => {
    const actions = makeActions();
    const snapshot: SessionSnapshot = {
      version: 1,
      savedAt: Date.now(),
      activeTabIndex: 0,
      tabs: [workspaceSnap("a")],
    };

    await restoreSnapshot(snapshot, actions);

    expect(actions.setActiveId).toHaveBeenCalledWith(1);
  });

  it("falls back to the first successfully-restored tab if the active tab itself failed", async () => {
    // newTab returns null for the first call (simulating a failed restore),
    // then real ids for the rest.
    let call = 0;
    const actions = makeActions({
      newTab: vi.fn(() => (call++ === 0 ? (null as unknown as number) : 2)),
    });
    const snapshot: SessionSnapshot = {
      version: 1,
      savedAt: Date.now(),
      activeTabIndex: 0,
      tabs: [workspaceSnap("a"), workspaceSnap("b")],
    };

    await restoreSnapshot(snapshot, actions);

    // Without the fallback, setActiveId would never be called (activeTabIndex's
    // tab returned null) and nothing would ever warm under cold-gating.
    expect(actions.setActiveId).toHaveBeenCalledWith(2);
  });

  it("does not call setActiveId when every tab fails to restore", async () => {
    const actions = makeActions({ newTab: vi.fn(() => null as unknown as number) });
    const snapshot: SessionSnapshot = {
      version: 1,
      savedAt: Date.now(),
      activeTabIndex: 0,
      tabs: [workspaceSnap("a")],
    };

    await restoreSnapshot(snapshot, actions);

    expect(actions.setActiveId).not.toHaveBeenCalled();
  });
});
