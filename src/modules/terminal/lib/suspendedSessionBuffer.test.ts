import type { Channel } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  closeSuspendedSession,
  getAllSuspendedSessionIds,
  getSuspendedAnsi,
  isSuspended,
  resumeSession,
  suspendSession,
  type DecodedChunk,
} from "./suspendedSessionBuffer";

// A minimal stand-in for Tauri's Channel — the registry only ever reads/writes
// `.onmessage`, so a plain object with that property is enough to drive it.
function makeFakeChannel(): Channel<never> {
  return { onmessage: null } as unknown as Channel<never>;
}

const textDecode = (event: unknown): DecodedChunk => {
  const e = event as { type: string; data: string };
  return e.type === "data" ? { text: e.data } : {};
};

function send(channel: Channel<never>, data: string): void {
  (channel.onmessage as unknown as (e: unknown) => void)({ type: "data", data });
}

describe("suspendedSessionBuffer", () => {
  const sessionId = "session-1";

  beforeEach(() => {
    // Drain any leftover entry from a previous test so state doesn't leak.
    resumeSession(sessionId);
  });

  it("is not suspended before suspendSession is called", () => {
    expect(isSuspended(sessionId)).toBe(false);
  });

  it("buffers chunks pushed through the channel while suspended", () => {
    const channel = makeFakeChannel();
    suspendSession(sessionId, channel, textDecode);

    expect(isSuspended(sessionId)).toBe(true);
    send(channel, "hello ");
    send(channel, "world");

    expect(getSuspendedAnsi(sessionId)).toBe("hello world");
  });

  it("resumeSession returns the channel, buffered replay, and clears the entry", () => {
    const channel = makeFakeChannel();
    suspendSession(sessionId, channel, textDecode);
    send(channel, "chunk-1");
    send(channel, "chunk-2");

    const resumed = resumeSession(sessionId);
    expect(resumed).not.toBeNull();
    expect(resumed?.channel).toBe(channel);
    expect(resumed?.replay).toBe("chunk-1chunk-2");
    expect(isSuspended(sessionId)).toBe(false);
  });

  it("resumeSession is idempotent — a second call returns null", () => {
    const channel = makeFakeChannel();
    suspendSession(sessionId, channel, textDecode);
    expect(resumeSession(sessionId)).not.toBeNull();
    expect(resumeSession(sessionId)).toBeNull();
  });

  it("closeSuspendedSession returns the handle and clears the entry", () => {
    const channel = makeFakeChannel();
    suspendSession(sessionId, channel, textDecode, undefined, 42);

    const held = closeSuspendedSession(sessionId);
    expect(held?.channel).toBe(channel);
    expect(held?.backendId).toBe(42);
    expect(isSuspended(sessionId)).toBe(false);
    expect(closeSuspendedSession(sessionId)).toBeNull();
  });

  it("tracks exit codes decoded out of a message", () => {
    const channel = makeFakeChannel();
    const decodeWithExit = (event: unknown): DecodedChunk => {
      const e = event as { type: string; code?: number };
      return e.type === "exit" ? { exitCode: e.code } : {};
    };
    suspendSession(sessionId, channel, decodeWithExit);
    (channel.onmessage as unknown as (e: unknown) => void)({ type: "exit", code: 1 });

    const resumed = resumeSession(sessionId);
    expect(resumed?.exitCode).toBe(1);
  });

  it("evicts the oldest chunks once the buffer exceeds the size cap", () => {
    const channel = makeFakeChannel();
    suspendSession(sessionId, channel, textDecode);

    // One 6MB chunk, then another — the second push should evict the first
    // once the running total would exceed the 10MB cap.
    const big = "a".repeat(6 * 1024 * 1024);
    send(channel, big);
    send(channel, big);

    const replay = getSuspendedAnsi(sessionId) ?? "";
    expect(replay.length).toBeLessThanOrEqual(10 * 1024 * 1024);
    // Only the most recent chunk should have survived eviction.
    expect(replay).toBe(big);
  });

  it("forwards detected URLs to onUrlDetected while suspended", () => {
    const channel = makeFakeChannel();
    const onUrlDetected = vi.fn();
    suspendSession(sessionId, channel, textDecode, { onUrlDetected });

    send(channel, "server running at http://localhost:5173/app\n");

    expect(onUrlDetected).toHaveBeenCalledWith("http://localhost:5173/app");
  });

  it("forwards a bell callback while suspended", () => {
    const channel = makeFakeChannel();
    const onBell = vi.fn();
    suspendSession(sessionId, channel, textDecode, { onBell });

    send(channel, "build finished\x07");

    expect(onBell).toHaveBeenCalledTimes(1);
  });

  it("getAllSuspendedSessionIds lists every currently-suspended session", () => {
    const a = makeFakeChannel();
    const b = makeFakeChannel();
    suspendSession("a", a, textDecode);
    suspendSession("b", b, textDecode);

    expect(getAllSuspendedSessionIds().sort()).toEqual(["a", "b"]);

    resumeSession("a");
    resumeSession("b");
  });
});
