import { useRef, useMemo, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { cn } from "@/lib/utils";
import type { LayoutCommit } from "../types";
import { GraphRail, MAX_VISIBLE_LANES, railWidth } from "./GraphRail";
import { parseGithubUserId, getAvatarUrl, getCached, setCached } from "../lib/avatarCache";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

const ROW_HEIGHT = 32;
const TABLE_HEADER_HEIGHT = 26;

// Color values for lane-colored ref pills (must match GraphRail's LANE_STROKE_COLORS).
const LANE_PILL_COLORS = [
  "rgb(96, 165, 250)",   // blue-400
  "rgb(192, 132, 252)",  // purple-400
  "rgb(52, 211, 153)",   // emerald-400
  "rgb(251, 191, 36)",   // amber-400
  "rgb(244, 114, 182)",  // pink-400
  "rgb(34, 211, 238)",   // cyan-400
  "rgb(251, 146, 60)",   // orange-400
  "rgb(163, 230, 53)",   // lime-400
] as const;

function laneColor(colorIndex: number): string {
  return LANE_PILL_COLORS[colorIndex % LANE_PILL_COLORS.length];
}

const AVATAR_COLORS = [
  "#60a5fa", "#a78bfa", "#34d399", "#fb923c",
  "#f472b6", "#22d3ee", "#fbbf24", "#818cf8",
];

function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) & 0xffff;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function AuthorAvatar({ name, email }: { name: string; email: string }) {
  const userId = parseGithubUserId(email);
  // Initialize from shared cache so re-mounts skip the network entirely
  const [status, setStatus] = useState<"pending" | "ok" | "error">(() => {
    if (!userId) return "error";
    const cached = getCached(userId);
    if (cached === true) return "ok";
    if (cached === false) return "error";
    return "pending";
  });

  const parts = name.trim().split(/\s+/);
  const initials =
    parts.length === 1
      ? parts[0].charAt(0).toUpperCase()
      : (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();

  if (userId && status !== "error") {
    return (
      <img
        src={getAvatarUrl(userId, 36)}
        alt={name}
        className="size-[18px] shrink-0 rounded-[3px] object-cover"
        onLoad={() => { setCached(userId, true); setStatus("ok"); }}
        onError={() => { setCached(userId, false); setStatus("error"); }}
      />
    );
  }

  return (
    <span
      className="inline-flex size-[18px] shrink-0 items-center justify-center rounded-[3px] font-mono text-[8px] font-bold uppercase text-background"
      style={{ backgroundColor: getAvatarColor(name) }}
    >
      {initials}
    </span>
  );
}

function formatDate(ts: number): string {
  const d = new Date(ts * 1000);
  const now = new Date();
  const month = d.toLocaleString("en-US", { month: "short" });
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  if (d.getFullYear() !== now.getFullYear()) {
    return `${month} ${day} ${d.getFullYear()}`;
  }
  return `${month} ${day}  ${hh}:${mm}`;
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

export function GitGraphCanvas({
  commits,
  onSelectCommit,
  selectedHash,
  onViewChanges,
  onCheckoutCommit,
  onCreateBranchHere,
  onCherryPick,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: commits.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
    getItemKey: (i) => commits[i]?.hash ?? i,
  });

  const maxLaneCount = useMemo(
    () => Math.max(1, ...commits.map((c) => c.laneCount)),
    [commits],
  );

  const railReservedPx = railWidth(Math.min(maxLaneCount, MAX_VISIBLE_LANES));

  // rail | sha | subject (flex) | author | date | changes
  const gridTemplate = `${railReservedPx + 4}px 64px minmax(0,1fr) 148px 104px 108px`;

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Column headers */}
      <div
        className="grid shrink-0 items-center gap-3 border-b border-border/40 bg-card/55 pr-3 text-[9.5px] font-semibold uppercase tracking-[0.13em] text-muted-foreground/60"
        style={{ height: TABLE_HEADER_HEIGHT, gridTemplateColumns: gridTemplate }}
      >
        <div />
        <div className="pl-px">SHA</div>
        <div>Subject</div>
        <div className="ml-2">Author</div>
        <div className="text-right">Date</div>
        <div className="text-right pr-0">Changes</div>
      </div>

      {/* Scrollable rows */}
      <div
        ref={containerRef}
        className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden select-none"
      >
        <div style={{ height: virtualizer.getTotalSize(), position: "relative", width: "100%" }}>
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const commit = commits[virtualRow.index];
            if (!commit) return null;
            const isSelected = selectedHash === commit.hash;

            return (
              <div
                key={virtualRow.key}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: virtualRow.size,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <ContextMenu>
                  <ContextMenuTrigger asChild>
                    <button
                      type="button"
                      onClick={() => onSelectCommit(commit)}
                      className={cn(
                        "group relative grid h-full w-full cursor-pointer items-center gap-3 border-l-2 border-transparent pr-3 text-left transition-colors",
                        isSelected
                          ? "border-l-primary/60 bg-accent/40"
                          : "hover:bg-accent/20",
                      )}
                      style={{ gridTemplateColumns: gridTemplate }}
                    >
                      {/* Graph rail */}
                      <div className="flex items-center justify-start pl-1">
                        <GraphRail
                          commit={commit}
                          rowHeight={ROW_HEIGHT}
                          maxLaneCount={maxLaneCount}
                          active={isSelected}
                        />
                      </div>

                      {/* SHA */}
                      <span className="pl-px font-mono text-[10.5px] tabular-nums text-muted-foreground/75">
                        {commit.shortHash}
                      </span>

                      {/* Subject + ref pills */}
                      <div className="flex min-w-0 items-center gap-1.5">
                        {commit.refs.map((ref) => {
                          const isRemote = ref.startsWith("origin/") || ref.startsWith("upstream/") || /^[a-z0-9_-]+\//.test(ref) && !ref.startsWith("feat/") && !ref.startsWith("fix/") && !ref.startsWith("chore/") && !ref.startsWith("refactor/") && !ref.startsWith("docs/") && !ref.startsWith("test/") && !ref.startsWith("perf/") && !ref.startsWith("ci/");
                          const isTag = /^v\d/.test(ref);
                          return (
                            <span
                              key={ref}
                              className={cn(
                                "shrink-0 rounded px-1 py-px text-[9.5px] font-medium leading-[14px]",
                                isTag && "bg-amber-500/20 text-amber-400",
                                isRemote && !isTag && "opacity-65",
                              )}
                              style={
                                !isTag
                                  ? {
                                      backgroundColor: `${laneColor(commit.colorIndex)}25`,
                                      color: laneColor(commit.colorIndex),
                                      border: `1px solid ${laneColor(commit.colorIndex)}40`,
                                    }
                                  : { border: "1px solid rgb(245 158 11 / 0.35)" }
                              }
                            >
                              {ref}
                            </span>
                          );
                        })}
                        <span
                          className={cn(
                            "min-w-0 truncate text-[12px] leading-tight",
                            isSelected
                              ? "font-semibold text-foreground"
                              : "font-medium text-foreground/90",
                          )}
                        >
                          {commit.subject}
                        </span>
                      </div>

                      {/* Author */}
                      <span className="ml-2 inline-flex h-[18px] max-w-full min-w-0 items-center gap-1.5 justify-self-start overflow-hidden rounded-md bg-foreground/6 pl-1 pr-1.5 text-[10.5px] font-medium text-foreground/80">
                        <AuthorAvatar name={commit.authorName} email={commit.authorEmail} />
                        <span className="min-w-0 truncate">{commit.authorName}</span>
                      </span>

                      {/* Date */}
                      <span className="text-right font-mono text-[10.5px] tabular-nums text-muted-foreground/70">
                        {formatDate(commit.timestamp)}
                      </span>

                      {/* Changes */}
                      <span className="flex min-w-0 items-center justify-end gap-1.5 font-mono text-[10px] tabular-nums">
                        {commit.filesChanged > 0 ? (
                          <>
                            <span className="text-muted-foreground/60">{commit.filesChanged}</span>
                            <span className="size-[3px] shrink-0 rounded-full bg-muted-foreground/30" />
                          </>
                        ) : null}
                        {commit.insertions > 0 || commit.deletions > 0 ? (
                          <>
                            {commit.insertions > 0 && (
                              <span className="font-semibold text-emerald-500/90">
                                +{commit.insertions}
                              </span>
                            )}
                            {commit.deletions > 0 && (
                              <span className="font-semibold text-rose-500/90">
                                −{commit.deletions}
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="text-muted-foreground/35">—</span>
                        )}
                      </span>
                    </button>
                  </ContextMenuTrigger>

                  <ContextMenuContent className="w-52">
                    <ContextMenuItem onClick={() => onViewChanges?.(commit)} className="text-xs">
                      View Changes
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem onClick={() => onCheckoutCommit?.(commit)} className="text-xs">
                      Checkout (detached HEAD)
                    </ContextMenuItem>
                    <ContextMenuItem onClick={() => onCreateBranchHere?.(commit)} className="text-xs">
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
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
