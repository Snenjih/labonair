export type SnippetTarget = "local" | "ssh";
export type SnippetExecMode = "terminal" | "silent" | "inject";

export interface CommandSnippet {
  id: string;
  name: string;
  description?: string | null;
  command: string;
  target: SnippetTarget;
  hostId?: string | null;
  defaultExecMode: SnippetExecMode;
  workingDir?: string | null;
  groupId?: string | null;
  tags?: string | null; // JSON array string
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

export interface SnippetGroup {
  id: string;
  name: string;
  icon?: string | null;
  color?: string | null;
  sortOrder: number;
  createdAt: number;
}

export interface SnippetReorderItem {
  id: string;
  sortOrder: number;
}

export type SnippetRunStatus = "running" | "done" | "error" | "cancelled";

/** A `${VAR_NAME}` (or `${VAR_NAME:-default}`) placeholder found in a snippet's command. */
export interface SnippetVariable {
  name: string;
  defaultValue: string | null;
}

export interface SnippetRunLog {
  runId: string;
  snippetName: string;
  startedAt: number;
  status: SnippetRunStatus;
  exitCode?: number;
  lines: Array<{ data: string; stream: "stdout" | "stderr" }>;
}
