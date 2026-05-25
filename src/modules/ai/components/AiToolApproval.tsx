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
import { motion } from "motion/react";
import type { ToolUIPart } from "ai";
import { memo, useEffect, useState } from "react";

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

  const [responded, setResponded] = useState<"approve" | "deny" | null>(null);

  const handleRespond = (approved: boolean) => {
    setResponded(approved ? "approve" : "deny");
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "Enter") handleRespond(true);
      if (e.key === "Escape") handleRespond(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <motion.div
      animate={
        responded === "approve"
          ? { backgroundColor: "oklch(0.7 0.15 145 / 0.1)" }
          : responded === "deny"
            ? { backgroundColor: "oklch(0.55 0.2 27 / 0.1)" }
            : {}
      }
      onAnimationComplete={() => {
        if (responded !== null) onRespond(responded === "approve");
      }}
      transition={{ duration: 0.15 }}
      className={cn(
        "rounded-lg border bg-card shadow-sm",
        destructiveWarning ? "border-amber-500/60" : "border-border",
      )}
    >
      <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
        <span className="size-1.5 shrink-0 rounded-full bg-amber-500 animate-pulse" />
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
          <span className="ml-1 flex items-center gap-1 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
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

      <div className="flex items-center justify-between border-t border-border/60 px-3 py-2">
        <span className="text-[10px] text-muted-foreground/50 select-none">
          ↵ Approve · Esc Deny
        </span>
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => handleRespond(false)}
            className="h-7 gap-1.5 text-[11px]"
          >
            <HugeiconsIcon icon={Cancel01Icon} size={12} strokeWidth={2} />
            Deny
          </Button>
          <Button
            size="sm"
            variant="default"
            onClick={() => handleRespond(true)}
            className="h-7 gap-1.5 text-[11px]"
          >
            <HugeiconsIcon icon={Tick02Icon} size={12} strokeWidth={2} />
            Approve
          </Button>
        </div>
      </div>
    </motion.div>
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
    const removed = oldStr ? oldStr.split("\n").length : 0;
    const added = newStr ? newStr.split("\n").length : 0;
    return (
      <div className="space-y-0.5 font-mono text-[11px]">
        <div className="text-muted-foreground">
          {String(input.path ?? "")}
          {input.replace_all ? " · replace all" : ""}
        </div>
        <div className="text-[10.5px] text-muted-foreground/80">
          −{removed} / +{added} line{added === 1 && removed === 1 ? "" : "s"} ·
          review in the diff tab
        </div>
      </div>
    );
  }
  if (toolName === "multi_edit") {
    const edits = Array.isArray(input.edits)
      ? (input.edits as Array<{ old_string?: string; new_string?: string }>)
      : [];
    return (
      <div className="space-y-0.5 font-mono text-[11px]">
        <div className="text-muted-foreground">{String(input.path ?? "")}</div>
        <div className="text-[10.5px] text-muted-foreground/80">
          {edits.length} edit{edits.length === 1 ? "" : "s"} · review in the
          diff tab
        </div>
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

