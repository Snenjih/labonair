import { useRef, useMemo } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { cn } from "@/lib/utils";
import type { LayoutCommit, Edge } from "../types";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

const ROW_HEIGHT = 28;
const LANE_WIDTH = 14;
const DOT_RADIUS = 4;
const LEFT_PADDING = 8;

function formatDate(ts: number): string {
  const d = new Date(ts * 1000);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

interface EdgeLineProps {
  edge: Edge;
}

function EdgeLine({ edge }: EdgeLineProps) {
  const x1 = LEFT_PADDING + edge.fromLane * LANE_WIDTH + LANE_WIDTH / 2;
  const y1 = edge.fromRow * ROW_HEIGHT + ROW_HEIGHT / 2;
  const x2 = LEFT_PADDING + edge.toLane * LANE_WIDTH + LANE_WIDTH / 2;
  const y2 = edge.toRow * ROW_HEIGHT + ROW_HEIGHT / 2;
  const midY = (y1 + y2) / 2;

  return (
    <path
      d={`M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`}
      fill="none"
      stroke={edge.color}
      strokeWidth={1.5}
      opacity={0.7}
    />
  );
}

interface Props {
  commits: LayoutCommit[];
  onSelectCommit: (commit: LayoutCommit) => void;
  selectedHash: string | null;
  onViewChanges?: (commit: LayoutCommit) => void;
  onCheckoutCommit?: (commit: LayoutCommit) => void;
  onCreateBranchHere?: (commit: LayoutCommit) => void;
  onCherryPick?: (commit: LayoutCommit) => void;
}

export function GitGraphCanvas({ commits, onSelectCommit, selectedHash, onViewChanges, onCheckoutCommit, onCreateBranchHere, onCherryPick }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: commits.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  });

  const virtualItems = virtualizer.getVirtualItems();

  // Compute the visible row range (with buffer) for edge culling
  const visibleRange = useMemo(() => {
    if (virtualItems.length === 0) return { start: 0, end: 0 };
    const first = virtualItems[0].index;
    const last = virtualItems[virtualItems.length - 1].index;
    return { start: Math.max(0, first - 20), end: Math.min(commits.length - 1, last + 20) };
  }, [virtualItems, commits.length]);

  // Collect all edges from commits in the visible range
  const visibleEdges = useMemo(() => {
    const edges: Edge[] = [];
    for (let i = visibleRange.start; i <= visibleRange.end; i++) {
      const commit = commits[i];
      if (commit) {
        for (const edge of commit.edges) {
          edges.push(edge);
        }
      }
    }
    return edges;
  }, [commits, visibleRange]);

  const totalHeight = commits.length * ROW_HEIGHT;

  return (
    <div
      ref={containerRef}
      className="h-full overflow-auto relative select-none"
    >
      <div style={{ height: totalHeight, position: "relative" }}>
        {/* SVG layer for edges */}
        <svg
          style={{ position: "absolute", top: 0, left: 0, width: "100%", height: totalHeight }}
          className="pointer-events-none"
        >
          {visibleEdges.map((edge, i) => (
            <EdgeLine key={`${edge.fromRow}-${edge.fromLane}-${edge.toLane}-${i}`} edge={edge} />
          ))}
        </svg>

        {/* Virtual rows */}
        {virtualItems.map((virtualRow) => {
          const commit = commits[virtualRow.index];
          if (!commit) return null;
          const isSelected = selectedHash === commit.hash;

          return (
            <ContextMenu key={commit.hash}>
              <ContextMenuTrigger asChild>
                <div
                  style={{
                    position: "absolute",
                    top: virtualRow.start,
                    height: ROW_HEIGHT,
                    width: "100%",
                    left: 0,
                  }}
                  className={cn(
                    "flex items-center cursor-pointer hover:bg-accent/30 transition-colors",
                    isSelected && "bg-accent/50",
                  )}
                  onClick={() => onSelectCommit(commit)}
                >
                  {/* Commit dot — positioned at lane */}
                  <div
                    style={{
                      width: LEFT_PADDING + (commit.lane + 1) * LANE_WIDTH,
                      flexShrink: 0,
                      position: "relative",
                      height: "100%",
                    }}
                  >
                    <div
                      style={{
                        position: "absolute",
                        left: LEFT_PADDING + commit.lane * LANE_WIDTH + LANE_WIDTH / 2 - DOT_RADIUS,
                        top: "50%",
                        transform: "translateY(-50%)",
                        width: DOT_RADIUS * 2,
                        height: DOT_RADIUS * 2,
                        borderRadius: "50%",
                        backgroundColor: commit.color,
                        boxShadow: isSelected ? `0 0 0 2px ${commit.color}60` : undefined,
                      }}
                    />
                  </div>

                  {/* Text content */}
                  <div className="flex min-w-0 flex-1 items-center gap-2 pr-2">
                    {/* Ref pills */}
                    {commit.refs.map((ref) => {
                      const refKind: "local" | "remote" | "tag" = ref.includes("/")
                        ? "remote"
                        : /^v\d/.test(ref)
                          ? "tag"
                          : "local";
                      return (
                        <span
                          key={ref}
                          className={cn(
                            "shrink-0 rounded px-1 py-0 text-[10px] font-medium",
                            refKind === "remote" && "opacity-70",
                            refKind === "tag" && "bg-amber-500/20 text-amber-500"
                          )}
                          style={
                            refKind !== "tag"
                              ? {
                                  backgroundColor: `${commit.color}30`,
                                  color: commit.color,
                                  border: `1px solid ${commit.color}50`,
                                }
                              : {
                                  border: "1px solid rgb(245 158 11 / 0.4)",
                                }
                          }
                          title={
                            refKind === "remote"
                              ? `Remote branch: ${ref}`
                              : refKind === "tag"
                                ? `Tag: ${ref}`
                                : `Branch: ${ref}`
                          }
                        >
                          {refKind === "remote" ? `· ${ref}` : ref}
                        </span>
                      );
                    })}

                    {/* Subject */}
                    <span className="min-w-0 truncate text-[12px] text-foreground">
                      {commit.subject}
                    </span>

                    {/* Author + Date */}
                    <span className="ml-auto shrink-0 text-[10px] text-muted-foreground/60">
                      {commit.authorName} · {formatDate(commit.timestamp)}
                    </span>
                  </div>
                </div>
              </ContextMenuTrigger>
              <ContextMenuContent className="w-52">
                <ContextMenuItem
                  onClick={() => onViewChanges?.(commit)}
                  className="text-xs"
                >
                  View Changes
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem
                  onClick={() => onCheckoutCommit?.(commit)}
                  className="text-xs"
                >
                  Checkout (detached HEAD)
                </ContextMenuItem>
                <ContextMenuItem
                  onClick={() => onCreateBranchHere?.(commit)}
                  className="text-xs"
                >
                  Create Branch Here...
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem
                  onClick={() => onCherryPick?.(commit)}
                  className="text-xs"
                >
                  Cherry-pick
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem
                  onClick={() => void navigator.clipboard.writeText(commit.hash)}
                  className="text-xs"
                >
                  Copy Hash
                </ContextMenuItem>
                <ContextMenuItem
                  onClick={() => void navigator.clipboard.writeText(commit.shortHash)}
                  className="text-xs"
                >
                  Copy Short Hash
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          );
        })}
      </div>
    </div>
  );
}
