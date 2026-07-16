import { describe, expect, it } from "vitest";
import {
  computePoolCeiling,
  POOL_BASE_SIZE,
  POOL_HARD_CAP,
  RESERVED_HEADROOM,
  selectEvictionCandidate,
  type EvictionCandidate,
} from "./rendererPoolSizing";

describe("computePoolCeiling", () => {
  it("stays at the base size when few sessions are visible", () => {
    expect(computePoolCeiling(0)).toBe(POOL_BASE_SIZE);
    expect(computePoolCeiling(1)).toBe(POOL_BASE_SIZE);
  });

  it("grows with visible-session count plus headroom once past the base size", () => {
    const visible = POOL_BASE_SIZE + 2;
    expect(computePoolCeiling(visible)).toBe(visible + RESERVED_HEADROOM);
  });

  it("clamps at the hard cap for pathological split-pane counts", () => {
    expect(computePoolCeiling(1000)).toBe(POOL_HARD_CAP);
  });

  it("never returns less than the base size, even for zero visible sessions", () => {
    expect(computePoolCeiling(0)).toBeGreaterThanOrEqual(POOL_BASE_SIZE);
  });
});

describe("selectEvictionCandidate", () => {
  it("returns null for an empty candidate list", () => {
    expect(selectEvictionCandidate([])).toBeNull();
  });

  it("picks the lowest-scoring non-visible candidate over a higher-scoring one", () => {
    const candidates: EvictionCandidate[] = [
      { sessionId: "a", visible: false, altScreen: false, score: 50 },
      { sessionId: "b", visible: false, altScreen: false, score: 10 },
    ];
    expect(selectEvictionCandidate(candidates)).toBe("b");
  });

  it("never picks a visible candidate while a non-visible one exists, regardless of score", () => {
    const candidates: EvictionCandidate[] = [
      { sessionId: "visible-low-score", visible: true, altScreen: false, score: 1 },
      { sessionId: "hidden-high-score", visible: false, altScreen: false, score: 999 },
    ];
    expect(selectEvictionCandidate(candidates)).toBe("hidden-high-score");
  });

  it("falls back to the lowest-scoring visible candidate when every candidate is visible", () => {
    const candidates: EvictionCandidate[] = [
      { sessionId: "a", visible: true, altScreen: false, score: 1200 },
      { sessionId: "b", visible: true, altScreen: false, score: 1005 },
    ];
    expect(selectEvictionCandidate(candidates)).toBe("b");
  });

  it("breaks ties deterministically by picking the first minimum encountered", () => {
    const candidates: EvictionCandidate[] = [
      { sessionId: "first", visible: false, altScreen: false, score: 5 },
      { sessionId: "second", visible: false, altScreen: false, score: 5 },
    ];
    expect(selectEvictionCandidate(candidates)).toBe("first");
  });

  it("never picks an alt-screen candidate while a non-alt-screen one exists, regardless of score or visibility", () => {
    const candidates: EvictionCandidate[] = [
      { sessionId: "alt-screen-low-score", visible: false, altScreen: true, score: 1 },
      { sessionId: "plain-high-score", visible: true, altScreen: false, score: 999 },
    ];
    expect(selectEvictionCandidate(candidates)).toBe("plain-high-score");
  });

  it("falls back to the lowest-scored alt-screen candidate when every candidate is alt-screen", () => {
    const candidates: EvictionCandidate[] = [
      { sessionId: "a", visible: false, altScreen: true, score: 200 },
      { sessionId: "b", visible: false, altScreen: true, score: 150 },
    ];
    expect(selectEvictionCandidate(candidates)).toBe("b");
  });

  it("applies the visible-vs-hidden tiebreak within the non-alt-screen tier", () => {
    const candidates: EvictionCandidate[] = [
      { sessionId: "alt-screen", visible: false, altScreen: true, score: 1 },
      { sessionId: "plain-visible", visible: true, altScreen: false, score: 1 },
      { sessionId: "plain-hidden", visible: false, altScreen: false, score: 999 },
    ];
    expect(selectEvictionCandidate(candidates)).toBe("plain-hidden");
  });
});
