import type { CommitInfo } from "@/modules/source-control/types";
import type { LayoutCommit, GraphEdge } from "../types";

const LANE_COLORS = [
  "#60a5fa", // blue-400
  "#c084fc", // purple-400
  "#34d399", // emerald-400
  "#fbbf24", // amber-400
  "#f472b6", // pink-400
  "#22d3ee", // cyan-400
  "#fb923c", // orange-400
  "#a3e635", // lime-400
];

function laneColor(index: number): string {
  return LANE_COLORS[index % LANE_COLORS.length];
}

function firstFreeSlot(lanes: (string | null)[]): number {
  for (let i = 0; i < lanes.length; i++) {
    if (lanes[i] === null) return i;
  }
  return lanes.length;
}

function trimTrailing(lanes: (string | null)[]): (string | null)[] {
  let end = lanes.length;
  while (end > 0 && lanes[end - 1] === null) end--;
  return end === lanes.length ? lanes : lanes.slice(0, end);
}

export function buildGraphLayout(commits: CommitInfo[]): LayoutCommit[] {
  const lanes: (string | null)[] = [];
  const result: LayoutCommit[] = [];

  commits.forEach((commit, row) => {
    // Find all lanes currently expecting this commit (merge targets).
    const claiming: number[] = [];
    for (let i = 0; i < lanes.length; i++) {
      if (lanes[i] === commit.hash) claiming.push(i);
    }

    let lane: number;
    if (claiming.length > 0) {
      lane = claiming[0]; // leftmost claiming lane wins
    } else {
      lane = firstFreeSlot(lanes);
      if (lane === lanes.length) lanes.push(null);
    }

    const lanesBefore = lanes.slice();
    const topEdges: GraphEdge[] = [];

    // Top-half edges: draw incoming connections from the row above.
    for (let i = 0; i < lanesBefore.length; i++) {
      const v = lanesBefore[i];
      if (v === null) continue;
      if (v === commit.hash && i !== lane) {
        topEdges.push({ kind: "merge", fromLane: i, toLane: lane, color: laneColor(i) });
      } else {
        topEdges.push({ kind: "straight", lane: i, color: laneColor(i) });
      }
    }

    // Consume all claiming lanes; reset fresh allocations too.
    for (const idx of claiming) lanes[idx] = null;
    if (claiming.length === 0) lanes[lane] = null;

    // Bottom-half edges: place parents and fan out branches.
    const parents = commit.parentHashes;
    const bottomEdges: GraphEdge[] = [];

    if (parents.length > 0) {
      lanes[lane] = parents[0]; // first parent keeps the same lane

      for (let p = 1; p < parents.length; p++) {
        const parentHash = parents[p];
        let parentLane = lanes.indexOf(parentHash);
        if (parentLane === -1) {
          parentLane = firstFreeSlot(lanes);
          if (parentLane === lanes.length) lanes.push(null);
          lanes[parentLane] = parentHash;
        }
        if (parentLane !== lane) {
          bottomEdges.push({
            kind: "branch",
            fromLane: lane,
            toLane: parentLane,
            color: laneColor(parentLane),
          });
        }
      }
    }

    // Straight passthroughs for all other active lanes.
    const branchTargets = new Set(
      bottomEdges
        .filter((e): e is Extract<GraphEdge, { kind: "branch" }> => e.kind === "branch")
        .map((e) => e.toLane),
    );
    for (let i = 0; i < lanes.length; i++) {
      if (lanes[i] === null) continue;
      if (branchTargets.has(i)) continue;
      bottomEdges.push({ kind: "straight", lane: i, color: laneColor(i) });
    }

    const trimmed = trimTrailing(lanes);
    if (trimmed.length !== lanes.length) lanes.length = trimmed.length;

    const laneCount = Math.max(lanesBefore.length, lanes.length, lane + 1);

    result.push({
      ...commit,
      row,
      lane,
      color: laneColor(lane),
      laneCount,
      topEdges,
      bottomEdges,
    });
  });

  return result;
}
