import { beforeEach, describe, expect, it } from "vitest";
import { selectScopesToEvict, shouldHydrateFromCache, useLocalExplorerStore } from "./useLocalExplorerStore";

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
