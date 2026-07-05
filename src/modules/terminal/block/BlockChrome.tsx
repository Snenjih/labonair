import { HugeiconsIcon } from "@hugeicons/react";
import { Copy01Icon, Tick02Icon, Alert02Icon } from "@hugeicons/core-free-icons";
import type { BlockRecord } from "../lib/terminalSessionRegistry";

function formatDuration(startedAt: number, finishedAt: number): string {
  const ms = finishedAt - startedAt;
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

/** Compact metadata pill for a finished block — deliberately not a full-row
 *  header. A real header would have to reserve a row before the command's
 *  output, which isn't possible without pushing the shell's own output down;
 *  a small right-anchored pill (see BlockOverlay's `anchor: "right"`
 *  decoration) overlays only the typically-blank tail of the echoed command
 *  line, so it never covers real content. */
export function BlockChrome({ block }: { block: BlockRecord }) {
  if (block.finishedAt === null || block.exitCode === null) return null;
  const failed = block.exitCode !== 0;
  const title = `${block.command}${block.cwd ? `\n${block.cwd}` : ""}\nexit ${block.exitCode}`;

  return (
    <div title={title} className="flex h-full items-center justify-end gap-1 pr-1 text-[10px] leading-none">
      <button
        type="button"
        className="pointer-events-auto rounded p-0.5 text-muted-foreground/70 opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
        onClick={() => void navigator.clipboard.writeText(block.command).catch(() => undefined)}
        aria-label="Copy command"
      >
        <HugeiconsIcon icon={Copy01Icon} size={10} strokeWidth={1.75} />
      </button>
      <span
        className={
          failed
            ? "flex items-center gap-0.5 rounded bg-destructive/15 px-1 py-0.5 text-destructive"
            : "flex items-center gap-0.5 rounded bg-muted/40 px-1 py-0.5 text-muted-foreground"
        }
      >
        <HugeiconsIcon icon={failed ? Alert02Icon : Tick02Icon} size={10} strokeWidth={2} />
        {failed ? block.exitCode : formatDuration(block.startedAt, block.finishedAt)}
      </span>
    </div>
  );
}
