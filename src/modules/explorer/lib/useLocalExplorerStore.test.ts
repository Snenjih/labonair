import { describe, expect, it } from "vitest";
import { selectScopesToEvict, shouldHydrateFromCache } from "./useLocalExplorerStore";

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
