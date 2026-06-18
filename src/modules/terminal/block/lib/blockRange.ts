export type LineRange = { start: number; end: number };

type MarkerLike = { line: number; isDisposed: boolean };

export function computeRange(
  start: MarkerLike,
  end: MarkerLike,
): LineRange | null {
  if (start.isDisposed || end.isDisposed) return null;
  if (start.line < 0 || end.line < 0) return null;
  return { start: start.line, end: Math.max(start.line, end.line) };
}

// Binary search: returns first index whose endLine >= vpTop
export function firstIndexEndingAtOrAfter(
  entries: ReadonlyArray<{ endLine: number }>,
  vpTop: number,
): number {
  let lo = 0;
  let hi = entries.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if ((entries[mid]?.endLine ?? 0) < vpTop) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export function blockIndexAt(
  entries: ReadonlyArray<{ startLine: number; endLine: number }>,
  line: number,
): number {
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (e && e.startLine <= line && e.endLine >= line) return i;
  }
  return -1;
}
