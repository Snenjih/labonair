import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { checkDestructiveCommand } from "@/modules/ai/lib/security";
import { usePreferencesStore } from "@/modules/settings/preferences";
import {
  Cancel01Icon,
  Edit02Icon,
  FileEditIcon,
  FilePlusIcon,
  FolderAddIcon,
  TerminalIcon,
  Tick02Icon,
  ToolsIcon,
  Alert02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ToolUIPart } from "ai";
import { memo } from "react";

type Props = {
  part: Extract<ToolUIPart, { state: "approval-requested" }>;
  toolName: string;
  onRespond: (approved: boolean) => void;
};

const TOOL_META: Record<string, { label: string; icon: typeof FilePlusIcon }> =
  {
    write_file: { label: "Write file", icon: FilePlusIcon },
    edit: { label: "Edit file", icon: FileEditIcon },
    multi_edit: { label: "Edit file (batch)", icon: Edit02Icon },
    create_directory: { label: "Create directory", icon: FolderAddIcon },
    bash_run: { label: "Run shell command", icon: TerminalIcon },
    bash_background: { label: "Spawn background process", icon: TerminalIcon },
  };

function AiToolApprovalImpl({ part, toolName, onRespond }: Props) {
  const meta = TOOL_META[toolName];
  const label = meta?.label ?? toolName;
  const Icon = meta?.icon ?? ToolsIcon;
  const input = part.input as Record<string, unknown>;
  const warnDestructive = usePreferencesStore((s) => s.aiWarnDestructiveCommands);

  const isShellTool = toolName === "bash_run" || toolName === "bash_background";
  const cmd = isShellTool ? String(input.command ?? "") : null;
  const destructiveWarning =
    warnDestructive && cmd ? checkDestructiveCommand(cmd) : null;

  return (
    <div className={cn(
      "rounded-lg border bg-card shadow-sm",
      destructiveWarning ? "border-warning/60" : "border-border",
    )}>
      <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
        <span className="size-1.5 shrink-0 rounded-full bg-warning animate-pulse" />
        <HugeiconsIcon
          icon={Icon}
          size={13}
          strokeWidth={1.75}
          className="shrink-0 text-muted-foreground"
        />
        <span className="text-[12px] font-medium text-foreground">
          {label}
        </span>
        {destructiveWarning && (
          <span className="ml-1 flex items-center gap-1 rounded bg-warning/15 px-1.5 py-0.5 text-[10px] font-medium text-warning">
            <HugeiconsIcon icon={Alert02Icon} size={10} strokeWidth={2} />
            {destructiveWarning}
          </span>
        )}
        <span className="ml-auto text-[10px] text-muted-foreground">
          needs approval
        </span>
      </div>

      <div className="px-3 py-2.5">
        <PreviewBlock toolName={toolName} input={input} />
      </div>

      <div className="flex items-center justify-end gap-1.5 border-t border-border/60 px-3 py-2">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onRespond(false)}
          className="h-7 gap-1.5 text-[11px]"
        >
          <HugeiconsIcon icon={Cancel01Icon} size={12} strokeWidth={2} />
          Deny
        </Button>
        <Button
          size="sm"
          variant="default"
          onClick={() => onRespond(true)}
          className="h-7 gap-1.5 text-[11px]"
        >
          <HugeiconsIcon icon={Tick02Icon} size={12} strokeWidth={2} />
          Approve
        </Button>
      </div>
    </div>
  );
}

export const AiToolApproval = memo(AiToolApprovalImpl, (a, b) => {
  // The approval card never changes content for a given approvalId — once
  // the model has emitted the approval-requested part with its input, we
  // don't want to re-render on every downstream token.
  return (
    a.toolName === b.toolName &&
    a.part.approval.id === b.part.approval.id &&
    a.onRespond === b.onRespond
  );
});

function InlineDiff({
  oldLines,
  newLines,
}: {
  oldLines: string[];
  newLines: string[];
}) {
  return (
    <div className="overflow-hidden rounded-md border border-border/40 font-mono text-[10.5px]">
      {oldLines.map((line, i) => (
        <div
          key={`r${i}`}
          className="border-l-2 border-error/50 bg-error/8 px-2 py-px leading-relaxed text-error"
        >
          <span className="mr-2 select-none text-error/60">−</span>
          {line}
        </div>
      ))}
      {newLines.map((line, i) => (
        <div
          key={`a${i}`}
          className="border-l-2 border-success/50 bg-success/8 px-2 py-px leading-relaxed text-success"
        >
          <span className="mr-2 select-none text-success/60">+</span>
          {line}
        </div>
      ))}
    </div>
  );
}

