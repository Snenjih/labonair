import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  ComputerIcon,
  Copy01Icon,
  Delete02Icon,
  Edit01Icon,
  Logout01Icon,
  PlayIcon,
  ServerStack01Icon,
  SlidersHorizontalIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { cn } from "@/lib/utils";
import type { CommandSnippet, SnippetExecMode } from "../types";

interface Props {
  snippet: CommandSnippet;
  hostName?: string;
  onRun: (snippet: CommandSnippet, mode?: SnippetExecMode) => void;
  onEdit: (snippet: CommandSnippet) => void;
  onDuplicate: (snippet: CommandSnippet) => void;
  onDelete: (snippet: CommandSnippet) => void;
}

export function SnippetItem({ snippet, hostName, onRun, onEdit, onDuplicate, onDelete }: Props) {
  const isSSH = snippet.target === "ssh";

  async function copyCommand() {
    await navigator.clipboard.writeText(snippet.command);
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          className="group flex cursor-default items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent/60"
          onDoubleClick={() => onRun(snippet)}
        >
          {/* Target indicator */}
          <HugeiconsIcon
            icon={isSSH ? ServerStack01Icon : ComputerIcon}
            size={13}
            strokeWidth={1.5}
            className={cn(
              "shrink-0",
              isSSH ? "text-blue-400/80" : "text-muted-foreground"
            )}
          />

          {/* Name + description */}
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium leading-tight">{snippet.name}</p>
            {snippet.description ? (
              <p className="truncate text-[10px] text-muted-foreground leading-tight">
                {snippet.description}
              </p>
            ) : (
              <p className="truncate font-mono text-[10px] text-muted-foreground/70 leading-tight">
                {snippet.command.split("\n")[0]}
              </p>
            )}
          </div>

          {/* Host badge */}
          {isSSH && hostName && (
            <span className="shrink-0 rounded bg-blue-500/15 px-1.5 py-0.5 text-[10px] text-blue-400 leading-none">
              {hostName}
            </span>
          )}
          {isSSH && !hostName && snippet.hostId && (
            <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground leading-none">
              SSH
            </span>
          )}

          {/* Run button (visible on hover) */}
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100"
            title={`Run (${snippet.defaultExecMode})`}
            onClick={(e) => {
              e.stopPropagation();
              onRun(snippet);
            }}
          >
            <HugeiconsIcon icon={PlayIcon} size={11} strokeWidth={2} />
          </Button>
        </div>
      </ContextMenuTrigger>

      <ContextMenuContent className="w-52">
        <ContextMenuItem onClick={() => onRun(snippet, "terminal")}>
          <HugeiconsIcon icon={Logout01Icon} size={13} strokeWidth={1.5} className="mr-2" />
          Run in Terminal
        </ContextMenuItem>
        <ContextMenuItem onClick={() => onRun(snippet, "silent")}>
          <HugeiconsIcon icon={SlidersHorizontalIcon} size={13} strokeWidth={1.5} className="mr-2" />
          Run Silently (log)
        </ContextMenuItem>
        <ContextMenuItem onClick={() => onRun(snippet, "inject")}>
          <HugeiconsIcon icon={PlayIcon} size={13} strokeWidth={1.5} className="mr-2" />
          Inject into Terminal
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={copyCommand}>
          <HugeiconsIcon icon={Copy01Icon} size={13} strokeWidth={1.5} className="mr-2" />
          Copy Command
        </ContextMenuItem>
        <ContextMenuItem onClick={() => onEdit(snippet)}>
          <HugeiconsIcon icon={Edit01Icon} size={13} strokeWidth={1.5} className="mr-2" />
          Edit
        </ContextMenuItem>
        <ContextMenuItem onClick={() => onDuplicate(snippet)}>
          <HugeiconsIcon icon={Copy01Icon} size={13} strokeWidth={1.5} className="mr-2" />
          Duplicate
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          className="text-destructive focus:text-destructive"
          onClick={() => onDelete(snippet)}
        >
          <HugeiconsIcon icon={Delete02Icon} size={13} strokeWidth={1.5} className="mr-2" />
          Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
