import { describe, expect, it } from "vitest";
import { selectEvictionCandidates, type IdleCandidate } from "./useLazyExplorerSession";

function idle(sessionId: string, releasedAt: number): IdleCandidate {
  return { sessionId, refCount: 0, releasedAt };
}

function active(sessionId: string): IdleCandidate {
  return { sessionId, refCount: 1, releasedAt: null };
}

describe("selectEvictionCandidates", () => {
  it("returns nothing when idle count is within the cap", () => {
    const entries = [idle("a", 1), idle("b", 2)];
    expect(selectEvictionCandidates(entries, 3)).toEqual([]);
  });

  it("returns nothing when idle count equals the cap exactly", () => {
    const entries = [idle("a", 1), idle("b", 2), idle("c", 3)];
    expect(selectEvictionCandidates(entries, 3)).toEqual([]);
  });

  it("evicts the oldest-released session first when over the cap", () => {
    const entries = [idle("newest", 30), idle("oldest", 10), idle("middle", 20)];
    expect(selectEvictionCandidates(entries, 2)).toEqual(["oldest"]);
  });

  it("evicts multiple sessions when far over the cap", () => {
    const entries = [idle("d", 4), idle("a", 1), idle("c", 3), idle("b", 2)];
    expect(selectEvictionCandidates(entries, 1)).toEqual(["a", "b", "c"]);
  });

  it("never evicts a session with active consumers, regardless of order", () => {
    const entries = [active("a"), idle("b", 1), idle("c", 2), idle("d", 3)];
    // cap=1 idle allowed; "a" is active (refCount>0) so it's never a candidate
    expect(selectEvictionCandidates(entries, 1)).toEqual(["b", "c"]);
  });

  it("returns an empty list for no entries", () => {
    expect(selectEvictionCandidates([], 3)).toEqual([]);
  });
});
