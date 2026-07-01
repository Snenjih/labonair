import type { FileEntry } from "./fsProvider";
import type { PendingCreate } from "./useFileTree";
import type { ChildrenState } from "./useLocalExplorerStore";

export type TreeRow =
  | { kind: "entry"; path: string; parentPath: string; depth: number; entry: FileEntry }
  | { kind: "pending-create"; parentPath: string; depth: number; createKind: "file" | "dir" }
  | { kind: "loading"; parentPath: string; depth: number }
  | { kind: "error"; parentPath: string; depth: number; message: string };

/**
 * Flattens the tree store's per-directory node map into the ordered list of
 * rows that should currently be visible, given which directories are
 * expanded. Pure and unit-tested — `VirtualizedTreeList` feeds this straight
 * into `useVirtualizer` instead of recursively rendering nested components,
 * so scroll performance stops scaling with total node count (only visible
 * rows exist in the DOM) rather than with total expanded-subtree size.
 *
 * A directory's own "pending create" / "loading" / "error" row is emitted as
 * the first row inside that directory (matching where FileTreeNode used to
 * render it inline, just as a sibling row instead of nested JSX).
 */
export function buildTreeRows(
  rootPath: string,
  nodes: Record<string, ChildrenState>,
  expanded: Set<string>,
  joinPath: (parent: string, name: string) => string,
  pendingCreate: PendingCreate | null,
): TreeRow[] {
  const out: TreeRow[] = [];

  function walk(parent: string, depth: number) {
    if (pendingCreate?.parentPath === parent) {
      out.push({ kind: "pending-create", parentPath: parent, depth, createKind: pendingCreate.kind });
    }

    const node = nodes[parent];
    if (!node) return;

    if (node.status === "loading") {
      out.push({ kind: "loading", parentPath: parent, depth });
      return;
    }
    if (node.status === "error") {
      out.push({ kind: "error", parentPath: parent, depth, message: node.message });
      return;
    }
    if (node.status !== "loaded") return;

    for (const entry of node.entries) {
      const path = joinPath(parent, entry.name);
      out.push({ kind: "entry", path, parentPath: parent, depth, entry });
      if (entry.kind === "dir" && expanded.has(path)) {
        walk(path, depth + 1);
      }
    }
  }

  walk(rootPath, 0);
  return out;
}
