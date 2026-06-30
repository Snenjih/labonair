import { describe, expect, it } from "vitest";
import {
  basename,
  collectLeafIds,
  findParent,
  makeLeaf,
  replaceNode,
  titleFromUrl,
  type PaneLeaf,
  type PaneNode,
  type PaneSplit,
} from "./types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function leaf(id: string): PaneLeaf {
  return { type: "pane", id };
}

function split(
  id: string,
  direction: "horizontal" | "vertical",
  left: PaneNode,
  right: PaneNode,
): PaneSplit {
  return { type: "split", id, direction, sizes: [50, 50], children: [left, right] };
}

// ─── makeLeaf ────────────────────────────────────────────────────────────────

describe("makeLeaf", () => {
  it("creates a pane leaf with the given id", () => {
    const l = makeLeaf("sess-1");
    expect(l.type).toBe("pane");
    expect(l.id).toBe("sess-1");
  });
});

// ─── findParent ───────────────────────────────────────────────────────────────

describe("findParent", () => {
  it("returns null for a single leaf root", () => {
    expect(findParent(leaf("a"), "a")).toBeNull();
  });

  it("returns null when target not found", () => {
    const tree = split("s1", "horizontal", leaf("a"), leaf("b"));
    expect(findParent(tree, "missing")).toBeNull();
  });

  it("finds direct left child", () => {
    const tree = split("s1", "horizontal", leaf("a"), leaf("b"));
    const result = findParent(tree, "a");
    expect(result).not.toBeNull();
    expect(result?.parent.id).toBe("s1");
    expect(result?.siblingIndex).toBe(1);
  });

  it("finds direct right child", () => {
    const tree = split("s1", "horizontal", leaf("a"), leaf("b"));
    const result = findParent(tree, "b");
    expect(result).not.toBeNull();
    expect(result?.parent.id).toBe("s1");
    expect(result?.siblingIndex).toBe(0);
  });

  it("finds a deeply nested leaf (3 levels)", () => {
    const inner = split("s2", "vertical", leaf("c"), leaf("d"));
    const tree = split("s1", "horizontal", leaf("a"), inner);
    const result = findParent(tree, "d");
    expect(result).not.toBeNull();
    expect(result?.parent.id).toBe("s2");
    expect(result?.siblingIndex).toBe(0);
  });

  it("returns null when searching for a split node id (only pane leaves are matched)", () => {
    const inner = split("s2", "vertical", leaf("c"), leaf("d"));
    const tree = split("s1", "horizontal", inner, leaf("b"));
    // findParent only matches pane-type leaves, not split nodes
    expect(findParent(tree, "s2")).toBeNull();
  });
});

// ─── replaceNode ──────────────────────────────────────────────────────────────

describe("replaceNode", () => {
  it("replaces the root when root id matches", () => {
    const original = leaf("a");
    const replacement = leaf("new");
    const result = replaceNode(original, "a", replacement);
    expect(result).toBe(replacement);
  });

  it("does not mutate the original tree", () => {
    const leftLeaf = leaf("a");
    const rightLeaf = leaf("b");
    const tree = split("s1", "horizontal", leftLeaf, rightLeaf);
    const frozen = JSON.stringify(tree);
    replaceNode(tree, "a", leaf("new"));
    expect(JSON.stringify(tree)).toBe(frozen);
  });

  it("replaces a left leaf in a split", () => {
    const tree = split("s1", "horizontal", leaf("a"), leaf("b"));
    const result = replaceNode(tree, "a", leaf("replaced"));
    expect(result.type).toBe("split");
    if (result.type === "split") {
      expect(result.children[0]).toEqual({ type: "pane", id: "replaced" });
      expect(result.children[1]).toEqual({ type: "pane", id: "b" });
    }
  });

  it("replaces a right leaf in a split", () => {
    const tree = split("s1", "horizontal", leaf("a"), leaf("b"));
    const result = replaceNode(tree, "b", leaf("replaced"));
    if (result.type === "split") {
      expect(result.children[1]).toEqual({ type: "pane", id: "replaced" });
    }
  });

  it("returns the tree unchanged when target not found", () => {
    const tree = split("s1", "horizontal", leaf("a"), leaf("b"));
    const result = replaceNode(tree, "missing", leaf("x"));
    expect(JSON.stringify(result)).toBe(JSON.stringify(tree));
  });

  it("replaces a nested node correctly", () => {
    const inner = split("s2", "vertical", leaf("c"), leaf("d"));
    const tree = split("s1", "horizontal", leaf("a"), inner);
    const result = replaceNode(tree, "c", leaf("new-c"));
    if (result.type === "split" && result.children[1].type === "split") {
      expect(result.children[1].children[0]).toEqual({ type: "pane", id: "new-c" });
    }
  });
});

// ─── collectLeafIds ───────────────────────────────────────────────────────────

describe("collectLeafIds", () => {
  it("returns single id for a leaf root", () => {
    expect(collectLeafIds(leaf("a"))).toEqual(["a"]);
  });

  it("returns both ids for a two-leaf split", () => {
    const tree = split("s1", "horizontal", leaf("a"), leaf("b"));
    expect(collectLeafIds(tree)).toEqual(["a", "b"]);
  });

  it("collects all 4 leaves in depth-first order", () => {
    const left = split("s2", "vertical", leaf("a"), leaf("b"));
    const right = split("s3", "vertical", leaf("c"), leaf("d"));
    const tree = split("s1", "horizontal", left, right);
    expect(collectLeafIds(tree)).toEqual(["a", "b", "c", "d"]);
  });

  it("accumulates into provided array", () => {
    const out: string[] = ["pre"];
    collectLeafIds(leaf("a"), out);
    expect(out).toEqual(["pre", "a"]);
  });
});

// ─── basename ─────────────────────────────────────────────────────────────────

describe("basename", () => {
  it("returns the last segment of a Unix path", () => {
    expect(basename("/foo/bar/baz.ts")).toBe("baz.ts");
  });

  it("handles a single filename without slashes", () => {
    expect(basename("file.ts")).toBe("file.ts");
  });

  it("ignores trailing slash", () => {
    expect(basename("/foo/bar/")).toBe("bar");
  });

  it("returns path as-is when empty", () => {
    expect(basename("")).toBe("");
  });

  it("handles root / (returns path as-is since filter(Boolean) yields empty array)", () => {
    expect(basename("/")).toBe("/");
  });
});

// ─── titleFromUrl ─────────────────────────────────────────────────────────────

describe("titleFromUrl", () => {
  it("returns the host for a valid http URL", () => {
    expect(titleFromUrl("https://example.com/path?q=1")).toBe("example.com");
  });

  it("returns the host for a localhost URL", () => {
    expect(titleFromUrl("http://localhost:3000")).toBe("localhost:3000");
  });

  it("returns the url string for an invalid URL", () => {
    expect(titleFromUrl("not-a-url")).toBe("not-a-url");
  });

  it("returns 'preview' for an empty string", () => {
    expect(titleFromUrl("")).toBe("preview");
  });
});
