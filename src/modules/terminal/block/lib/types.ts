export interface BlockMeta {
  id: string;
  command: string;
  cwd: string;
  exitCode: number | null;
  startLine: number;
  endLine: number;
  startedAt: number;
  finishedAt: number | null;
}

export type BlockMode = "prompt" | "running" | "alt";

export interface PositionedBlock extends BlockMeta {
  top: number;
  bottom: number;
  headerTop: number;
  isRunning: boolean;
  isFailed: boolean;
}

export interface VisibleBlocks {
  blocks: PositionedBlock[];
  sticky: PositionedBlock | null;
}

export interface BlockChromeSettings {
  showHeader: boolean;
  showExitCode: boolean;
  showExecutionTime: boolean;
  showCwd: boolean;
  compactHeaders: boolean;
  highlightFailed: boolean;
  autoCollapseOnAltScreen: boolean;
}

export const HEADER_HEIGHT_PX = 24;
export const HEADER_HEIGHT_COMPACT_PX = 20;

export interface BlockMatch {
  blockId: string;
  absoluteLine: number;
  start: number;
  end: number;
  preview: string;
}

export interface BlockContext {
  command: string;
  output: string;
  cwd: string;
  exitCode: number | null;
}
