import { cn } from "@/lib/utils";
import {
  Copy01Icon,
  Search01Icon,
  SparklesIcon,
  TerminalIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { BlockChromeSettings, PositionedBlock } from "./lib/types";

interface BlockChromeProps {
  block: PositionedBlock;
  isHovered: boolean;
  onHover: (id: string | null) => void;
  onCopyCommand: () => void;
  onCopyOutput: () => void;
  onSearch: () => void;
  onAttachToAi: () => void;
  settings: BlockChromeSettings;
}

function formatDuration(startedAt: number, finishedAt: number): string {
  const ms = finishedAt - startedAt;
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${m}m ${s}s`;
}

function shortCwd(cwd: string): string {
  const parts = cwd.split("/").filter(Boolean);
  if (parts.length <= 2) return cwd;
  return `…/${parts.slice(-2).join("/")}`;
}

export function BlockChrome({
  block,
  isHovered,
  onHover,
  onCopyCommand,
  onCopyOutput,
  onSearch,
  onAttachToAi,
  settings,
}: BlockChromeProps) {
  return (
    // pointer-events: none on the whole container — interactive children opt in
    <div
      className="pointer-events-none absolute left-0 right-0"
      style={{ top: 0 }}
    >
      {/* Divider line at block bottom */}
      <div
        className="absolute left-0 right-0 h-px border-t border-border"
        style={{ top: block.bottom - 1 }}
      />

      {/* Failed accent: 2px left border */}
      {settings.highlightFailed && block.isFailed && (
        <div
          className="absolute left-0 w-0.5 bg-destructive"
          style={{ top: block.top, height: block.bottom - block.top }}
        />
      )}

      {/* Header bar — pointer-events-auto so hover registers */}
      {settings.showHeader && (
        <div
          className={cn(
            "pointer-events-auto absolute left-0 right-0 flex h-6 items-center gap-2 px-2",
            "bg-background/60 backdrop-blur-sm border-b border-border/50",
            "transition-opacity duration-150",
            isHovered ? "opacity-100" : "opacity-70",
          )}
          style={{ top: block.headerTop }}
          onMouseEnter={() => onHover(block.id)}
          onMouseLeave={() => onHover(null)}
        >
          {/* Left: cwd */}
          {settings.showCwd && block.cwd && (
            <span className="shrink-0 font-mono text-xs text-muted-foreground">
              {shortCwd(block.cwd)}
            </span>
          )}

          {/* Center: command */}
          <span className="min-w-0 flex-1 truncate font-mono text-xs text-foreground/70">
            {block.command}
          </span>

          {/* Right: meta + toolbar */}
          <div className="pointer-events-auto flex shrink-0 items-center gap-1">
            {/* Duration */}
            {settings.showExecutionTime &&
              block.finishedAt !== null && (
                <span className="font-mono text-xs text-muted-foreground">
                  {formatDuration(block.startedAt, block.finishedAt)}
                </span>
              )}

            {/* Exit code badge */}
            {settings.showExitCode &&
              block.exitCode !== null &&
              block.exitCode !== 0 && (
                <span
                  className={cn(
                    "rounded px-1 py-0.5 font-mono text-[10px] leading-none",
                    "bg-destructive/10 text-destructive",
                  )}
                >
                  {block.exitCode}
                </span>
              )}

            {/* Toolbar — visible only when hovered */}
            {isHovered && (
              <div className="flex items-center gap-0.5">
                <IconButton
                  title="Copy command"
                  icon={Copy01Icon}
                  onClick={onCopyCommand}
                />
                <IconButton
                  title="Copy output"
                  icon={TerminalIcon}
                  onClick={onCopyOutput}
                />
                <IconButton
                  title="Search in block"
                  icon={Search01Icon}
                  onClick={onSearch}
                />
                <IconButton
                  title="Attach to AI"
                  icon={SparklesIcon}
                  onClick={onAttachToAi}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function IconButton({
  title,
  icon,
  onClick,
}: {
  title: string;
  icon: typeof Copy01Icon;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        "flex h-5 w-5 items-center justify-center rounded",
        "text-muted-foreground hover:bg-accent hover:text-foreground",
        "transition-colors duration-100",
      )}
    >
      <HugeiconsIcon icon={icon} size={12} strokeWidth={1.75} />
    </button>
  );
}
