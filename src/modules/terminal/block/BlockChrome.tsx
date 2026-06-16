import { cn } from "@/lib/utils";
import {
  ArrowReloadHorizontalIcon,
  ArrowRight01Icon,
  Copy01Icon,
  Copy02Icon,
  Search01Icon,
  SparklesIcon,
  Tick01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useRef, useState } from "react";
import type { BlockChromeSettings, PositionedBlock } from "./lib/types";
import { HEADER_HEIGHT_COMPACT_PX, HEADER_HEIGHT_PX } from "./lib/types";

interface BlockChromeProps {
  block: PositionedBlock;
  isHovered: boolean;
  isSelected: boolean;
  isCollapsed: boolean;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
  onToggleCollapse: (id: string) => void;
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
  if (parts.length <= 2) return cwd;
  return `…/${parts.slice(-2).join("/")}`;
}

export function BlockChrome({
  block,
  isHovered,
  isSelected,
  isCollapsed,
  onHover,
  onSelect,
  onToggleCollapse,
  onCopyCommand,
  onCopyOutput,
  onSearch,
  onAttachToAi,
  onRerun,
  settings,
}: BlockChromeProps) {
  // Live duration ticker for running blocks
  const [, setTick] = useState(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (!block.isRunning) {
      if (tickRef.current) clearInterval(tickRef.current);
      return;
    }
    tickRef.current = setInterval(() => setTick((t) => t + 1), 500);
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [block.isRunning]);

  // Fix 4: copy feedback state
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

  // Fix 1: compact header height
  const headerH = settings.compactHeaders ? HEADER_HEIGHT_COMPACT_PX : HEADER_HEIGHT_PX;

  return (
    <div
      className="pointer-events-none absolute left-0 right-0"
      style={{ top: 0 }}
    >
      {/* Divider line at block bottom — hidden when collapsed */}
      {!isCollapsed && (
        <div
          className="absolute left-0 right-0 h-px border-t border-border"
          style={{ top: block.bottom - 1 }}
        />
      )}

      {/* Failed accent: 2px left border */}
      {settings.highlightFailed && block.isFailed && !isCollapsed && (
        <div
          className="absolute left-0 w-0.5 bg-destructive"
          style={{ top: block.top, height: block.bottom - block.top }}
        />
      )}

      {/* Collapse mask — covers block body when collapsed */}
      {isCollapsed && (
        <div
          className="absolute left-0 right-0 bg-background border-b border-border"
          style={{
            top: block.headerTop + headerH,
            height: Math.max(0, block.bottom - (block.headerTop + headerH)),
          }}
        />
      )}

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
          {/* Collapse toggle chevron */}
          <button
            type="button"
            title={isCollapsed ? "Expand block" : "Collapse block"}
            onClick={(e) => {
              e.stopPropagation();
              if (!block.isRunning) onToggleCollapse(block.id);
            }}
            disabled={block.isRunning}
            className={cn(
              "flex h-4 w-4 shrink-0 items-center justify-center rounded",
              "text-muted-foreground/60 hover:text-foreground transition-colors duration-100",
              block.isRunning && "cursor-default opacity-30",
            )}
          >
            <HugeiconsIcon
              icon={ArrowRight01Icon}
              size={settings.compactHeaders ? 9 : 10}
              strokeWidth={2}
              className={cn(
                "transition-transform duration-150",
                !isCollapsed && "rotate-90",
              )}
            />
          </button>

          {/* Left: cwd */}
          {settings.showCwd && block.cwd && (
            <span className="shrink-0 font-mono text-xs text-muted-foreground">
              {shortCwd(block.cwd)}
            </span>
          )}

          {/* Running indicator dot */}
          {block.isRunning && (
            <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-primary animate-pulse" />
          )}

          {/* Center: command */}
          <span className="min-w-0 flex-1 truncate font-mono text-xs text-foreground/70">
            {block.command}
          </span>

          {/* Right: meta + toolbar */}
          <div className="pointer-events-auto flex shrink-0 items-center gap-1">
            {/* Duration */}
            {settings.showExecutionTime && (
              <span className="font-mono text-xs text-muted-foreground">
                {formatDuration(block.startedAt, block.finishedAt)}
              </span>
            )}

            {/* Fix 2: Exit code badge — show for all completed commands including exit 0 */}
            {settings.showExitCode && block.exitCode !== null && (
              <span
                className={cn(
                  "rounded px-1 py-0.5 font-mono text-[10px] leading-none",
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
                {/* Fix 3 & 4: copy command with feedback */}
                <IconButton
                  title="Copy command"
                  icon={copiedId === "cmd" ? Tick01Icon : Copy01Icon}
                  onClick={(e) => { e.stopPropagation(); onCopyCommand(); flash("cmd"); }}
                />
                {/* Fix 3 & 4: copy output with correct icon + feedback */}
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
                {/* Fix 8: Only show re-run button when callback is provided */}
                {!block.isRunning && onRerun && (
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
