import { describe, expect, it } from "vitest";
import { buildTreeRows } from "./buildTreeRows";
import type { FileEntry } from "./fsProvider";
import type { ChildrenState } from "./useLocalExplorerStore";

function entry(name: string, kind: FileEntry["kind"] = "file"): FileEntry {
  return { name, path: "", kind, size: 0, mtimeMs: 0, isIgnored: false };
}

function joinPath(parent: string, name: string): string {
  return parent.endsWith("/") ? `${parent}${name}` : `${parent}/${name}`;
}

describe("buildTreeRows", () => {
  it("returns nothing for a root with no node yet", () => {
    expect(buildTreeRows("/r", {}, new Set(), joinPath, null)).toEqual([]);
  });

  it("lists a loaded root's entries at depth 0", () => {
    const nodes: Record<string, ChildrenState> = {
      "/r": { status: "loaded", entries: [entry("a", "dir"), entry("b", "file")] },
    };
    const rows = buildTreeRows("/r", nodes, new Set(), joinPath, null);
    expect(rows).toEqual([
      { kind: "entry", path: "/r/a", parentPath: "/r", depth: 0, entry: entry("a", "dir") },
      { kind: "entry", path: "/r/b", parentPath: "/r", depth: 0, entry: entry("b", "file") },
    ]);
  });

  it("does not descend into an unexpanded directory", () => {
    const nodes: Record<string, ChildrenState> = {
      "/r": { status: "loaded", entries: [entry("a", "dir")] },
      "/r/a": { status: "loaded", entries: [entry("a1", "file")] },
    };
    const rows = buildTreeRows("/r", nodes, new Set(), joinPath, null);
    expect(rows).toEqual([
      { kind: "entry", path: "/r/a", parentPath: "/r", depth: 0, entry: entry("a", "dir") },
    ]);
  });

  it("descends into an expanded directory, incrementing depth", () => {
    const nodes: Record<string, ChildrenState> = {
      "/r": { status: "loaded", entries: [entry("a", "dir"), entry("b", "file")] },
      "/r/a": { status: "loaded", entries: [entry("a1", "file"), entry("a2", "dir")] },
    };
    const rows = buildTreeRows("/r", nodes, new Set(["/r/a"]), joinPath, null);
    expect(rows.map((r) => [r.kind, "path" in r ? r.path : r.parentPath, r.depth])).toEqual([
      ["entry", "/r/a", 0],
      ["entry", "/r/a/a1", 1],
      ["entry", "/r/a/a2", 1],
      ["entry", "/r/b", 0],
    ]);
  });

  it("does not recurse into a nested expanded dir with no loaded node yet", () => {
    const nodes: Record<string, ChildrenState> = {
      "/r": { status: "loaded", entries: [entry("a", "dir")] },
    };
    // "/r/a" is marked expanded but its own node hasn't arrived yet.
    const rows = buildTreeRows("/r", nodes, new Set(["/r/a"]), joinPath, null);
    expect(rows).toEqual([
      { kind: "entry", path: "/r/a", parentPath: "/r", depth: 0, entry: entry("a", "dir") },
    ]);
  });

  it("emits a loading row for an expanded directory mid-fetch", () => {
    const nodes: Record<string, ChildrenState> = {
      "/r": { status: "loaded", entries: [entry("a", "dir")] },
      "/r/a": { status: "loading" },
    };
    const rows = buildTreeRows("/r", nodes, new Set(["/r/a"]), joinPath, null);
    expect(rows).toEqual([
      { kind: "entry", path: "/r/a", parentPath: "/r", depth: 0, entry: entry("a", "dir") },
      { kind: "loading", parentPath: "/r/a", depth: 1 },
    ]);
  });

  it("emits an error row with message for a failed fetch", () => {
    const nodes: Record<string, ChildrenState> = {
      "/r": { status: "loaded", entries: [entry("a", "dir")] },
      "/r/a": { status: "error", message: "permission denied" },
    };
    const rows = buildTreeRows("/r", nodes, new Set(["/r/a"]), joinPath, null);
    expect(rows[1]).toEqual({ kind: "error", parentPath: "/r/a", depth: 1, message: "permission denied" });
  });

  it("emits a pending-create row as the first row inside the root", () => {
    const nodes: Record<string, ChildrenState> = {
      "/r": { status: "loaded", entries: [entry("a", "dir")] },
    };
    const rows = buildTreeRows("/r", nodes, new Set(), joinPath, { parentPath: "/r", kind: "file" });
    expect(rows[0]).toEqual({ kind: "pending-create", parentPath: "/r", depth: 0, createKind: "file" });
    expect(rows[1].kind).toBe("entry");
  });

  it("emits a pending-create row nested inside an expanded directory", () => {
    const nodes: Record<string, ChildrenState> = {
      "/r": { status: "loaded", entries: [entry("a", "dir")] },
      "/r/a": { status: "loaded", entries: [] },
    };
    const rows = buildTreeRows("/r", nodes, new Set(["/r/a"]), joinPath, { parentPath: "/r/a", kind: "dir" });
    expect(rows).toEqual([
      { kind: "entry", path: "/r/a", parentPath: "/r", depth: 0, entry: entry("a", "dir") },
      { kind: "pending-create", parentPath: "/r/a", depth: 1, createKind: "dir" },
    ]);
  });

  it("stops recursing past a directory whose node failed to load", () => {
    const nodes: Record<string, ChildrenState> = {
      "/r": { status: "loaded", entries: [entry("a", "dir"), entry("b", "dir")] },
      "/r/a": { status: "error", message: "boom" },
      "/r/b": { status: "loaded", entries: [entry("b1", "file")] },
    };
    const rows = buildTreeRows("/r", nodes, new Set(["/r/a", "/r/b"]), joinPath, null);
    // "/r/a" errored -> only its error row, no further descent; "/r/b" still expands normally.
    expect(rows.map((r) => ("path" in r ? r.path : r.kind))).toEqual([
      "/r/a",
      "error",
      "/r/b",
      "/r/b/b1",
    ]);
  });
});
