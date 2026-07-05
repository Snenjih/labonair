import { beforeEach, describe, expect, it } from "vitest";
import { createAsyncQueue } from "./asyncQueue";
import type { FsProvider } from "./fsProvider";
import { runFetchChildren, shouldRetryDroppedFetch } from "./useFileTree";
import type { ChildrenState } from "./useLocalExplorerStore";
import { useLocalExplorerStore } from "./useLocalExplorerStore";

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function fakeProvider(id = "local"): FsProvider {
  return {
    id,
    capabilities: {
      supportsWatch: false,
      supportsReveal: false,
      supportsNativeDrag: false,
      supportsInternalDrag: false,
      supportsChmod: false,
      supportsChown: false,
      supportsCalculateSize: false,
      supportsGitignore: false,
    },
    readDir: () => Promise.resolve({ entries: [], hasMore: false }),
    rename: () => Promise.resolve(),
    delete: () => Promise.resolve(),
    mkdir: () => Promise.resolve(),
    createFile: () => Promise.resolve(),
    search: () => Promise.resolve([]),
    joinPath: (parent, name) => `${parent}/${name}`,
  };
}

// Writes straight into the real store, mirroring `useLocalExplorerStore.setNode`.
function setNode(path: string, state: ChildrenState): void {
  useLocalExplorerStore.setState((s) => ({ nodes: { ...s.nodes, [path]: state } }));
}

function makeDeps(provider: FsProvider) {
  return {
    provider,
    setNode,
    queue: createAsyncQueue(3),
    inFlight: new Map<string, Promise<void>>(),
    retryCounts: new Map<string, number>(),
  };
}

describe("shouldRetryDroppedFetch", () => {
  const live = { scopeKey: "local", rootPath: "/home/user" };

  it("returns true when the path is still the current rootPath in the current scope", () => {
    expect(shouldRetryDroppedFetch("/home/user", live, "local", 0, 1)).toBe(true);
  });

  it("returns false when rootPath has moved on to a different path", () => {
    expect(shouldRetryDroppedFetch("/home/user/old", live, "local", 0, 1)).toBe(false);
  });

  it("returns false when the path matches but the scope doesn't (different-scope collision)", () => {
    expect(shouldRetryDroppedFetch("/home/user", live, "ssh:other-host", 0, 1)).toBe(false);
  });

  it("returns false once attempts reach maxRetries", () => {
    expect(shouldRetryDroppedFetch("/home/user", live, "local", 1, 1)).toBe(false);
  });
});

describe("runFetchChildren — generation-drop retry", () => {
  beforeEach(() => {
    useLocalExplorerStore.setState({
      scopeKey: "local",
      rootPath: "/home/user",
      nodes: {},
      expanded: new Set(),
      generation: 0,
      remoteScopeCache: {},
    });
  });

  it("retries exactly once when the response is dropped but the path is still current", async () => {
    const provider = fakeProvider();
    let calls = 0;
    const d = deferred<{ entries: []; hasMore: boolean }>();
    provider.readDir = () => {
      calls++;
      return calls === 1 ? d.promise : Promise.resolve({ entries: [], hasMore: false });
    };

    const deps = makeDeps(provider);
    const call = runFetchChildren(deps, "/home/user");

    // Simulate the restore-time churn: generation moves on and back while
    // the first readDir is still pending — the exact mechanism behind
    // session-restore's activeId thrashing / pane-reconstruction jump-back.
    useLocalExplorerStore.setState((s) => ({ generation: s.generation + 1 }));
    useLocalExplorerStore.setState((s) => ({ generation: s.generation + 1 }));

    d.resolve({ entries: [], hasMore: false });
    await call;
    // Let the deferred retry's .finally() chain settle.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(calls).toBe(2);
    expect(useLocalExplorerStore.getState().nodes["/home/user"]?.status).toBe("loaded");
  });

  it("does not retry when the path is no longer the current rootPath", async () => {
    const provider = fakeProvider();
    let calls = 0;
    const d = deferred<{ entries: []; hasMore: boolean }>();
    provider.readDir = () => {
      calls++;
      return d.promise;
    };

    const deps = makeDeps(provider);
    const call = runFetchChildren(deps, "/home/user");

    // Root path moves on to somewhere else entirely and stays there.
    useLocalExplorerStore.setState({ rootPath: "/home/user/projects", generation: 1 });

    d.resolve({ entries: [], hasMore: false });
    await call;
    await Promise.resolve();
    await Promise.resolve();

    expect(calls).toBe(1);
  });

  it("does not self-dedupe the retry against the settled request's inFlight entry", async () => {
    const provider = fakeProvider();
    let calls = 0;
    const d = deferred<{ entries: []; hasMore: boolean }>();
    provider.readDir = () => {
      calls++;
      return calls === 1 ? d.promise : Promise.resolve({ entries: [], hasMore: false });
    };

    const deps = makeDeps(provider);
    const call = runFetchChildren(deps, "/home/user");
    expect(deps.inFlight.has("/home/user")).toBe(true);

    useLocalExplorerStore.setState((s) => ({ generation: s.generation + 1 }));
    useLocalExplorerStore.setState((s) => ({ generation: s.generation + 1 }));

    d.resolve({ entries: [], hasMore: false });
    await call;
    // inFlight entry for the original request must clear before the retry fires.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(calls).toBe(2);
  });

  it("does not retry indefinitely when rootPath keeps changing before every attempt settles", async () => {
    const provider = fakeProvider();
    let calls = 0;
    let generation = 0;
    // Every single attempt is immediately stale by the time it resolves —
    // pathological churn that never settles.
    provider.readDir = () => {
      calls++;
      generation++;
      useLocalExplorerStore.setState({ generation });
      return Promise.resolve({ entries: [], hasMore: false });
    };

    const deps = makeDeps(provider);
    await runFetchChildren(deps, "/home/user");
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    // One initial attempt + at most MAX_DROP_RETRIES (1) retry, never more.
    expect(calls).toBeLessThanOrEqual(2);
  });
});
