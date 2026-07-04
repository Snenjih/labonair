// Pure pool-sizing/eviction-order math, kept dependency-free (no xterm/addon
// imports) so it can be unit tested without pulling in the DOM-heavy addon
// stack — some xterm addons (e.g. @xterm/addon-ligatures) don't resolve
// cleanly under Vitest's module resolution, so anything importing rendererPool.ts
// directly can't be exercised in a plain unit test.

// Base floor (roughly what the old LRU-floor kept "always warm"), plus extra
// headroom for recently-backgrounded sessions, plus an absolute safety valve
// for pathological cases (e.g. dozens of split panes in one tab). The pool
// grows with the number of *currently visible* sessions so a visible pane is
// never denied a slot — see computePoolCeiling.
export const POOL_BASE_SIZE = 6;
export const RESERVED_HEADROOM = 4;
export const POOL_HARD_CAP = 24;

/** How large the pool is allowed to grow given N currently-visible sessions. */
export function computePoolCeiling(visibleCount: number): number {
  return Math.min(POOL_HARD_CAP, Math.max(POOL_BASE_SIZE, visibleCount + RESERVED_HEADROOM));
}

export type EvictionCandidate = { sessionId: string; visible: boolean; score: number };

/** Picks the lowest-scoring (least "protected") candidate to evict. Never
 *  picks a visible candidate unless every candidate is visible (the
 *  pathological case where visible sessions alone exceed the pool ceiling). */
export function selectEvictionCandidate(candidates: EvictionCandidate[]): string | null {
  if (candidates.length === 0) return null;
  const preferred = candidates.filter((c) => !c.visible);
  const pool = preferred.length > 0 ? preferred : candidates;
  let best: EvictionCandidate | null = null;
  for (const c of pool) {
    if (!best || c.score < best.score) best = c;
  }
  return best?.sessionId ?? null;
}
