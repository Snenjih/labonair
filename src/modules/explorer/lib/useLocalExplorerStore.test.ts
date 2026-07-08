import { beforeEach, describe, expect, it } from "vitest";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { useTabsStore } from "@/modules/tabs/store/tabsStore";
import type { Tab } from "@/modules/tabs/types";
import {
  openRemoteScopeKeys,
  selectScopesToEvict,
  shouldHydrateFromCache,
  useLocalExplorerStore,
} from "./useLocalExplorerStore";

function scope(scopeKey: string, lastAccessedAt: number) {
  return { scopeKey, lastAccessedAt };
}

describe("selectScopesToEvict", () => {
  it("returns nothing when under the cap", () => {
    const entries = [scope("ssh:a", 1), scope("ssh:b", 2)];
    expect(selectScopesToEvict(entries, 3)).toEqual([]);
  });

  it("returns nothing when exactly at the cap", () => {
    const entries = [scope("ssh:a", 1), scope("ssh:b", 2), scope("ssh:c", 3)];
    expect(selectScopesToEvict(entries, 3)).toEqual([]);
  });

  it("evicts the oldest-accessed scope first when over the cap", () => {
    const entries = [scope("ssh:newest", 30), scope("ssh:oldest", 10), scope("ssh:middle", 20)];
    expect(selectScopesToEvict(entries, 2)).toEqual(["ssh:oldest"]);
  });

  it("evicts multiple scopes when far over the cap", () => {
    const entries = [scope("ssh:d", 4), scope("ssh:a", 1), scope("ssh:c", 3), scope("ssh:b", 2)];
    expect(selectScopesToEvict(entries, 1)).toEqual(["ssh:a", "ssh:b", "ssh:c"]);
  });

  it("returns an empty list for no entries", () => {
    expect(selectScopesToEvict([], 3)).toEqual([]);
  });

  it("evicts an unprotected scope before an older protected one", () => {
    const entries = [scope("ssh:protected-old", 10), scope("ssh:unprotected-new", 20)];
    const protectedKeys = new Set(["ssh:protected-old"]);
    expect(selectScopesToEvict(entries, 1, protectedKeys)).toEqual(["ssh:unprotected-new"]);
  });

  it("only spills into protected scopes once every unprotected one is already evicted", () => {
    const entries = [scope("ssh:protected-a", 5), scope("ssh:protected-b", 10), scope("ssh:unprotected", 20)];
    const protectedKeys = new Set(["ssh:protected-a", "ssh:protected-b"]);
    // Cap of 1 needs to evict 2 — the unprotected one, then the oldest protected one.
    expect(selectScopesToEvict(entries, 1, protectedKeys)).toEqual(["ssh:unprotected", "ssh:protected-a"]);
  });

  it("evicts nothing when every entry is protected and within the cap", () => {
    const entries = [scope("ssh:a", 1), scope("ssh:b", 2)];
    const protectedKeys = new Set(["ssh:a", "ssh:b"]);
    expect(selectScopesToEvict(entries, 2, protectedKeys)).toEqual([]);
  });
});

describe("openRemoteScopeKeys", () => {
  it("collects a distinct ssh:<hostId> key per remote-referencing tab kind", () => {
    const tabs: Tab[] = [
      { id: 1, kind: "sftp", title: "sftp", hostId: "host-a" },
      {
        id: 2,
        kind: "workspace",
        title: "ws",
        activePaneId: "p1",
        layout: { type: "pane", id: "p1" },
        sessions: {
          p1: { id: "p1", kind: "ssh", title: "ssh", hostId: "host-b" },
        },
      },
      { id: 3, kind: "editor", title: "file.txt", path: "/tmp/file.txt", dirty: false, remoteHostId: "host-c" },
      { id: 4, kind: "preview", title: "preview", url: "http://x", remoteHostId: "host-d" },
    ];
    expect(openRemoteScopeKeys(tabs)).toEqual(new Set(["ssh:host-a", "ssh:host-b", "ssh:host-c", "ssh:host-d"]));
  });

  it("ignores local sessions and unpinned editor/preview tabs", () => {
    const tabs: Tab[] = [
      {
        id: 1,
        kind: "workspace",
        title: "ws",
        activePaneId: "p1",
        layout: { type: "pane", id: "p1" },
        sessions: { p1: { id: "p1", kind: "local", title: "local" } },
      },
      { id: 2, kind: "editor", title: "file.txt", path: "/tmp/file.txt", dirty: false },
      { id: 3, kind: "home", title: "Home" },
    ];
    expect(openRemoteScopeKeys(tabs)).toEqual(new Set());
  });

  it("collapses multiple tabs against the same host into one key", () => {
    const tabs: Tab[] = [
      { id: 1, kind: "sftp", title: "sftp", hostId: "host-a" },
      {
        id: 2,
        kind: "workspace",
        title: "ws",
        activePaneId: "p1",
        layout: { type: "pane", id: "p1" },
        sessions: { p1: { id: "p1", kind: "ssh", title: "ssh", hostId: "host-a" } },
      },
    ];
    expect(openRemoteScopeKeys(tabs)).toEqual(new Set(["ssh:host-a"]));
  });
});

