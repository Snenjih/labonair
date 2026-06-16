import type { CommitInfo } from "@/modules/source-control/types";
import type { LayoutCommit, Edge } from "../types";

const LANE_COLORS = [
  "#60a5fa", // blue-400
  "#a78bfa", // violet-400
  "#4ade80", // green-400
  "#fb923c", // orange-400
  "#f472b6", // pink-400
  "#22d3ee", // cyan-400
  "#facc15", // yellow-400
  "#f87171", // red-400
  "#818cf8", // indigo-400
  "#2dd4bf", // teal-400
];

export function buildGraphLayout(commits: CommitInfo[]): LayoutCommit[] {
  // commits[0] is newest (git log default order)

  // activeLanes[laneIndex] = hash of the commit currently "occupying" that lane
  // (i.e., the most recent ancestor we're waiting to encounter)
  const activeLanes: (string | null)[] = [];

  const result: LayoutCommit[] = [];

  commits.forEach((commit, row) => {
    // Find which lane this commit should go in
    // A commit inherits the lane of its "slot" — where a child placed it
    let lane = activeLanes.indexOf(commit.hash);
    if (lane === -1) {
      // New tip (no child has claimed a lane for this commit)
      // Find first free (null) lane, or append a new one
      lane = activeLanes.indexOf(null);
      if (lane === -1) {
        lane = activeLanes.length;
        activeLanes.push(null);
      }
    }

    const color = LANE_COLORS[lane % LANE_COLORS.length];
    const edges: Edge[] = [];

    // Now assign this commit's parents to lanes
    commit.parentHashes.forEach((parentHash, i) => {
      if (i === 0) {
        // First parent continues in the same lane
        activeLanes[lane] = parentHash;
        edges.push({ fromRow: row, toRow: row + 1, fromLane: lane, toLane: lane, color });
      } else {
        // Additional parents (merge commits) get a new lane
        let parentLane = activeLanes.indexOf(parentHash);
        if (parentLane === -1) {
          // Claim a free lane for this parent
          parentLane = activeLanes.indexOf(null);
          if (parentLane === -1) {
            parentLane = activeLanes.length;
            activeLanes.push(null);
          }
          activeLanes[parentLane] = parentHash;
        }
        edges.push({
          fromRow: row,
          toRow: row + 1,
          fromLane: lane,
          toLane: parentLane,
          color: LANE_COLORS[parentLane % LANE_COLORS.length],
        });
      }
    });

    // If this is a root commit (no parents), free the lane
    if (commit.parentHashes.length === 0) {
      activeLanes[lane] = null;
    }

    result.push({ ...commit, row, lane, color, edges });
  });

  return result;
}
