import { describe, expect, it } from "vitest";
import type { ExplorerTarget } from "@/modules/explorer/lib/useExplorerTarget";
import { effectivePollIntervalMs, isDifferentGitTarget } from "./useGitStatus";

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

describe("isDifferentGitTarget", () => {
  it("is different when there is no previous target", () => {
    expect(isDifferentGitTarget(null, { rootPath: "/repo", sessionId: undefined })).toBe(true);
  });

  it("is not different for the exact same local target (repeated polls/refreshes)", () => {
    const target = { rootPath: "/repo", sessionId: undefined };
    expect(isDifferentGitTarget(target, { rootPath: "/repo", sessionId: undefined })).toBe(false);
  });

  it("is not different for the exact same remote target", () => {
    const target = { rootPath: "/srv/app", sessionId: "explorer:host-1" };
    expect(isDifferentGitTarget(target, { rootPath: "/srv/app", sessionId: "explorer:host-1" })).toBe(false);
  });

  it("is different when the root path changes on the same session", () => {
    const prev = { rootPath: "/srv/app", sessionId: "explorer:host-1" };
    expect(isDifferentGitTarget(prev, { rootPath: "/srv/other", sessionId: "explorer:host-1" })).toBe(true);
  });

  it("is different when the session changes for the same root path", () => {
    // e.g. switching from an SFTP-tab session to a lazy-session for the same
    // host, or between two different hosts that happen to share a path.
    const prev = { rootPath: "/srv/app", sessionId: "explorer:host-1" };
    expect(isDifferentGitTarget(prev, { rootPath: "/srv/app", sessionId: "explorer:host-2" })).toBe(true);
  });

  it("is different when switching from remote back to local", () => {
    const prev = { rootPath: "/srv/app", sessionId: "explorer:host-1" };
    expect(isDifferentGitTarget(prev, { rootPath: "/srv/app", sessionId: undefined })).toBe(true);
  });
});
