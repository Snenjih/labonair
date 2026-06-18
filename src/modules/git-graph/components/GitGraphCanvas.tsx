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

const ROW_HEIGHT = 36;
const LANE_WIDTH = 9;
const DOT_RADIUS = 3;
const LEFT_PADDING = 6;
const MAX_GRAPH_WIDTH = 140;

const AVATAR_COLORS = [
  "#60a5fa", "#a78bfa", "#4ade80", "#fb923c",
  "#f472b6", "#22d3ee", "#facc15", "#818cf8",
];

function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) & 0xffff;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function AuthorAvatar({ name }: { name: string }) {
  return (
    <div
      className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white"
      style={{ backgroundColor: getAvatarColor(name) }}
    >
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

function formatDate(ts: number): string {
  const d = new Date(ts * 1000);
  const month = d.toLocaleDateString("en-US", { month: "short" });
  const day = String(d.getDate()).padStart(2, "0");
  const hours = String(d.getHours()).padStart(2, "0");
  const mins = String(d.getMinutes()).padStart(2, "0");
  return `${month} ${day} ${hours}:${mins}`;
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
      strokeWidth={1.25}
      opacity={0.65}
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

  const maxLane = useMemo(
    () => (commits.length > 0 ? Math.max(...commits.map((c) => c.lane)) : 0),
    [commits],
  );
  const graphWidth = Math.min(
    Math.max(LEFT_PADDING * 2 + (maxLane + 1) * LANE_WIDTH, 20),
    MAX_GRAPH_WIDTH,
  );

  const visibleRange = useMemo(() => {
    if (virtualItems.length === 0) return { start: 0, end: 0 };
    const first = virtualItems[0].index;
    const last = virtualItems[virtualItems.length - 1].index;
    return { start: Math.max(0, first - 20), end: Math.min(commits.length - 1, last + 20) };
  }, [virtualItems, commits.length]);

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
    <div className="flex h-full min-h-0 flex-col">
      {/* Column headers */}
      <div
        className="flex shrink-0 items-center border-b border-border/40 bg-background/95"
        style={{ height: 28 }}
      >
        <div style={{ width: graphWidth, flexShrink: 0 }} />
        <div
          style={{ width: 68, flexShrink: 0 }}
          className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/40 pr-2"
        >
          SHA
        </div>
        <div className="min-w-0 flex-1 pl-1 pr-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/40">
          SUBJECT
        </div>
        <div
          style={{ width: 140, flexShrink: 0 }}
          className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/40 pr-2"
        >
          AUTHOR
        </div>
        <div
          style={{ width: 108, flexShrink: 0 }}
          className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/40 pr-2"
        >
          DATE
        </div>
        <div
          style={{ width: 100, flexShrink: 0 }}
          className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/40 pr-3"
        >
          CHANGES
        </div>
      </div>

      {/* Scrollable graph area */}
      <div ref={containerRef} className="min-h-0 flex-1 overflow-auto relative select-none">
        <div style={{ height: totalHeight, position: "relative" }}>
          {/* SVG edge layer — clipped to graph column width */}
          <svg
            style={{ position: "absolute", top: 0, left: 0, width: graphWidth, height: totalHeight, overflow: "hidden" }}
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
                      "flex items-center cursor-pointer transition-colors hover:bg-accent/25",
                      isSelected && "bg-accent/40",
                    )}
                    onClick={() => onSelectCommit(commit)}
                  >
                    {/* Graph column: commit dot */}
                    <div
                      style={{ width: graphWidth, flexShrink: 0, position: "relative", height: "100%", overflow: "hidden" }}
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
                          boxShadow: isSelected ? `0 0 0 2px ${commit.color}50` : undefined,
                        }}
                      />
                    </div>

                    {/* SHA */}
                    <div
                      style={{ width: 68, flexShrink: 0 }}
                      className="font-mono text-[11px] text-muted-foreground/55 pr-2 tabular-nums"
                    >
                      {commit.shortHash}
                    </div>

                    {/* Subject + branch pills */}
                    <div className="min-w-0 flex-1 flex items-center gap-1.5 pl-1 pr-2">
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
                              "shrink-0 rounded px-1 py-0 text-[10px] font-medium leading-4",
                              refKind === "remote" && "opacity-70",
                              refKind === "tag" && "bg-amber-500/20 text-amber-500",
                            )}
                            style={
                              refKind !== "tag"
                                ? {
                                    backgroundColor: `${commit.color}28`,
                                    color: commit.color,
                                    border: `1px solid ${commit.color}45`,
                                  }
                                : { border: "1px solid rgb(245 158 11 / 0.4)" }
                            }
                          >
                            {refKind === "remote" ? `· ${ref}` : ref}
                          </span>
                        );
                      })}
                      <span className="min-w-0 truncate text-[12px] text-foreground/90">
                        {commit.subject}
                      </span>
                    </div>

                    {/* Author */}
                    <div
                      style={{ width: 140, flexShrink: 0 }}
                      className="flex items-center gap-1.5 pr-2"
                    >
                      <AuthorAvatar name={commit.authorName} />
                      <span className="min-w-0 truncate text-[11px] text-muted-foreground/65">
                        {commit.authorName}
                      </span>
                    </div>

                    {/* Date */}
                    <div
                      style={{ width: 108, flexShrink: 0 }}
                      className="text-[11px] text-muted-foreground/55 pr-2 tabular-nums"
                    >
                      {formatDate(commit.timestamp)}
                    </div>

                    {/* Changes */}
                    <div
                      style={{ width: 100, flexShrink: 0 }}
                      className="flex items-center gap-1 pr-3 text-[11px] tabular-nums"
                    >
                      {commit.filesChanged > 0 ? (
                        <>
                          <span className="text-muted-foreground/45">{commit.filesChanged}</span>
                          <span className="text-muted-foreground/30">·</span>
                          {commit.insertions > 0 && (
                            <span className="text-green-500">+{commit.insertions}</span>
                          )}
                          {commit.deletions > 0 && (
                            <span className="text-red-400">-{commit.deletions}</span>
                          )}
                        </>
                      ) : (
                        <span className="text-muted-foreground/25">—</span>
                      )}
                    </div>
                  </div>
                </ContextMenuTrigger>
                <ContextMenuContent className="w-52">
                  <ContextMenuItem onClick={() => onViewChanges?.(commit)} className="text-xs">
                    View Changes
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem onClick={() => onCheckoutCommit?.(commit)} className="text-xs">
                    Checkout (detached HEAD)
                  </ContextMenuItem>
                  <ContextMenuItem
                    onClick={() => onCreateBranchHere?.(commit)}
                    className="text-xs"
                  >
                    Create Branch Here...
                  </ContextMenuItem>
                  <ContextMenuSeparator />
                  <ContextMenuItem onClick={() => onCherryPick?.(commit)} className="text-xs">
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
    </div>
  );
}
