import { cn } from "@/lib/utils";
import {
  ArrowReloadHorizontalIcon,
  Copy01Icon,
  Copy02Icon,
  Search01Icon,
  SparklesIcon,
  Tick01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useRef, useState } from "react";
import type { BlockChromeSettings, PositionedBlock } from "./lib/types";

interface BlockChromeProps {
  block: PositionedBlock;
  isHovered: boolean;
  isSelected: boolean;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
  onCopyCommand: () => void;
  onCopyOutput: () => void;
  onSearch: () => void;
  onAttachToAi: () => void;
  onRerun?: () => void;
  settings: BlockChromeSettings;
}

function formatDuration(startedAt: number, finishedAt: number | null): string {
  const ms = (finishedAt ?? Date.now()) - startedAt;
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${m}m ${s}s`;
}

function shortCwd(cwd: string): string {
  const parts = cwd.split("/").filter(Boolean);
  if (parts.length === 0) return "~";
  if (parts.length <= 2) return `~/${parts.join("/")}`;
  return `~/${parts.slice(-2).join("/")}`;
}

export function BlockChrome({
  block,
  isHovered,
  isSelected,
  onHover,
  onSelect,
  onCopyCommand,
  onCopyOutput,
  onSearch,
  onAttachToAi,
  onRerun,
  settings,
}: BlockChromeProps) {
  // No chrome while the command is running — chrome lands with the divider once finished
  if (block.isRunning) return null;

  return (
    <BlockChromeInner
      block={block}
      isHovered={isHovered}
      isSelected={isSelected}
      onHover={onHover}
      onSelect={onSelect}
      onCopyCommand={onCopyCommand}
      onCopyOutput={onCopyOutput}
      onSearch={onSearch}
      onAttachToAi={onAttachToAi}
      onRerun={onRerun}
      settings={settings}
    />
  );
}

function BlockChromeInner({
  block,
  isHovered,
  isSelected,
  onHover,
  onSelect,
  onCopyCommand,
  onCopyOutput,
  onSearch,
  onAttachToAi,
  onRerun,
  settings,
}: BlockChromeProps) {
  const [copiedId, setCopiedId] = useState<"cmd" | "out" | null>(null);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    };
  }, []);

  const flash = (id: "cmd" | "out") => {
    if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    setCopiedId(id);
    copiedTimerRef.current = setTimeout(() => setCopiedId(null), 1400);
  };

  return (
    <div
      className="pointer-events-none absolute left-0 right-0"
      style={{ top: 0 }}
    >
      {/* Divider line at block bottom — destructive color on failure */}
      <div
        className={cn(
          "bt-divider",
          block.isFailed && settings.highlightFailed && "bt-divider-fail",
        )}
        style={{ top: block.bottom }}
      />

      {/* Header bar */}
      {settings.showHeader && (
        <div
          className={cn(
            "pointer-events-auto absolute left-0 right-0 flex items-center gap-2 px-2",
            settings.compactHeaders ? "h-5" : "h-6",
            "bg-background border-b border-border",
            "transition-colors duration-150",
            isSelected && "bg-accent/30",
            isHovered && !isSelected && "opacity-100",
            !isHovered && !isSelected && "opacity-80",
          )}
          style={{ top: block.headerTop }}
          onMouseEnter={() => onHover(block.id)}
          onMouseLeave={() => onHover(null)}
          onClick={() => onSelect(block.id)}
        >
          {/* Left: cwd + command */}
          <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
            {block.cwd && settings.showCwd && (
              <span className="mr-2">{shortCwd(block.cwd)}</span>
            )}
            <span className="text-foreground/70">{block.command}</span>
          </span>

          {/* Right: meta + toolbar */}
          <div className="pointer-events-auto flex shrink-0 items-center gap-1">
            {/* Duration */}
            {settings.showExecutionTime && (
              <span className="font-mono text-xs tabular-nums text-muted-foreground">
                {formatDuration(block.startedAt, block.finishedAt)}
              </span>
            )}

            {/* Exit code badge */}
            {settings.showExitCode && block.exitCode !== null && (
              <span
                className={cn(
                  "rounded px-1 py-0.5 font-mono text-[10px] leading-none tabular-nums",
                  block.exitCode === 0
                    ? "bg-primary/10 text-primary"
                    : "bg-destructive/10 text-destructive",
                )}
              >
                {block.exitCode}
              </span>
            )}

            {/* Toolbar — visible only when hovered or selected */}
            {(isHovered || isSelected) && (
              <div className="flex items-center gap-0.5">
                <IconButton
                  title="Copy command"
                  icon={copiedId === "cmd" ? Tick01Icon : Copy01Icon}
                  onClick={(e) => { e.stopPropagation(); onCopyCommand(); flash("cmd"); }}
                />
                <IconButton
                  title="Copy output"
                  icon={copiedId === "out" ? Tick01Icon : Copy02Icon}
                  onClick={(e) => { e.stopPropagation(); onCopyOutput(); flash("out"); }}
                />
                <IconButton
                  title="Search in block"
                  icon={Search01Icon}
                  onClick={(e) => { e.stopPropagation(); onSearch(); }}
                />
                {onRerun && (
                  <IconButton
                    title="Re-run command"
                    icon={ArrowReloadHorizontalIcon}
                    onClick={(e) => { e.stopPropagation(); onRerun(); }}
                  />
                )}
                <IconButton
                  title="Attach to AI"
                  icon={SparklesIcon}
                  onClick={(e) => { e.stopPropagation(); onAttachToAi(); }}
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
  onClick: (e: React.MouseEvent) => void;
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
