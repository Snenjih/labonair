import { describe, expect, it } from "vitest";
import type { ExplorerTarget } from "@/modules/explorer/lib/useExplorerTarget";
import { effectivePollIntervalMs } from "./useGitStatus";

function remoteTarget(overrides: Partial<Extract<ExplorerTarget, { type: "remote" }>> = {}): ExplorerTarget {
  return {
    type: "remote",
    hostId: "host-1",
    sessionId: "explorer:host-1",
    path: "/srv/app",
    source: "lazy-session",
    ...overrides,
  };
}

describe("effectivePollIntervalMs", () => {
  it("uses the configured interval unchanged for a local target", () => {
    expect(effectivePollIntervalMs(5000, { type: "local", path: "/Users/x" })).toBe(5000);
  });

  it("backs off remote polling by the fixed multiplier", () => {
    expect(effectivePollIntervalMs(5000, remoteTarget())).toBe(12500);
  });

  it("rounds fractional results", () => {
    expect(effectivePollIntervalMs(3000, remoteTarget())).toBe(7500);
    expect(effectivePollIntervalMs(2001, remoteTarget())).toBe(Math.round(2001 * 2.5));
  });

  it("returns the raw interval for a null local path", () => {
    expect(effectivePollIntervalMs(4000, { type: "local", path: null })).toBe(4000);
  });
});
