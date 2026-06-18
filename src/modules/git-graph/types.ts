import type { CommitInfo } from "@/modules/source-control/types";

export type { CommitInfo };

export type GraphEdge =
  | { kind: "straight"; lane: number; color: string }
  | { kind: "merge"; fromLane: number; toLane: number; color: string }
  | { kind: "branch"; fromLane: number; toLane: number; color: string };

export interface LayoutCommit extends CommitInfo {
  row: number;
  lane: number;
  color: string;
  laneCount: number;
  topEdges: GraphEdge[];
  bottomEdges: GraphEdge[];
}
