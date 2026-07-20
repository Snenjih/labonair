import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useRef } from "react";
import { FileTreeNode } from "../FileTreeNode";
import { InlineInput } from "../InlineInput";
import type { TreeRow } from "../lib/buildTreeRows";
import type { useFileTree } from "../lib/useFileTree";

const ROW_HEIGHT = 24;

type Tree = ReturnType<typeof useFileTree>;

type Props = {
  rows: TreeRow[];
  rootPath: string;
  tree: Tree;
  onOpenFile: (path: string) => void;
  onOpenPreview?: (path: string) => void;
  onRevealInTerminal?: (path: string) => void;
  onAttachToAgent?: (path: string, remote?: { sessionId: string; hostId: string }) => void;
  onBookmarkPath?: (path: string) => void;
  isBookmarked?: (path: string) => boolean;
  selectedPath: string | null;
  onSelectPath: (path: string) => void;
  dropTargetPath: string | null;
  /** Set when browsing a remote host — tags drag-to-terminal drops with
   *  their origin host (see `explorerDrag`'s `DragOrigin`). */
  dragOriginHostId?: string;
};

/**
 * Renders the flattened, currently-visible tree rows (from `buildTreeRows`)
 * through `@tanstack/react-virtual` — only rows actually in/near the
 * viewport exist in the DOM, so scroll performance no longer scales with how
 * many directories are expanded (matters for both very large local
 * directories and remote directories, where every row also carries network
 * latency to have populated in the first place).
 */
export function VirtualizedTreeList({
  rows,
  rootPath,
  tree,
  onOpenFile,
  onOpenPreview,
  onRevealInTerminal,
  onAttachToAgent,
  onBookmarkPath,
  isBookmarked,
  selectedPath,
  onSelectPath,
  dropTargetPath,
  dragOriginHostId,
}: Props) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  });

  // Keyboard navigation (ArrowUp/Down in FileExplorer) selects a path that
  // may not currently be mounted — scroll it into view via the virtualizer's
  // own index-based API instead of `scrollIntoView`, which only works on
  // elements that already exist in the DOM.
  useEffect(() => {
    if (!selectedPath) return;
    const idx = rows.findIndex((r) => r.kind === "entry" && r.path === selectedPath);
    if (idx >= 0) virtualizer.scrollToIndex(idx, { align: "auto" });
  }, [selectedPath, rows, virtualizer]);

  return (
    <div ref={parentRef} className="h-full overflow-auto">
      <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const row = rows[virtualRow.index];
          return (
            <div
              key={virtualRow.key}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: ROW_HEIGHT,
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              {row.kind === "entry" ? (
                <FileTreeNode
                  path={row.path}
                  entry={row.entry}
                  parentPath={row.parentPath}
                  rootPath={rootPath}
                  depth={row.depth}
                  tree={tree}
                  onOpenFile={onOpenFile}
                  onOpenPreview={onOpenPreview}
                  onRevealInTerminal={onRevealInTerminal}
                  onAttachToAgent={onAttachToAgent}
                  onBookmarkPath={onBookmarkPath}
                  isBookmarked={isBookmarked}
                  selectedPath={selectedPath}
                  onSelectPath={onSelectPath}
                  dropTargetPath={dropTargetPath}
                  dragOriginHostId={dragOriginHostId}
                />
              ) : row.kind === "pending-create" ? (
                <div
                  className="flex h-full w-full items-center gap-1.5 px-1.5 text-xs"
                  style={{ paddingLeft: 6 + row.depth * 12 }}
                >
                  <span className="size-3 shrink-0" />
                  <span className="size-4 shrink-0" />
                  <InlineInput
                    initial=""
                    placeholder={row.createKind === "dir" ? "New folder" : "New file"}
                    onCommit={tree.commitCreate}
                    onCancel={tree.cancelCreate}
                  />
                </div>
              ) : row.kind === "loading" ? (
                <div
                  className="flex h-full items-center text-[11px] text-muted-foreground"
                  style={{ paddingLeft: 6 + row.depth * 12 + 18 }}
                >
                  Loading…
                </div>
              ) : row.kind === "error" ? (
                <div
                  className="flex h-full items-center text-[11px] text-destructive"
                  style={{ paddingLeft: 6 + row.depth * 12 + 18 }}
                >
                  {row.message}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => tree.loadMore(row.parentPath)}
                  className="flex h-full w-full items-center text-[11px] text-primary hover:underline"
                  style={{ paddingLeft: 6 + row.depth * 12 + 18 }}
                >
                  Load more…
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