describe("shouldHydrateFromCache", () => {
  const snapshot = { rootPath: "/home/user", nodes: {}, expanded: new Set<string>(), lastAccessedAt: 1 };

  it("returns false when no cached snapshot exists", () => {
    expect(shouldHydrateFromCache(undefined, "/home/user")).toBe(false);
  });

  it("returns false when the requested root path is null", () => {
    expect(shouldHydrateFromCache(snapshot, null)).toBe(false);
  });

  it("returns false when the cached root path differs from the requested one", () => {
    // e.g. the SSH terminal's cwd changed since this host was last browsed.
    expect(shouldHydrateFromCache(snapshot, "/home/user/projects")).toBe(false);
  });

  it("returns true when the cached root path exactly matches the requested one", () => {
    expect(shouldHydrateFromCache(snapshot, "/home/user")).toBe(true);
  });
});

// Characterization tests for `setScope`'s current behavior — `useFileTree`'s
// generation-drop retry (`shouldRetryDroppedFetch`) depends on both of these
// holding: every scope/root change bumps `generation` (even a round-trip back
// to an already-seen root), and a non-cache-hit change wipes `nodes`
// entirely. Not a behavior change; guards against `setScope` being "fixed"
// later without re-checking the retry logic that relies on it.
describe("setScope", () => {
  beforeEach(() => {
    useLocalExplorerStore.setState({
      scopeKey: "local",
      rootPath: null,
      nodes: {},
      expanded: new Set(),
      generation: 0,
      remoteScopeCache: {},
    });
  });

  it("bumps generation on every call, even when returning to a previously seen root", () => {
    const { setScope } = useLocalExplorerStore.getState();
    setScope("local", "/home/user");
    expect(useLocalExplorerStore.getState().generation).toBe(1);
    setScope("local", "/home/user/projects");
    expect(useLocalExplorerStore.getState().generation).toBe(2);
    setScope("local", "/home/user");
    expect(useLocalExplorerStore.getState().generation).toBe(3);
  });

  it("clears nodes entirely on a non-cache-hit scope change (local scopes are never cached)", () => {
    const { setScope, setNode } = useLocalExplorerStore.getState();
    setScope("local", "/home/user");
    setNode("/home/user", { status: "loaded", entries: [], hasMore: false });
    expect(useLocalExplorerStore.getState().nodes["/home/user"]).toBeDefined();

    setScope("local", "/home/user/projects");
    expect(useLocalExplorerStore.getState().nodes).toEqual({});
  });
});

function sftpTab(id: number, hostId: string): Tab {
  return { id, kind: "sftp", title: hostId, hostId };
}

describe("setScope — tab-aware cache floor", () => {
  beforeEach(() => {
    useLocalExplorerStore.setState({
      scopeKey: "local",
      rootPath: null,
      nodes: {},
      expanded: new Set(),
      generation: 0,
      remoteScopeCache: {},
    });
    useTabsStore.setState({ tabs: [], activeId: -1 });
    usePreferencesStore.setState({ explorerMaxCachedRemoteScopes: 2 });
  });

  it("never evicts a scope with a currently open tab, even past the configured cap", () => {
    useTabsStore.setState({
      tabs: [sftpTab(1, "host-a"), sftpTab(2, "host-b"), sftpTab(3, "host-c")],
    });
    const { setScope, setNode } = useLocalExplorerStore.getState();

    setScope("ssh:host-a", "/root-a");
    setNode("/root-a", { status: "loaded", entries: [], hasMore: false });
    setScope("ssh:host-b", "/root-b");
    setNode("/root-b", { status: "loaded", entries: [], hasMore: false });
    setScope("ssh:host-c", "/root-c");
    setNode("/root-c", { status: "loaded", entries: [], hasMore: false });
    // Leaving host-c snapshots it too — cap (2) would normally evict down to
    // 2, but all three hosts still have an open tab, so nothing is evicted.
    setScope("ssh:host-d", "/root-d");

    const cache = useLocalExplorerStore.getState().remoteScopeCache;
    expect(Object.keys(cache).sort()).toEqual(["ssh:host-a", "ssh:host-b", "ssh:host-c"]);
  });

  it("resumes evicting a scope once its tab is closed", () => {
    useTabsStore.setState({
      tabs: [sftpTab(1, "host-a"), sftpTab(2, "host-b"), sftpTab(3, "host-c")],
    });
    const { setScope, setNode } = useLocalExplorerStore.getState();

    setScope("ssh:host-a", "/root-a");
    setNode("/root-a", { status: "loaded", entries: [], hasMore: false });
    setScope("ssh:host-b", "/root-b");
    setNode("/root-b", { status: "loaded", entries: [], hasMore: false });
    setScope("ssh:host-c", "/root-c");
    setNode("/root-c", { status: "loaded", entries: [], hasMore: false });
    setScope("ssh:host-d", "/root-d");
    expect(Object.keys(useLocalExplorerStore.getState().remoteScopeCache).sort()).toEqual([
      "ssh:host-a",
      "ssh:host-b",
      "ssh:host-c",
    ]);

    // host-a's tab closes — only host-b/host-c remain protected. Leaving
    // host-d snapshots it (cache now has a, b, c, d — 4 entries) against a
    // cap of max(2, 2)=2, so the two unprotected ones (a, the oldest; d, the
    // newest) are evicted, leaving exactly the still-open b/c.
    useTabsStore.setState({ tabs: [sftpTab(2, "host-b"), sftpTab(3, "host-c")] });
    setScope("ssh:host-e", "/root-e");

    expect(Object.keys(useLocalExplorerStore.getState().remoteScopeCache).sort()).toEqual([
      "ssh:host-b",
      "ssh:host-c",
    ]);
  });
});
