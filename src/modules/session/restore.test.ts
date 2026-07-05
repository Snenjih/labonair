import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Host } from "@/modules/hosts";
import { useHostsStore } from "@/modules/hosts";
import { makeLeaf } from "@/modules/tabs/types";
import { restoreSnapshot, type TabActions } from "./restore";
import type {
  EditorTabSnapshot,
  HomeTabSnapshot,
  PreviewTabSnapshot,
  SessionSnapshot,
  SftpTabSnapshot,
  WorkspaceTabSnapshot,
} from "./types";

function workspaceSnap(id: string, title = "shell"): WorkspaceTabSnapshot {
  return {
    kind: "workspace",
    title,
    activePaneId: id,
    layout: makeLeaf(id),
    sessions: { [id]: { id, kind: "local", title } },
  };
}

function homeSnap(): HomeTabSnapshot {
  return { kind: "home" };
}

function previewSnap(url = "https://example.com"): PreviewTabSnapshot {
  return { kind: "preview", title: "preview", url };
}

function sftpSnap(hostId = "host-1"): SftpTabSnapshot {
  return { kind: "sftp", title: "prod", hostId };
}

function editorSnap(path = "/tmp/a.txt"): EditorTabSnapshot {
  return { kind: "editor", title: "a.txt", path, isRemote: false };
}

const HOST: Host = { id: "host-1", name: "prod", pin_to_top: false } as Host;

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

// openHomeTab/openFileTab/newPreviewTab/newSftpTab aren't cold-gated like
// newTab/newSshTab/newQuickSshTab — they used to steal `activeId`
// unconditionally the moment any home/editor/preview/sftp tab in the
// snapshot restored, even if it wasn't the snapshot's actual target. Restore
// now threads `!cold` through to each as `activate`, so only the snapshot's
// designated active tab activates.
describe("restoreSnapshot activate-threading for home/editor/preview/sftp", () => {
  beforeEach(() => {
    useHostsStore.setState({ hosts: [HOST] });
    vi.mocked(invoke).mockResolvedValue(true);
  });

  it("passes activate=false for a cold-restored home tab, true for the warm one", async () => {
    const actions = makeActions();
    const snapshot: SessionSnapshot = {
      version: 1,
      savedAt: Date.now(),
      activeTabIndex: 1,
      tabs: [homeSnap(), workspaceSnap("a")],
    };

    await restoreSnapshot(snapshot, actions);

    expect(actions.openHomeTab).toHaveBeenCalledWith(false);
  });

  it("passes activate=true for a warm-restored home tab", async () => {
    const actions = makeActions();
    const snapshot: SessionSnapshot = {
      version: 1,
      savedAt: Date.now(),
      activeTabIndex: 0,
      tabs: [homeSnap()],
    };

    await restoreSnapshot(snapshot, actions);

    expect(actions.openHomeTab).toHaveBeenCalledWith(true);
  });

  it("passes activate=false for a cold-restored preview tab", async () => {
    const actions = makeActions();
    const snapshot: SessionSnapshot = {
      version: 1,
      savedAt: Date.now(),
      activeTabIndex: 1,
      tabs: [previewSnap(), workspaceSnap("a")],
    };

    await restoreSnapshot(snapshot, actions);

    expect(actions.newPreviewTab).toHaveBeenCalledWith("https://example.com", undefined, false);
  });

  it("passes activate=false for a cold-restored editor tab", async () => {
    const actions = makeActions();
    const snapshot: SessionSnapshot = {
      version: 1,
      savedAt: Date.now(),
      activeTabIndex: 1,
      tabs: [editorSnap(), workspaceSnap("a")],
    };

    await restoreSnapshot(snapshot, actions);

    expect(actions.openFileTab).toHaveBeenCalledWith("/tmp/a.txt", false);
  });

  it("passes activate=false for a cold-restored sftp tab", async () => {
    const actions = makeActions();
    const snapshot: SessionSnapshot = {
      version: 1,
      savedAt: Date.now(),
      activeTabIndex: 1, // the workspace tab (index 1) is the target; sftp (index 0) is cold
      tabs: [sftpSnap(), workspaceSnap("a")],
    };

    await restoreSnapshot(snapshot, actions);

    expect(actions.newSftpTab).toHaveBeenCalledWith("host-1", "prod", false);
  });

  it("passes activate=true for a warm-restored sftp tab", async () => {
    const actions = makeActions();
    const snapshot: SessionSnapshot = {
      version: 1,
      savedAt: Date.now(),
      activeTabIndex: 0,
      tabs: [sftpSnap()],
    };

    await restoreSnapshot(snapshot, actions);

    expect(actions.newSftpTab).toHaveBeenCalledWith("host-1", "prod", true);
  });
});
