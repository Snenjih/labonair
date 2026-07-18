import { describe, expect, it } from "vitest";
import { parentPath, sanitizeEntryName } from "./utils";

describe("parentPath", () => {
  it("returns the parent of a nested path", () => {
    expect(parentPath("/foo/bar/baz")).toBe("/foo/bar");
  });

  it("returns / for a single-level path", () => {
    expect(parentPath("/foo")).toBe("/");
  });

  it("returns / for root", () => {
    expect(parentPath("/")).toBe("/");
  });

  it("returns / for an empty string", () => {
    expect(parentPath("")).toBe("/");
  });

  it("handles trailing slash correctly", () => {
    expect(parentPath("/foo/bar/")).toBe("/foo");
  });

  it("handles a two-level path", () => {
    expect(parentPath("/home/user")).toBe("/home");
  });

  it("handles deeply nested path", () => {
    expect(parentPath("/a/b/c/d/e")).toBe("/a/b/c/d");
  });
});

describe("sanitizeEntryName", () => {
  it("trims and returns a valid name", () => {
    expect(sanitizeEntryName("  Spotify  ")).toBe("Spotify");
  });

  it("rejects an empty or whitespace-only name", () => {
    expect(sanitizeEntryName("")).toBeNull();
    expect(sanitizeEntryName("   ")).toBeNull();
  });

  it("rejects '.' and '..'", () => {
    expect(sanitizeEntryName(".")).toBeNull();
    expect(sanitizeEntryName("..")).toBeNull();
  });

  it("rejects a name containing a slash by default", () => {
    expect(sanitizeEntryName("a/b")).toBeNull();
  });

  it("allows a slash when allowNested is set", () => {
    expect(sanitizeEntryName("a/b/c", { allowNested: true })).toBe("a/b/c");
  });

  it("rejects a backslash even when allowNested is set", () => {
    expect(sanitizeEntryName("a\\b", { allowNested: true })).toBeNull();
  });
});
