import { beforeEach, describe, expect, it } from "vitest";
import type { WorkspaceTab } from "../types";
import { useTabsStore } from "./tabsStore";

function workspaceTabs(): WorkspaceTab[] {
  return useTabsStore.getState().tabs.filter((t): t is WorkspaceTab => t.kind === "workspace");
}

describe("tabsStore cold-tab support", () => {
  beforeEach(() => {
    useTabsStore.setState({ tabs: [], activeId: -1, _nextId: 1 });
  });

  it("newTab defaults to not cold and becomes active", () => {
    const id = useTabsStore.getState().newTab();
    expect(useTabsStore.getState().activeId).toBe(id);
    const tab = workspaceTabs().find((t) => t.id === id);
    expect(tab?.cold).toBe(false);
  });

  it("newTab(..., true) creates a cold tab and does not steal activeId", () => {
    const firstId = useTabsStore.getState().newTab();
    const coldId = useTabsStore.getState().newTab(undefined, undefined, undefined, true);

    const coldTab = workspaceTabs().find((t) => t.id === coldId);
    expect(coldTab?.cold).toBe(true);
    // activeId must stay on the previously-active tab, not the cold one —
    // otherwise activeId would point at a tab WorkspaceStack never mounts.
    expect(useTabsStore.getState().activeId).toBe(firstId);
  });

  it("newSshTab(..., true) creates a cold tab and does not steal activeId", () => {
    const firstId = useTabsStore.getState().newTab();
    const coldId = useTabsStore
      .getState()
      .newSshTab("host-1", "ssh title", undefined, undefined, undefined, true);

    const coldTab = workspaceTabs().find((t) => t.id === coldId);
    expect(coldTab?.cold).toBe(true);
    expect(useTabsStore.getState().activeId).toBe(firstId);
  });

  it("newQuickSshTab(..., true) creates a cold tab and does not steal activeId", () => {
    const firstId = useTabsStore.getState().newTab();
    const coldId = useTabsStore.getState().newQuickSshTab("user", "host", 22, undefined, true);

    const coldTab = workspaceTabs().find((t) => t.id === coldId);
    expect(coldTab?.cold).toBe(true);
    expect(useTabsStore.getState().activeId).toBe(firstId);
  });

  it("setActiveId clears cold on activation — the sole wake point", () => {
    const coldId = useTabsStore.getState().newTab(undefined, undefined, undefined, true);
    expect(workspaceTabs().find((t) => t.id === coldId)?.cold).toBe(true);

    useTabsStore.getState().setActiveId(coldId);

    expect(useTabsStore.getState().activeId).toBe(coldId);
    expect(workspaceTabs().find((t) => t.id === coldId)?.cold).toBe(false);
  });

  it("setActiveId is a no-op on cold state for a tab that isn't cold", () => {
    const id = useTabsStore.getState().newTab();
    useTabsStore.getState().setActiveId(id);
    expect(workspaceTabs().find((t) => t.id === id)?.cold).toBe(false);
  });

  it("setActiveId only touches the targeted tab's cold flag, not other cold tabs", () => {
    const coldA = useTabsStore.getState().newTab(undefined, undefined, undefined, true);
    const coldB = useTabsStore.getState().newTab(undefined, undefined, undefined, true);

    useTabsStore.getState().setActiveId(coldA);

    expect(workspaceTabs().find((t) => t.id === coldA)?.cold).toBe(false);
    expect(workspaceTabs().find((t) => t.id === coldB)?.cold).toBe(true);
  });
});
