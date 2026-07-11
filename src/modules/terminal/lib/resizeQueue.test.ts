import { describe, expect, it, vi } from "vitest";
import { PtyResizeQueue } from "./resizeQueue";

type Call = { cols: number; rows: number };

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("PtyResizeQueue", () => {
  it("coalesces consecutive pending resize() calls into one invoke", async () => {
    const calls: Call[] = [];
    let release: () => void = () => {};
    const invoke = vi.fn((cols: number, rows: number) => {
      calls.push({ cols, rows });
      return new Promise<void>((resolve) => {
        release = () => resolve();
      });
    });
    const q = new PtyResizeQueue(invoke);

    q.resize(80, 24);
    // First call is already in flight (invoke fired synchronously from
    // drain's first iteration) — these three should coalesce into one
    // pending job behind it.
    q.resize(81, 24);
    q.resize(82, 25);
    q.resize(90, 30);

    expect(invoke).toHaveBeenCalledTimes(1);
    expect(calls).toEqual([{ cols: 80, rows: 24 }]);

    release();
    await flushMicrotasks();

    expect(invoke).toHaveBeenCalledTimes(2);
    expect(calls[1]).toEqual({ cols: 90, rows: 30 });
  });

  it("never coalesces a kick with a neighboring resize or kick", async () => {
    const calls: Call[] = [];
    const invoke = vi.fn((cols: number, rows: number) => {
      calls.push({ cols, rows });
      return Promise.resolve();
    });
    const q = new PtyResizeQueue(invoke);

    q.resize(80, 24);
    q.kick(80, 24);
    q.kick(80, 24);
    await flushMicrotasks();
    await flushMicrotasks();

    // resize(80,24) + kick(rows+1, rows) + kick(rows+1, rows) = 1 + 2 + 2 = 5
    expect(calls).toEqual([
      { cols: 80, rows: 24 },
      { cols: 80, rows: 25 },
      { cols: 80, rows: 24 },
      { cols: 80, rows: 25 },
      { cols: 80, rows: 24 },
    ]);
  });

  it("executes queued resize/kick jobs strictly in FIFO order", async () => {
    const calls: Call[] = [];
    const invoke = vi.fn((cols: number, rows: number) => {
      calls.push({ cols, rows });
      return Promise.resolve();
    });
    const q = new PtyResizeQueue(invoke);

    q.kick(10, 10);
    // Queued behind the in-flight kick's second step — not coalesced away.
    q.resize(20, 20);
    await flushMicrotasks();
    await flushMicrotasks();
    await flushMicrotasks();

    expect(calls).toEqual([
      { cols: 10, rows: 11 },
      { cols: 10, rows: 10 },
      { cols: 20, rows: 20 },
    ]);
  });

  it("continues processing subsequent jobs after an invoke rejection", async () => {
    const calls: Call[] = [];
    const invoke = vi
      .fn()
      .mockImplementationOnce(() => Promise.reject(new Error("boom")))
      .mockImplementation((cols: number, rows: number) => {
        calls.push({ cols, rows });
        return Promise.resolve();
      });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const q = new PtyResizeQueue(invoke);

    q.resize(1, 1);
    await flushMicrotasks();
    q.resize(2, 2);
    await flushMicrotasks();

    expect(calls).toEqual([{ cols: 2, rows: 2 }]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("dispose() drops not-yet-started jobs and halts the loop", async () => {
    const calls: Call[] = [];
    let release: () => void = () => {};
    const invoke = vi.fn((cols: number, rows: number) => {
      calls.push({ cols, rows });
      return new Promise<void>((resolve) => {
        release = () => resolve();
      });
    });
    const q = new PtyResizeQueue(invoke);

    q.resize(1, 1);
    q.resize(2, 2);
    q.dispose();
    release();
    await flushMicrotasks();

    // The first (already in-flight) call completes, but the coalesced
    // second job was dropped by dispose() before it could start.
    expect(calls).toEqual([{ cols: 1, rows: 1 }]);

    q.resize(3, 3);
    await flushMicrotasks();
    expect(calls).toEqual([{ cols: 1, rows: 1 }]);
  });

  it("dispose() between a kick's two invokes skips the restore call", async () => {
    const calls: Call[] = [];
    let releaseFirst: () => void = () => {};
    let resolvedCount = 0;
    const invoke = vi.fn((cols: number, rows: number) => {
      calls.push({ cols, rows });
      resolvedCount++;
      if (resolvedCount === 1) {
        return new Promise<void>((resolve) => {
          releaseFirst = () => resolve();
        });
      }
      return Promise.resolve();
    });
    const q = new PtyResizeQueue(invoke);

    q.kick(10, 10);
    q.dispose();
    releaseFirst();
    await flushMicrotasks();

    // Only the +1 bump fired; the restore step was skipped by dispose().
    expect(calls).toEqual([{ cols: 10, rows: 11 }]);
  });
});
