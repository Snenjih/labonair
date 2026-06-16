import type { CommitInfo } from "@/modules/source-control/types";

export type { CommitInfo };

export interface Edge {
  fromRow: number;
  toRow: number;
  fromLane: number;
  toLane: number;
  color: string;
}

export interface LayoutCommit extends CommitInfo {
  row: number;
  lane: number;
  color: string;
  edges: Edge[]; // edges going DOWN from this commit to its parents
}
