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
import type { CommandSnippet, SnippetExecMode } from "../types";

interface Props {
  snippet: CommandSnippet;
  hostName?: string;
  groupColor?: string | null;
  onRun: (snippet: CommandSnippet, mode?: SnippetExecMode) => void;
  onEdit: (snippet: CommandSnippet) => void;
  onDuplicate: (snippet: CommandSnippet) => void;
  onDelete: (snippet: CommandSnippet) => void;
}

export function SnippetItem({ snippet, hostName, groupColor, onRun, onEdit, onDuplicate, onDelete }: Props) {
  const isSSH = snippet.target === "ssh";
  const accentColor = groupColor ?? (isSSH ? "#60a5fa" : "#6366f1");
  const preview = snippet.description?.trim() || snippet.command.split("\n")[0];

  async function copyCommand() {
    await navigator.clipboard.writeText(snippet.command);
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          className="group relative cursor-default overflow-hidden rounded-md border border-border/40 bg-card transition-all duration-150 hover:border-border/80 hover:bg-card/80"
          style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.12)" }}
        >
          {/* Accent stripe with soft glow */}
          <div
            className="absolute inset-y-0 left-0 w-[3px]"
            style={{
              background: accentColor,
              opacity: 0.9,
              boxShadow: `2px 0 10px ${accentColor}55`,
            }}
          />

          <div className="px-3 pb-2.5 pl-4 pt-2.5">
            {/* Title + badge row */}
            <div className="mb-1 flex items-center gap-1.5">
              <HugeiconsIcon
                icon={isSSH ? ServerStack01Icon : ComputerIcon}
                size={11}
                strokeWidth={1.5}
                className="shrink-0 text-muted-foreground/50"
              />
              <span className="min-w-0 flex-1 truncate text-[13px] font-semibold leading-snug tracking-[-0.01em] text-foreground">
                {snippet.name}
              </span>
              {isSSH && hostName && (
                <span className="shrink-0 rounded border border-border/60 px-1.5 py-px font-mono text-[9px] leading-none text-muted-foreground">
                  {hostName}
                </span>
              )}
            </div>

            {/* Command preview */}
            <div className="mb-2.5 overflow-hidden rounded border border-border/30 bg-background/60 px-2 py-1">
              <p className="truncate font-mono text-[10px] leading-relaxed text-muted-foreground/70">
                {preview}
              </p>
            </div>

            {/* Footer: run + actions */}
            <div className="flex items-center gap-1.5">
              <Button
                variant="secondary"
                size="sm"
                className="h-[22px] gap-1 rounded px-2 text-[10px] font-semibold tracking-wide"
                onClick={(e) => {
                  e.stopPropagation();
                  onRun(snippet);
                }}
              >
                <HugeiconsIcon icon={PlayIcon} size={9} strokeWidth={2.5} />
                RUN
              </Button>

              <div className="flex-1" />

              <div className="flex items-center gap-0.5 opacity-0 transition-opacity duration-100 group-hover:opacity-100">
                <button
                  type="button"
                  title="Copy command"
                  className="flex h-[22px] w-[22px] items-center justify-center rounded text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground"
                  onClick={(e) => { e.stopPropagation(); void copyCommand(); }}
                >
                  <HugeiconsIcon icon={Copy01Icon} size={10} strokeWidth={1.5} />
                </button>
                <button
                  type="button"
                  title="Edit"
                  className="flex h-[22px] w-[22px] items-center justify-center rounded text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground"
                  onClick={(e) => { e.stopPropagation(); onEdit(snippet); }}
                >
                  <HugeiconsIcon icon={Edit01Icon} size={10} strokeWidth={1.5} />
                </button>
                <button
                  type="button"
                  title="Delete"
                  className="flex h-[22px] w-[22px] items-center justify-center rounded text-muted-foreground/60 transition-colors hover:bg-destructive/15 hover:text-destructive"
                  onClick={(e) => { e.stopPropagation(); onDelete(snippet); }}
                >
                  <HugeiconsIcon icon={Delete02Icon} size={10} strokeWidth={1.5} />
                </button>
              </div>
            </div>
          </div>
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
