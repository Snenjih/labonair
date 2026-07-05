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

// `activate` on openHomeTab/openFileTab/newPreviewTab/newSftpTab mirrors the
// `cold` mechanism above for the four tab types that aren't workspace tabs —
// used only by session restore so it doesn't hijack `activeId` away from the
// snapshot's actual target tab mid-restore (see restore.test.ts). Every
// other caller keeps calling these with no extra argument, so they must keep
// activating by default.
describe("activate param on openHomeTab/openFileTab/newPreviewTab/newSftpTab", () => {
  beforeEach(() => {
    useTabsStore.setState({ tabs: [], activeId: -1, _nextId: 1 });
  });

  it("openHomeTab() defaults to activating the newly created home tab", () => {
    useTabsStore.getState().openHomeTab();
    const homeTab = useTabsStore.getState().tabs.find((t) => t.kind === "home");
    expect(useTabsStore.getState().activeId).toBe(homeTab?.id);
  });

  it("openHomeTab(false) creates the tab without stealing activeId", () => {
    const firstId = useTabsStore.getState().newTab();
    useTabsStore.getState().openHomeTab(false);
    expect(useTabsStore.getState().activeId).toBe(firstId);
    expect(useTabsStore.getState().tabs.some((t) => t.kind === "home")).toBe(true);
  });

  it("openHomeTab(false) does not activate an already-existing home tab either", () => {
    useTabsStore.getState().openHomeTab();
    const otherId = useTabsStore.getState().newTab();
    useTabsStore.getState().openHomeTab(false);
    expect(useTabsStore.getState().activeId).toBe(otherId);
  });

  it("openFileTab defaults to activating", () => {
    useTabsStore.getState().newTab();
    const fileId = useTabsStore.getState().openFileTab("/tmp/a.txt");
    expect(useTabsStore.getState().activeId).toBe(fileId);
  });

  it("openFileTab(path, false) creates the tab without stealing activeId", () => {
    const firstId = useTabsStore.getState().newTab();
    const fileId = useTabsStore.getState().openFileTab("/tmp/a.txt", false);
    expect(useTabsStore.getState().activeId).toBe(firstId);
    expect(fileId).not.toBeNull();
  });

  it("openFileTab(path, false) does not activate an already-open editor tab either", () => {
    const path = "/tmp/a.txt";
    useTabsStore.getState().openFileTab(path);
    const otherId = useTabsStore.getState().newTab();
    useTabsStore.getState().openFileTab(path, false);
    expect(useTabsStore.getState().activeId).toBe(otherId);
  });

  it("newPreviewTab(url, title, false) does not steal activeId", () => {
    const firstId = useTabsStore.getState().newTab();
    useTabsStore.getState().newPreviewTab("https://example.com", undefined, false);
    expect(useTabsStore.getState().activeId).toBe(firstId);
  });

  it("newPreviewTab defaults to activating", () => {
    useTabsStore.getState().newTab();
    const previewId = useTabsStore.getState().newPreviewTab("https://example.com");
    expect(useTabsStore.getState().activeId).toBe(previewId);
  });

  it("newSftpTab(hostId, title, false) does not steal activeId", () => {
    const firstId = useTabsStore.getState().newTab();
    useTabsStore.getState().newSftpTab("host-1", "prod", false);
    expect(useTabsStore.getState().activeId).toBe(firstId);
  });

  it("newSftpTab defaults to activating", () => {
    useTabsStore.getState().newTab();
    const sftpId = useTabsStore.getState().newSftpTab("host-1", "prod");
    expect(useTabsStore.getState().activeId).toBe(sftpId);
  });
});
