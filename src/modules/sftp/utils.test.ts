import { describe, expect, it } from "vitest";
import { parentPath } from "./utils";

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