function PreviewBlock({
  toolName,
  input,
}: {
  toolName: string;
  input: Record<string, unknown>;
}) {
  if (toolName === "bash_run" || toolName === "bash_background") {
    const cwd = typeof input.cwd === "string" ? input.cwd : null;
    return (
      <div className="space-y-1.5">
        {cwd && (
          <div className="font-mono text-[10.5px] text-muted-foreground">
            {cwd}
          </div>
        )}
        <pre
          className={cn(
            "max-h-40 overflow-auto rounded-md bg-muted/60 p-2 font-mono text-[11px] leading-relaxed",
          )}
        >
          {String(input.command ?? "")}
        </pre>
      </div>
    );
  }
  // For file mutations we deliberately do NOT preview content here —
  // streamed write/edit content thrashes the UI and the AI diff tab is the
  // authoritative place to review the change. Show just the path + a
  // one-line size hint so the user knows what's being touched.
  if (toolName === "write_file") {
    const content = typeof input.content === "string" ? input.content : "";
    const lines = content ? content.split("\n").length : 0;
    return (
      <div className="space-y-0.5 font-mono text-[11px]">
        <div className="text-muted-foreground">{String(input.path ?? "")}</div>
        <div className="text-[10.5px] text-muted-foreground/80">
          {lines} line{lines === 1 ? "" : "s"} · review in the diff tab
        </div>
      </div>
    );
  }
  if (toolName === "edit") {
    const oldStr = typeof input.old_string === "string" ? input.old_string : "";
    const newStr = typeof input.new_string === "string" ? input.new_string : "";
    const oldLines = oldStr ? oldStr.split("\n") : [];
    const newLines = newStr ? newStr.split("\n") : [];
    const showInline = Math.max(oldLines.length, newLines.length) <= 15;
    return (
      <div className="space-y-1.5 font-mono text-[11px]">
        <div className="text-muted-foreground">
          {String(input.path ?? "")}
          {input.replace_all ? " · replace all" : ""}
        </div>
        {showInline ? (
          <InlineDiff oldLines={oldLines} newLines={newLines} />
        ) : (
          <div className="text-[10.5px] text-muted-foreground/80">
            −{oldLines.length} / +{newLines.length} line{oldLines.length === 1 && newLines.length === 1 ? "" : "s"} ·
            review in the diff tab
          </div>
        )}
      </div>
    );
  }
  if (toolName === "multi_edit") {
    const edits = Array.isArray(input.edits)
      ? (input.edits as Array<{ old_string?: string; new_string?: string }>)
      : [];
    const totalLines = edits.reduce((sum, e) => {
      const o = e.old_string?.split("\n").length ?? 0;
      const n = e.new_string?.split("\n").length ?? 0;
      return sum + Math.max(o, n);
    }, 0);
    const showInline = totalLines <= 15 && edits.length > 0;
    return (
      <div className="space-y-1.5 font-mono text-[11px]">
        <div className="text-muted-foreground">{String(input.path ?? "")}</div>
        {showInline ? (
          <div className="space-y-2">
            {edits.map((e, i) => (
              <InlineDiff
                key={i}
                oldLines={e.old_string?.split("\n") ?? []}
                newLines={e.new_string?.split("\n") ?? []}
              />
            ))}
          </div>
        ) : (
          <div className="text-[10.5px] text-muted-foreground/80">
            {edits.length} edit{edits.length === 1 ? "" : "s"} · review in the
            diff tab
          </div>
        )}
      </div>
    );
  }
  if (toolName === "create_directory") {
    return (
      <div className="font-mono text-[11px] text-muted-foreground">
        {String(input.path ?? "")}
      </div>
    );
  }
  return (
    <pre className="overflow-auto rounded-md bg-muted/60 p-2 font-mono text-[11px] leading-relaxed">
      {JSON.stringify(input, null, 2)}
    </pre>
  );
}

