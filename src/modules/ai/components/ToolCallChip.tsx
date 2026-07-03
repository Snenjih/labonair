import { cn } from "@/lib/utils";
import {
  ArrowDown01Icon,
  Cancel01Icon,
  Edit02Icon,
  FileEditIcon,
  FilePlusIcon,
  FolderAddIcon,
  Search01Icon,
  TerminalIcon,
  Tick02Icon,
  ToolsIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";

const TOOL_META: Record<string, { label: string; icon: typeof ToolsIcon }> = {
  write_file: { label: "Write file", icon: FilePlusIcon },
  edit: { label: "Edit file", icon: FileEditIcon },
  multi_edit: { label: "Edit file (batch)", icon: Edit02Icon },
  create_directory: { label: "Create directory", icon: FolderAddIcon },
  bash_run: { label: "Run command", icon: TerminalIcon },
  bash_background: { label: "Background process", icon: TerminalIcon },
  bash_list: { label: "List processes", icon: TerminalIcon },
  bash_logs: { label: "Tail logs", icon: TerminalIcon },
  bash_kill: { label: "Kill process", icon: TerminalIcon },
  read_file: { label: "Read file", icon: FileEditIcon },
  list_directory: { label: "List directory", icon: FolderAddIcon },
  grep: { label: "Search", icon: Search01Icon },
  glob: { label: "Find files", icon: Search01Icon },
  suggest_command: { label: "Suggest command", icon: TerminalIcon },
  open_preview: { label: "Open preview", icon: ToolsIcon },
  todo_write: { label: "Update tasks", icon: ToolsIcon },
  run_subagent: { label: "Run subagent", icon: ToolsIcon },
};

// Tools whose output is worth expanding — others just show a success chip.
const EXPANDABLE_TOOLS = new Set([
  "bash_run",
  "bash_background",
  "bash_logs",
  "read_file",
  "list_directory",
  "grep",
  "glob",
]);

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function buildSummary(toolName: string, input: Record<string, unknown>, output: unknown): string {
  const out = output as Record<string, unknown> | null;

  switch (toolName) {
    case "read_file": {
      const path = String(input.path ?? "");
      return path.split("/").pop() ?? path;
    }
    case "list_directory": {
      const path = String(input.path ?? "");
      const parts = path.split("/");
      const dirname = parts[parts.length - 1] || path || ".";
      const entries = Array.isArray(out) ? out.length : null;
      return entries !== null ? `${dirname} — ${entries} entries` : dirname;
    }
    case "bash_run":
    case "bash_background": {
      const cmd = String(input.command ?? "");
      const truncated = cmd.length > 50 ? `${cmd.slice(0, 50)}…` : cmd;
      const exitCode =
        out && typeof out === "object" && "exit_code" in out
          ? (out as { exit_code: number | null }).exit_code
          : null;
      if (exitCode !== null && exitCode !== 0) return `${truncated} — exit ${exitCode}`;
      return truncated;
    }
    case "grep": {
      const outObj = out as { hits?: unknown[]; files_scanned?: number } | null;
      const hitCount = outObj?.hits?.length ?? null;
      if (hitCount !== null) {
        const files = outObj?.files_scanned ?? "?";
        return `${hitCount} match${hitCount === 1 ? "" : "es"} in ${files} files`;
      }
      return String(input.pattern ?? "");
    }
    case "glob": {
      const outObj = out as { hits?: unknown[] } | null;
      const hitCount = outObj?.hits?.length ?? null;
      if (hitCount !== null) return `${hitCount} file${hitCount === 1 ? "" : "s"} found`;
      return String(input.pattern ?? "");
    }
    case "write_file": {
      const path = String(input.path ?? "");
      const filename = path.split("/").pop() ?? path;
      const bytes =
        out && typeof out === "object" && "bytesWritten" in out
          ? (out as { bytesWritten: number }).bytesWritten
          : null;
      return bytes !== null ? `${filename} — ${formatBytes(bytes)}` : filename;
    }
    case "edit":
    case "multi_edit": {
      const path = String(input.path ?? "");
      return path.split("/").pop() ?? path;
    }
    case "create_directory": {
      const path = String(input.path ?? "");
      return path.split("/").pop() ?? path;
    }
    default:
      return TOOL_META[toolName]?.label ?? toolName;
  }
}

function ExpandedDetail({
  toolName,
  output,
  errorText,
}: {
  toolName: string;
  output: unknown;
  errorText?: string;
}) {
  if (errorText) {
    return (
      <div className="pt-2.5">
        <pre className="overflow-auto rounded bg-destructive/5 p-2 font-mono text-[10.5px] leading-relaxed text-destructive/80">
          {errorText}
        </pre>
      </div>
    );
  }

  const out = output as Record<string, unknown> | null;

  if (toolName === "bash_run" || toolName === "bash_background" || toolName === "bash_logs") {
    const stdout = String(out?.stdout ?? out?.bytes ?? "");
    const stderr = String(out?.stderr ?? "");
    const exitCode = out?.exit_code;
    const cwdAfter = typeof out?.cwd_after === "string" ? out.cwd_after : null;
    return (
      <div className="space-y-1.5 pt-2.5">
        {cwdAfter && <div className="font-mono text-[10px] text-muted-foreground">{String(cwdAfter)}</div>}
        {stdout && (
          <pre className="max-h-48 overflow-auto rounded bg-muted/50 p-2 font-mono text-[10.5px] leading-relaxed">
            {stdout}
          </pre>
        )}
        {stderr && (
          <pre className="max-h-32 overflow-auto rounded bg-destructive/5 p-2 font-mono text-[10.5px] leading-relaxed text-destructive/80">
            {stderr}
          </pre>
        )}
        {exitCode !== undefined && exitCode !== null && (
          <div
            className={cn(
              "text-[10px]",
              Number(exitCode) === 0 ? "text-muted-foreground" : "text-destructive",
            )}
          >
            exit {String(exitCode)}
          </div>
        )}
      </div>
    );
  }

  if (toolName === "read_file") {
    const error = out && "error" in out ? String(out.error) : null;
    if (error) {
      return <div className="pt-2.5 font-mono text-[10.5px] text-destructive/80">{error}</div>;
    }
    const content = String(out?.content ?? "");
    if (!content) return null;
    const lines = content.split("\n");
    const preview = lines.slice(0, 30).join("\n");
    const extra = lines.length - 30;
    return (
      <div className="pt-2.5">
        <pre className="max-h-48 overflow-auto rounded bg-muted/50 p-2 font-mono text-[10.5px] leading-relaxed">
          {preview}
          {extra > 0 ? `\n… (+${extra} lines)` : ""}
        </pre>
      </div>
    );
  }

  if (toolName === "list_directory") {
    const entries = Array.isArray(out) ? (out as Array<{ name: string; kind: string }>) : [];
    return (
      <div className="max-h-48 overflow-auto pt-2.5">
        {entries.slice(0, 40).map((e) => (
          <div key={e.name} className="flex gap-2 font-mono text-[10px]">
            <span className="w-3 shrink-0 text-muted-foreground">{e.kind === "dir" ? "d" : "f"}</span>
            <span className="text-foreground/80">{e.name}</span>
          </div>
        ))}
        {entries.length > 40 && (
          <div className="mt-1 text-[10px] text-muted-foreground">…and {entries.length - 40} more</div>
        )}
      </div>
    );
  }

  if (toolName === "grep") {
    type GrepHit = { path?: string; rel?: string; line?: number; text?: string };
    const outObj = out as { hits?: GrepHit[]; truncated?: boolean } | null;
    const hits = outObj?.hits ?? [];
    const shown = hits.slice(0, 25);
    return (
      <div className="max-h-48 overflow-auto space-y-0.5 pt-2.5">
        {shown.map((hit, i) => (
          <div
            key={`${hit.rel ?? hit.path ?? ""}:${hit.line ?? i}`}
            className="flex min-w-0 gap-2 font-mono text-[10px]"
          >
            <span className="shrink-0 text-muted-foreground">
              {hit.rel ?? hit.path ?? ""}:{hit.line ?? ""}
            </span>
            <span className="truncate text-foreground/80">{String(hit.text ?? "").trim()}</span>
          </div>
        ))}
        {hits.length > 25 && (
          <div className="text-[10px] text-muted-foreground">…and {hits.length - 25} more</div>
        )}
        {outObj?.truncated && <div className="text-[10px] text-muted-foreground">Results truncated</div>}
      </div>
    );
  }

  if (toolName === "glob") {
    type GlobHit = { path?: string; rel?: string };
    const outObj = out as { hits?: GlobHit[]; truncated?: boolean } | null;
    const hits = outObj?.hits ?? [];
    return (
      <div className="max-h-48 overflow-auto space-y-0.5 pt-2.5">
        {hits.slice(0, 30).map((hit) => (
          <div key={hit.rel ?? hit.path} className="font-mono text-[10px] text-foreground/80">
            {hit.rel ?? hit.path ?? ""}
          </div>
        ))}
        {hits.length > 30 && (
          <div className="text-[10px] text-muted-foreground">…and {hits.length - 30} more</div>
        )}
        {outObj?.truncated && <div className="text-[10px] text-muted-foreground">Results truncated</div>}
      </div>
    );
  }

  return null;
}

interface Props {
  toolName: string;
  state: string;
  input: Record<string, unknown>;
  output?: unknown;
  errorText?: string;
}

export function ToolCallChip({ toolName, state, input, output, errorText }: Props) {
  const [expanded, setExpanded] = useState(false);

  const meta = TOOL_META[toolName];
  const Icon = meta?.icon ?? ToolsIcon;

  const isSuccess = state === "output-available";
  const isError = state === "output-error";
  const isDenied = state === "denied";
  const isPending = !isSuccess && !isError && !isDenied;

  const canExpand = (isSuccess && EXPANDABLE_TOOLS.has(toolName)) || isError;

  const summary = isSuccess || isError ? buildSummary(toolName, input, output) : (meta?.label ?? toolName);

  return (
    <div
      className={cn(
        "rounded-md border text-[11px]",
        isSuccess && "border-border/50 bg-card",
        isError && "border-destructive/30 bg-destructive/5",
        isDenied && "border-border/30 bg-muted/30 opacity-60",
        isPending && "border-border/40 bg-muted/20",
      )}
    >
      <button
        type="button"
        disabled={!canExpand}
        onClick={() => canExpand && setExpanded((v) => !v)}
        className={cn(
          "flex w-full items-center gap-2 px-2.5 py-1.5 text-left",
          canExpand && "cursor-pointer hover:bg-muted/30 rounded-md",
          !canExpand && "cursor-default",
          expanded && "rounded-b-none",
        )}
      >
        {isPending && <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-info/70" />}
        {isSuccess && (
          <HugeiconsIcon icon={Tick02Icon} size={11} strokeWidth={2.5} className="shrink-0 text-success" />
        )}
        {(isError || isDenied) && (
          <HugeiconsIcon
            icon={Cancel01Icon}
            size={11}
            strokeWidth={2.5}
            className={cn("shrink-0", isError ? "text-destructive" : "text-muted-foreground")}
          />
        )}

        <HugeiconsIcon
          icon={Icon}
          size={12}
          strokeWidth={1.75}
          className={cn(
            "shrink-0",
            (isSuccess || isPending) && "text-muted-foreground",
            isError && "text-destructive/60",
            isDenied && "text-muted-foreground/50",
          )}
        />

        <span
          className={cn(
            "min-w-0 flex-1 truncate font-mono",
            isSuccess && "text-foreground/80",
            isError && "text-destructive/80",
            isDenied && "text-muted-foreground line-through",
            isPending && "text-muted-foreground",
          )}
        >
          {summary}
        </span>

        {isDenied && <span className="shrink-0 text-[10px] text-muted-foreground">Denied</span>}

        {canExpand && (
          <HugeiconsIcon
            icon={ArrowDown01Icon}
            size={10}
            strokeWidth={2}
            className={cn(
              "shrink-0 text-muted-foreground transition-transform duration-150",
              expanded && "rotate-180",
            )}
          />
        )}
      </button>

      {expanded && canExpand && (
        <div className="border-t border-border/40 px-2.5 pb-2.5">
          <ExpandedDetail toolName={toolName} output={output} errorText={errorText} />
        </div>
      )}
    </div>
  );
}
