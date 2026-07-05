import {
  Clock01Icon,
  CommandLineIcon,
  Copy01Icon,
  MoreHorizontalIcon,
  Refresh01Icon,
  SparklesIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { homeDir } from "@tauri-apps/api/path";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useChatStore } from "@/modules/ai/store/chatStore";
import { getBlockEngine, isCommandRunning, write } from "../lib/terminalSessionRegistry";
import type { PositionedBlock } from "./lib/blockDecorations";

// Cached once — mirrors CwdBreadcrumb's home-relativizing intent, but as a
// plain string (this pill has no room for a full breadcrumb) rather than
// pathUtils.ts's `segmentsFromCwd` (built for a clickable breadcrumb trail).
let cachedHome: string | null = null;
void homeDir()
  .then((h) => {
    cachedHome = h.replace(/\/+$/, "");
  })
  .catch(() => {
    // No home dir resolvable (sandboxed/unusual env) — cwd just renders as-is.
  });

function relPath(p: string): string {
  if (cachedHome && (p === cachedHome || p.startsWith(`${cachedHome}/`))) {
    return `~${p.slice(cachedHome.length)}`;
  }
  return p;
}

function formatDuration(startedAt: number, finishedAt: number): string {
  const ms = finishedAt - startedAt;
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  return s ? `${m}m ${s}s` : `${m}m`;
}

function formatTime(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function copyText(text: string): void {
  void navigator.clipboard.writeText(text).catch(() => undefined);
}

function BlockMenu({ sessionId, block }: { sessionId: string; block: PositionedBlock }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex size-[18px] items-center justify-center rounded text-muted-foreground/80 hover:bg-accent hover:text-foreground"
          aria-label="Block actions"
        >
          <HugeiconsIcon icon={MoreHorizontalIcon} size={12.5} strokeWidth={1.75} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="text-xs">
        <DropdownMenuItem onSelect={() => copyText(block.command)}>
          <HugeiconsIcon icon={Copy01Icon} size={13} strokeWidth={1.75} />
          Copy command
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            const output = getBlockEngine(sessionId)?.readById(block.id)?.output;
            if (output) copyText(output);
          }}
        >
          <HugeiconsIcon icon={Copy01Icon} size={13} strokeWidth={1.75} />
          Copy output
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            const ctx = getBlockEngine(sessionId)?.readById(block.id);
            if (!ctx) return;
            const text = `$ ${ctx.command}${ctx.output ? `\n${ctx.output}` : ""}`;
            useChatStore.getState().attachSelection(text, "terminal");
          }}
        >
          <HugeiconsIcon icon={SparklesIcon} size={13} strokeWidth={1.75} />
          Attach to AI
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Toolbar({ sessionId, block }: { sessionId: string; block: PositionedBlock }) {
  const failed = !block.running && !block.ok && block.exitCode !== null;
  const duration = block.running ? null : formatDuration(block.startedAt, block.finishedAt);
  const running = isCommandRunning(sessionId);
  return (
    <div className="pointer-events-auto flex items-center gap-1 rounded-[7px] border border-border/60 bg-popover/95 px-1 py-0.5 shadow-sm">
      {failed && (
        <span className="px-1 text-[10px] tabular-nums text-destructive">exit {block.exitCode}</span>
      )}
      {duration && <span className="px-1 text-[10px] tabular-nums text-muted-foreground">{duration}</span>}
      {!block.running && !!block.command && (
        <button
          type="button"
          title="Run again"
          disabled={running}
          className="flex size-[18px] items-center justify-center rounded text-muted-foreground/80 hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
          onClick={() => write(sessionId, `${block.command}\n`)}
        >
          <HugeiconsIcon icon={Refresh01Icon} size={12.5} strokeWidth={1.75} />
        </button>
      )}
      <BlockMenu sessionId={sessionId} block={block} />
    </div>
  );
}

function Meta({ block }: { block: PositionedBlock }) {
  return (
    <span className="flex min-w-0 items-center gap-2 text-[10px] text-muted-foreground">
      {block.cwd && (
        <span className="max-w-64 truncate font-mono" title={block.cwd}>
          {relPath(block.cwd)}
        </span>
      )}
      <span className="inline-flex shrink-0 items-center gap-1 tabular-nums opacity-85">
        <HugeiconsIcon icon={Clock01Icon} size={11} strokeWidth={1.75} />
        {formatTime(block.startedAt)}
      </span>
    </span>
  );
}

/** Divider + header bar for a single finished block. No chrome while a block
 *  is running — the reserved blank rows (see zshrc.zsh/bashrc.bash) that the
 *  header floats into only make sense once `headerTop` is meaningful, and a
 *  live command's own output is exactly what should be visible while it
 *  runs, unobscured. */
export function BlockChrome({ sessionId, block }: { sessionId: string; block: PositionedBlock }) {
  if (block.running) return null;
  return (
    <>
      <div
        className={cn("absolute inset-x-0 h-px", block.ok ? "bg-border/40" : "bg-destructive/50")}
        style={{ top: block.bottom }}
      />
      <div
        className="group absolute inset-x-2 flex h-[18px] items-center justify-between opacity-70 transition-opacity hover:opacity-100"
        style={{ top: block.headerTop }}
      >
        <Meta block={block} />
        <Toolbar sessionId={sessionId} block={block} />
      </div>
    </>
  );
}

/** Pinned to the top of the pane while scrolled into the middle of a block's
 *  output, so the command that produced what you're looking at never scrolls
 *  out of view. */
export function StickyHeader({ sessionId, block }: { sessionId: string; block: PositionedBlock }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center gap-2 border-b border-border/50 bg-popover/95 px-2.5 py-1">
      <HugeiconsIcon
        className="shrink-0 text-muted-foreground"
        icon={CommandLineIcon}
        size={12}
        strokeWidth={1.75}
      />
      <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-foreground/90">
        {block.command || "command"}
      </span>
      <div className="pointer-events-auto">
        <Toolbar sessionId={sessionId} block={block} />
      </div>
    </div>
  );
}
