import { memo, type ReactElement } from "react";
import type { GraphEdge, LayoutCommit } from "../types";

export const LANE_WIDTH = 14;
export const RAIL_PADDING_X = 8;
export const MAX_VISIBLE_LANES = 6;

const STRAIGHT_WIDTH = 1.5;
const CURVE_WIDTH = 1.5;

// SVG stroke attributes require color strings, not CSS class names.
// These rgb values match Tailwind's color palette for light/dark compatibility.
const LANE_STROKE_COLORS = [
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
  return LANE_STROKE_COLORS[colorIndex % LANE_STROKE_COLORS.length];
}

function laneX(lane: number): number {
  return RAIL_PADDING_X + lane * LANE_WIDTH;
}

export function railWidth(maxLane: number): number {
  const visible = Math.min(maxLane, MAX_VISIBLE_LANES);
  return RAIL_PADDING_X * 2 + Math.max(0, visible - 1) * LANE_WIDTH + 6;
}

function renderTopEdge(edge: GraphEdge, midY: number): ReactElement | null {
  if (edge.kind === "straight") {
    if (edge.lane >= MAX_VISIBLE_LANES) return null;
    const x = laneX(edge.lane);
    return (
      <line
        key={`t-s-${edge.lane}`}
        x1={x} y1={0} x2={x} y2={midY}
        stroke={laneColor(edge.colorIndex)}
        strokeWidth={STRAIGHT_WIDTH}
        strokeLinecap="round"
      />
    );
  }
  if (edge.kind === "merge") {
    if (edge.fromLane >= MAX_VISIBLE_LANES && edge.toLane >= MAX_VISIBLE_LANES) return null;
    const xFrom = Math.min(laneX(edge.fromLane), laneX(MAX_VISIBLE_LANES - 1));
    const xTo = laneX(Math.min(edge.toLane, MAX_VISIBLE_LANES - 1));
    const c1y = midY * 0.55;
    return (
      <path
        key={`t-m-${edge.fromLane}-${edge.toLane}`}
        d={`M ${xFrom} 0 C ${xFrom} ${c1y}, ${xTo} ${c1y}, ${xTo} ${midY}`}
        fill="none"
        stroke={laneColor(edge.colorIndex)}
        strokeWidth={CURVE_WIDTH}
        strokeLinecap="round"
      />
    );
  }
  return null;
}

function renderBottomEdge(edge: GraphEdge, midY: number, bottomY: number): ReactElement | null {
  if (edge.kind === "straight") {
    if (edge.lane >= MAX_VISIBLE_LANES) return null;
    const x = laneX(edge.lane);
    return (
      <line
        key={`b-s-${edge.lane}`}
        x1={x} y1={midY} x2={x} y2={bottomY}
        stroke={laneColor(edge.colorIndex)}
        strokeWidth={STRAIGHT_WIDTH}
        strokeLinecap="round"
      />
    );
  }
  if (edge.kind === "branch") {
    if (edge.fromLane >= MAX_VISIBLE_LANES && edge.toLane >= MAX_VISIBLE_LANES) return null;
    const xFrom = laneX(Math.min(edge.fromLane, MAX_VISIBLE_LANES - 1));
    const xTo = Math.min(laneX(edge.toLane), laneX(MAX_VISIBLE_LANES - 1));
    const c1y = midY + (bottomY - midY) * 0.45;
    return (
      <path
        key={`b-b-${edge.fromLane}-${edge.toLane}`}
        d={`M ${xFrom} ${midY} C ${xFrom} ${c1y}, ${xTo} ${c1y}, ${xTo} ${bottomY}`}
        fill="none"
        stroke={laneColor(edge.colorIndex)}
        strokeWidth={CURVE_WIDTH}
        strokeLinecap="round"
      />
    );
  }
  return null;
}

interface Props {
  commit: LayoutCommit;
  rowHeight: number;
  maxLaneCount: number;
  active?: boolean;
}

export const GraphRail = memo(function GraphRail({ commit, rowHeight, maxLaneCount, active }: Props) {
  const width = railWidth(maxLaneCount);
  const midY = Math.round(rowHeight / 2);
  const visibleLane = Math.min(commit.lane, MAX_VISIBLE_LANES - 1);
  const nodeX = laneX(visibleLane);
  const overflow = commit.laneCount > MAX_VISIBLE_LANES;

  return (
    <svg
      width={width}
      height={rowHeight}
      viewBox={`0 0 ${width} ${rowHeight}`}
      aria-hidden
      className="shrink-0 overflow-visible"
    >
      {commit.topEdges.map((e) => renderTopEdge(e, midY))}
      {commit.bottomEdges.map((e) => renderBottomEdge(e, midY, rowHeight))}
      <circle
        cx={nodeX}
        cy={midY}
        r={active ? 4.5 : 3.5}
        fill={laneColor(commit.colorIndex)}
        stroke="var(--background)"
        strokeWidth={1.5}
      />
      {active && (
        <circle
          cx={nodeX}
          cy={midY}
          r={6.5}
          fill="none"
          stroke={laneColor(commit.colorIndex)}
          strokeOpacity={0.35}
          strokeWidth={1.4}
        />
      )}
      {overflow && (
        <text
          x={width - 3}
          y={midY + 3}
          textAnchor="end"
          className="fill-muted-foreground"
          style={{ fontSize: 8 }}
        >
          +{commit.laneCount - MAX_VISIBLE_LANES}
        </text>
      )}
    </svg>
  );
});
