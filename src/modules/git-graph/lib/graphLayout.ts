import type { CommitInfo } from "@/modules/source-control/types";
import type { LayoutCommit, GraphEdge } from "../types";

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
  const laneMap = new Map<string, number>(); // hash → lane index (O(1) lookup)
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
        topEdges.push({ kind: "merge", fromLane: i, toLane: lane, colorIndex: i % 8 });
      } else {
        topEdges.push({ kind: "straight", lane: i, colorIndex: i % 8 });
      }
    }

    // Consume all claiming lanes; reset fresh allocations too.
    for (const idx of claiming) {
      const prev = lanes[idx];
      if (prev) laneMap.delete(prev);
      lanes[idx] = null;
    }
    if (claiming.length === 0) lanes[lane] = null;

    // Bottom-half edges: place parents and fan out branches.
    const parents = commit.parentHashes;
    const bottomEdges: GraphEdge[] = [];

    if (parents.length > 0) {
      lanes[lane] = parents[0]; // first parent keeps the same lane
      if (parents[0]) laneMap.set(parents[0], lane);

      for (let p = 1; p < parents.length; p++) {
        const parentHash = parents[p];
        // O(1) lookup instead of O(n) indexOf
        let parentLane = laneMap.get(parentHash) ?? -1;
        if (parentLane === -1) {
          parentLane = firstFreeSlot(lanes);
          if (parentLane === lanes.length) lanes.push(null);
          lanes[parentLane] = parentHash;
          laneMap.set(parentHash, parentLane);
        }
        if (parentLane !== lane) {
          bottomEdges.push({
            kind: "branch",
            fromLane: lane,
            toLane: parentLane,
            colorIndex: parentLane % 8,
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
      bottomEdges.push({ kind: "straight", lane: i, colorIndex: i % 8 });
    }

    const trimmed = trimTrailing(lanes);
    if (trimmed.length !== lanes.length) lanes.length = trimmed.length;

    const laneCount = Math.max(lanesBefore.length, lanes.length, lane + 1);

    result.push({
      ...commit,
      row,
      lane,
      colorIndex: lane % 8,
      laneCount,
      topEdges,
      bottomEdges,
    });
  });

  return result;
}
