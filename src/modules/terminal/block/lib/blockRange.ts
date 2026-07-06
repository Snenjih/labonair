export type MarkerLike = { line: number; isDisposed: boolean };
export type LineRange = { start: number; end: number };

/** `null` once either marker is disposed (scrollback trimmed past it, or the
 *  underlying Terminal was reset/reused by the renderer pool) — callers treat
 *  that as "this block is no longer addressable," not an error. */
export function computeRange(start: MarkerLike, end: MarkerLike): LineRange | null {
  if (start.isDisposed || end.isDisposed) return null;
  if (start.line < 0 || end.line < 0) return null;
  return { start: start.line, end: Math.max(start.line, end.line) };
}

/** Newest-first scan so overlapping ranges (marker drift) resolve to the most
 *  recent block. */
export function blockIndexAt(ranges: (LineRange | null)[], line: number): number {
  for (let i = ranges.length - 1; i >= 0; i--) {
    const r = ranges[i];
    if (r && line >= r.start && line <= r.end) return i;
  }
  return -1;
}
