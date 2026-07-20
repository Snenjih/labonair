import { describe, expect, it } from "vitest";
import type { Host } from "@/modules/hosts";
import {
  bookmarkKey,
  computeAddBookmark,
  computeRemoveByPath,
  isBookmarkOrphaned,
  type PathBookmark,
} from "./pathBookmarksStore";

function bm(overrides: Partial<PathBookmark> = {}): PathBookmark {
  return { id: "id-1", path: "/var/www", ...overrides };
}

describe("bookmarkKey", () => {
  it("uses 'local' for an undefined hostId", () => {
    expect(bookmarkKey(undefined, "/foo")).toBe("local::/foo");
  });

  it("scopes the key by hostId", () => {
    expect(bookmarkKey("host-a", "/foo")).toBe("host-a::/foo");
    expect(bookmarkKey("host-a", "/foo")).not.toBe(bookmarkKey("host-b", "/foo"));
  });
});

describe("computeAddBookmark", () => {
  it("inserts a new bookmark when none exists for (hostId, path)", () => {
    const next = computeAddBookmark([], undefined, "/foo");
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({ path: "/foo", hostId: undefined });
  });

  it("does not create a duplicate for the same (hostId, path) pair", () => {
    const current = [bm({ hostId: "host-a", path: "/foo" })];
    const next = computeAddBookmark(current, "host-a", "/foo");
    expect(next).toBe(current); // no-op, same reference
  });

  it("treats the same path under different hosts as distinct entries", () => {
    const current = [bm({ hostId: "host-a", path: "/foo" })];
    const next = computeAddBookmark(current, "host-b", "/foo");
    expect(next).toHaveLength(2);
  });

  it("treats a local bookmark and a host bookmark at the same path as distinct", () => {
    const current = [bm({ hostId: undefined, path: "/foo" })];
    const next = computeAddBookmark(current, "host-a", "/foo");
    expect(next).toHaveLength(2);
  });

  it("updates the label of an existing entry when a new, different label is passed", () => {
    const current = [bm({ hostId: "host-a", path: "/foo", label: "old" })];
    const next = computeAddBookmark(current, "host-a", "/foo", "new");
    expect(next).toHaveLength(1);
    expect(next[0].label).toBe("new");
  });

  it("no-ops when the passed label matches the existing one", () => {
    const current = [bm({ hostId: "host-a", path: "/foo", label: "same" })];
    const next = computeAddBookmark(current, "host-a", "/foo", "same");
    expect(next).toBe(current);
  });
});

describe("computeRemoveByPath", () => {
  it("removes only the matching (hostId, path) entry", () => {
    const current = [
      bm({ id: "1", hostId: "host-a", path: "/foo" }),
      bm({ id: "2", hostId: "host-b", path: "/foo" }),
      bm({ id: "3", hostId: undefined, path: "/foo" }),
    ];
    const next = computeRemoveByPath(current, "host-a", "/foo");
    expect(next.map((b) => b.id)).toEqual(["2", "3"]);
  });

  it("is a safe no-op when nothing matches", () => {
    const current = [bm({ hostId: "host-a", path: "/foo" })];
    const next = computeRemoveByPath(current, "host-b", "/foo");
    expect(next).toHaveLength(1);
  });
});

describe("isBookmarkOrphaned", () => {
  const hosts: Host[] = [{ id: "host-a", name: "prod" } as Host];

  it("is never orphaned for a local bookmark", () => {
    expect(isBookmarkOrphaned(bm({ hostId: undefined }), hosts)).toBe(false);
  });

  it("is not orphaned when its host still exists", () => {
    expect(isBookmarkOrphaned(bm({ hostId: "host-a" }), hosts)).toBe(false);
  });

  it("is orphaned when its host no longer exists", () => {
    expect(isBookmarkOrphaned(bm({ hostId: "host-deleted" }), hosts)).toBe(true);
  });
});
