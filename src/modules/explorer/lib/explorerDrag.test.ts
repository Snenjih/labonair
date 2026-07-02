import { beforeEach, describe, expect, it } from "vitest";
import { explorerDrag } from "./explorerDrag";

describe("explorerDrag", () => {
  beforeEach(() => {
    explorerDrag.end();
  });

  it("returns null when no drag is in progress", () => {
    expect(explorerDrag.get()).toBeNull();
  });

  it("carries paths with a null origin for a local drag", () => {
    explorerDrag.start(["/local/file.txt"]);
    expect(explorerDrag.get()).toEqual({ paths: ["/local/file.txt"], origin: null });
  });

  it("carries the origin host for a remote drag", () => {
    explorerDrag.start(["/etc/passwd"], { hostId: "host-1" });
    expect(explorerDrag.get()).toEqual({ paths: ["/etc/passwd"], origin: { hostId: "host-1" } });
  });

  it("clears state on end()", () => {
    explorerDrag.start(["/a"], { hostId: "host-1" });
    explorerDrag.end();
    expect(explorerDrag.get()).toBeNull();
  });

  it("notifies subscribers on start and end", () => {
    let calls = 0;
    const unsubscribe = explorerDrag.subscribe(() => {
      calls++;
    });
    explorerDrag.start(["/a"]);
    explorerDrag.end();
    expect(calls).toBe(2);
    unsubscribe();
    explorerDrag.start(["/b"]);
    expect(calls).toBe(2);
  });
});
