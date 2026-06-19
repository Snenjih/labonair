import type { CommitInfo } from "@/modules/source-control/types";

export type { CommitInfo };

export type GraphEdge =
  | { kind: "straight"; lane: number; colorIndex: number }
  | { kind: "merge"; fromLane: number; toLane: number; colorIndex: number }
  | { kind: "branch"; fromLane: number; toLane: number; colorIndex: number };

export interface LayoutCommit extends CommitInfo {
  row: number;
  lane: number;
  colorIndex: number;
  laneCount: number;
  topEdges: GraphEdge[];
  bottomEdges: GraphEdge[];
}
