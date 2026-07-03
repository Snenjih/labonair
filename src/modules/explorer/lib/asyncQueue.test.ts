import { describe, expect, it } from "vitest";
import { createAsyncQueue } from "./asyncQueue";

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("createAsyncQueue", () => {
  it("runs a task immediately when under the concurrency cap", async () => {
    const queue = createAsyncQueue(2);
    const result = await queue.run(() => Promise.resolve("ok"));
    expect(result).toBe("ok");
  });

  it("never runs more than `concurrency` tasks at once", async () => {
    const queue = createAsyncQueue(2);
    let active = 0;
    let maxActive = 0;
    const defs = [deferred<void>(), deferred<void>(), deferred<void>(), deferred<void>()];

    const runs = defs.map((d) =>
      queue.run(async () => {
        active++;
        maxActive = Math.max(maxActive, active);
        await d.promise;
        active--;
      }),
    );

    // Let the microtask queue settle so the first two tasks have started.
    await Promise.resolve();
    await Promise.resolve();
    expect(maxActive).toBe(2);

    defs[0].resolve();
    defs[1].resolve();
    await Promise.resolve();
    await Promise.resolve();
    // Third task should now have started (slot freed), fourth still queued.
    expect(maxActive).toBe(2);

    defs[2].resolve();
    defs[3].resolve();
    await Promise.all(runs);
    expect(maxActive).toBe(2);
  });

  it("eventually runs every queued task", async () => {
    const queue = createAsyncQueue(1);
    const order: number[] = [];
    await Promise.all(
      [1, 2, 3, 4, 5].map((n) =>
        queue.run(async () => {
          order.push(n);
        }),
      ),
    );
    expect(order.sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it("propagates a task's rejection without blocking the queue", async () => {
    const queue = createAsyncQueue(1);
    const failing = queue.run(() => Promise.reject(new Error("boom")));
    const succeeding = queue.run(() => Promise.resolve("fine"));

    await expect(failing).rejects.toThrow("boom");
    await expect(succeeding).resolves.toBe("fine");
  });

  it("resolves each caller with its own task's result, not a shared one", async () => {
    const queue = createAsyncQueue(2);
    const [a, b, c] = await Promise.all([
      queue.run(() => Promise.resolve("a")),
      queue.run(() => Promise.resolve("b")),
      queue.run(() => Promise.resolve("c")),
    ]);
    expect([a, b, c]).toEqual(["a", "b", "c"]);
  });
});
