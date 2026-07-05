import type { Terminal } from "@xterm/xterm";

/** Reads buffer lines `[start, end]` (inclusive, xterm's absolute line
 *  numbering) back out as plain text — used for "copy output" / "attach to
 *  AI" toolbar actions. Clamped to the buffer's current length since scroll-
 *  back trimming can shrink it out from under a stale range. */
export function readRangeText(term: Terminal, start: number, end: number): string {
  const buf = term.buffer.active;
  const last = Math.min(end, buf.length - 1);
  const lines: string[] = [];
  for (let i = start; i <= last; i++) {
    lines.push(buf.getLine(i)?.translateToString(true) ?? "");
  }
  return lines.join("\n");
}
