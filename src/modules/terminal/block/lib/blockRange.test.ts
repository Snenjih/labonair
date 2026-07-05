import { describe, expect, it } from "vitest";
import { blockIndexAt, computeRange } from "./blockRange";

describe("computeRange", () => {
  it("derives a range from two live markers", () => {
    const start = { line: 10, isDisposed: false };
    const end = { line: 15, isDisposed: false };
    expect(computeRange(start, end)).toEqual({ start: 10, end: 15 });
  });

  it("tracks markers after the buffer scrolls (eviction shifts lines down)", () => {
    // Simulates xterm re-indexing markers as old scrollback lines are trimmed.
    const start = { line: 10, isDisposed: false };
    const end = { line: 15, isDisposed: false };
    expect(computeRange(start, end)).toEqual({ start: 10, end: 15 });
    start.line = 4;
    end.line = 9;
    expect(computeRange(start, end)).toEqual({ start: 4, end: 9 });
  });

  it("returns null once either marker is disposed", () => {
    expect(computeRange({ line: 1, isDisposed: true }, { line: 2, isDisposed: false })).toBeNull();
    expect(computeRange({ line: 1, isDisposed: false }, { line: 2, isDisposed: true })).toBeNull();
  });

  it("returns null for an invalid (-1) line marker", () => {
    expect(computeRange({ line: -1, isDisposed: false }, { line: 5, isDisposed: false })).toBeNull();
  });

  it("never returns an inverted range", () => {
    expect(computeRange({ line: 10, isDisposed: false }, { line: 3, isDisposed: false })).toEqual({
      start: 10,
      end: 10,
    });
  });
});

describe("blockIndexAt", () => {
  it("finds the containing block by line", () => {
    const ranges = [
      { start: 0, end: 5 },
      { start: 6, end: 10 },
    ];
    expect(blockIndexAt(ranges, 7)).toBe(1);
    expect(blockIndexAt(ranges, 3)).toBe(0);
  });

  it("skips disposed (null) ranges", () => {
    const ranges = [null, { start: 6, end: 10 }];
    expect(blockIndexAt(ranges, 8)).toBe(1);
  });

  it("returns -1 when nothing matches", () => {
    expect(blockIndexAt([{ start: 0, end: 5 }], 20)).toBe(-1);
    expect(blockIndexAt([], 0)).toBe(-1);
  });

  it("resolves to the newest block on overlap", () => {
    const ranges = [
      { start: 0, end: 10 },
      { start: 5, end: 15 },
    ];
    expect(blockIndexAt(ranges, 7)).toBe(1);
  });
});
