import { describe, expect, it } from "vitest";
import { canDropInto } from "./useInternalDrop";

describe("canDropInto", () => {
  it("rejects dropping into the file's own parent (no-op)", () => {
    expect(canDropInto("/root/a/file.txt", "/root/a")).toBe(false);
  });

  it("rejects dropping a folder onto itself", () => {
    expect(canDropInto("/root/a", "/root/a")).toBe(false);
  });

  it("rejects dropping a folder into its own descendant", () => {
    expect(canDropInto("/root/a", "/root/a/b")).toBe(false);
  });

  it("allows dropping into an unrelated sibling folder", () => {
    expect(canDropInto("/root/a/file.txt", "/root/b")).toBe(true);
  });

  it("allows moving a folder up to its grandparent", () => {
    expect(canDropInto("/root/a/b", "/root")).toBe(true);
  });

  it("does not false-positive on a sibling with a shared name prefix", () => {
    // "/root/a-2" is not a descendant of "/root/a" even though it starts
    // with the same string — the trailing "/" in the check must guard this.
    expect(canDropInto("/root/a", "/root/a-2")).toBe(true);
  });
});
