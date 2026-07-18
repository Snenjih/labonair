import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useRef, useState } from "react";
import { handleApiError } from "@/lib/errors";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { isLabonairError } from "@/types";
import type { AsyncQueue } from "./asyncQueue";
import { createAsyncQueue } from "./asyncQueue";
import type { FsProvider } from "./fsProvider";
import type { ChildrenState } from "./useLocalExplorerStore";
import { useLocalExplorerStore } from "./useLocalExplorerStore";

export type PendingCreate = {
  parentPath: string;
  kind: "file" | "dir";
};

type Options = {
  onPathRenamed?: (from: string, to: string) => void;
  onPathDeleted?: (path: string) => void;
};

export function dirname(path: string): string {
  const i = path.lastIndexOf("/");
  if (i <= 0) return "/";
  return path.slice(0, i);
}

// Caps how many readDir requests are in flight at once (e.g. expanding
// several directories in quick succession). Local reads don't strictly need
// this, but remote reads all funnel through a single mutex-guarded SFTP
// channel — bounding concurrency here keeps requests queued client-side
// instead of piling up blocked on the backend's lock.
const READDIR_CONCURRENCY = 3;

// A response can be dropped because `generation` moved on (scope/root
// changed) while the request was in flight, and then moved BACK to the same
// path before the request resolved (e.g. session-restore's activeId
// thrashing through several tabs, or pane-reconstruction jumping back to the
// original leaf). Without a retry, that path is stuck on "loading" forever —
// the dedupe below only clears its `inFlightRef` entry once the doomed
// promise settles, so nothing else will ever re-request it. Only retry once
// we're clearly back in the exact same scope+path (not just a coincidentally
// identical path string in a different scope), and only once per path
// between clean completions — these triggers are one-time restore churn, not
// steady-state instability.
const MAX_DROP_RETRIES = 1;

// A fetch that resolves faster than this never shows a "loading" placeholder
// at all — only a fetch still pending after the delay flips the node to
// `status: "loading"`. Without this, every cache-miss re-fetch (e.g. an
// evicted remote scope) blanks the tree and flashes "Loading…" for a single
// render even when the round-trip only takes tens of milliseconds, which
// reads as flicker rather than latency.
const LOADING_INDICATOR_DELAY_MS = 150;

export function shouldRetryDroppedFetch(
  path: string,
  live: { scopeKey: string; rootPath: string | null },
  providerId: string,
  attempts: number,
  maxRetries: number = MAX_DROP_RETRIES,
): boolean {
  if (live.scopeKey !== providerId || live.rootPath !== path) return false;
  return attempts < maxRetries;
}

type FetchChildrenDeps = {
  provider: FsProvider;
  setNode: (path: string, state: ChildrenState) => void;
  queue: AsyncQueue;
  inFlight: Map<string, Promise<void>>;
  retryCounts: Map<string, number>;
};

/**
 * Core `fetchChildren` logic, extracted out of the `useFileTree` hook so it
 * can be exercised directly in tests without mounting the hook (this repo
 * has no `renderHook`/`@testing-library/react` — see `useFileTree.test.ts`).
 * `useFileTree` below is a thin wrapper that supplies its ref-backed deps.
 */
export function runFetchChildren(
  deps: FetchChildrenDeps,
  path: string,
  opts?: { append?: boolean; silent?: boolean },
): Promise<void> {
  const { provider, setNode, queue, inFlight, retryCounts } = deps;
  const append = opts?.append ?? false;
  // Dedupe only applies to plain re-fetches — a `loadMore` (append) call
  // is a distinct request even if a base fetch for the same path happens
  // to be in flight. NOTE: dedup is keyed on `path` alone, not
  // `(path, silent)` — if a silent background revalidation is already
  // in flight when a caller requests a non-silent fetch for the same
  // path, the caller piggybacks the silent one's promise/behavior (no
  // loading state, a toast instead of an inline error on failure). This
  // is a rare, cosmetic-only edge case (requires landing inside the same
  // sub-second window as a poll/revalidation for the exact same path)
  // — not worth a compound dedup key.
  const silent = opts?.silent ?? false;
  if (!append) {
    const existing = inFlight.get(path);
    if (existing) return existing;
  }

  // Set when a response is dropped for having outlived a generation
  // bump — read after this task's own promise settles (see the second
  // `.finally()` below), never synchronously, so a retry doesn't dedupe
  // against its own still-registered `inFlight` entry.
  let droppedForRetry = false;

  const promise = queue.run(async () => {
    const show_hidden = useLocalExplorerStore.getState().showHidden;
    const requestGeneration = useLocalExplorerStore.getState().generation;
    const existing = useLocalExplorerStore.getState().nodes[path];
    const offset = append && existing?.status === "loaded" ? existing.entries.length : 0;

    // Only show the "loading" placeholder when there's nothing already
    // rendered for this path — a re-fetch of an already-loaded directory
    // (manual refresh, OS watcher, remote poll, retrying a stale error)
    // must not blank out good data just to briefly flash a spinner over
    // it. `silent` already skipped this for background polls; this
    // widens the same protection to every re-fetch, not just polls.
    //
    // The placeholder itself is deferred (not set synchronously) — see
    // `LOADING_INDICATOR_DELAY_MS`. The timer is cleared the instant the
    // fetch settles (success or failure), so a fetch faster than the delay
    // never shows it at all.
    const shouldShowLoading = !append && !silent && existing?.status !== "loaded";
    let loadingTimer: ReturnType<typeof setTimeout> | null = shouldShowLoading
      ? setTimeout(() => {
          loadingTimer = null;
          setNode(path, { status: "loading" });
        }, LOADING_INDICATOR_DELAY_MS)
      : null;
    const clearLoadingTimer = () => {
      if (loadingTimer) {
        clearTimeout(loadingTimer);
        loadingTimer = null;
      }
    };
    try {
      const page = await provider.readDir(path, { showHidden: show_hidden, offset });
      clearLoadingTimer();
      // Discard a response that outlived a scope change (e.g. the user
      // switched away from this host/root while the request was in
      // flight) — applying it now would write into whatever scope is
      // active by the time it resolves. If we're back on this exact
      // path by the time this settles, `shouldRetryDroppedFetch` below
      // fires a fresh request instead of leaving the node stuck.
      if (useLocalExplorerStore.getState().generation !== requestGeneration) {
        droppedForRetry = true;
        return;
      }
      if (!append) retryCounts.delete(path);
      const current = useLocalExplorerStore.getState().nodes[path];
      const priorEntries = append && current?.status === "loaded" ? current.entries : [];
      setNode(path, {
        status: "loaded",
        entries: [...priorEntries, ...page.entries],
        hasMore: page.hasMore,
      });
    } catch (e) {
      clearLoadingTimer();
      if (useLocalExplorerStore.getState().generation !== requestGeneration) {
        droppedForRetry = true;
        return;
      }
      if (!append) retryCounts.delete(path);
      if (silent) {
        // A silent (background/revalidation) fetch must never destroy
        // already-good cached data — surface the problem as a toast and
        // leave the last-known-good `status:"loaded"` node in place.
        handleApiError(e, "Failed to refresh directory", "File Tree");
      } else if (!append) {
        setNode(path, {
          status: "error",
          // Remote (SFTP) commands reject with a LabonairError object
          // ({ code, message }), not a string — String(e) on that
          // stringifies to the literal text "[object Object]" instead
          // of the actual message. Local commands reject with a plain
          // string, where this is a no-op.
          message: isLabonairError(e) ? e.message : String(e),
        });
      } else {
        handleApiError(e, "Failed to load more entries", "File Tree");
      }
    }
  });

  if (!append) {
    inFlight.set(path, promise);
    void promise.finally(() => {
      inFlight.delete(path);
    });
    // A second `.finally()` attached on the same promise — Promise
    // reactions fire in attachment order, so this always runs after the
    // one above has already cleared `inFlight`, meaning the retry call
    // below issues a genuinely new request instead of deduping against
    // itself.
    void promise.finally(() => {
      if (!droppedForRetry) return;
      const live = useLocalExplorerStore.getState();
      const attempts = retryCounts.get(path) ?? 0;
      if (!shouldRetryDroppedFetch(path, live, provider.id, attempts)) return;
      retryCounts.set(path, attempts + 1);
      void runFetchChildren(deps, path, opts);
    });
  }
  return promise;
}

export function useFileTree(provider: FsProvider, rootPath: string | null, options?: Options) {
  // Remote providers have no push-based watch — poll expanded directories at
  // a conservative interval instead so browsing doesn't go completely stale
  // during a long session. Local providers use OS watchers (fs:dir-changed)
  // and never hit this path. 0 (from the "Never" option) disables polling.
  const remotePollIntervalMs = usePreferencesStore((s) => s.explorerRemotePollInterval) * 1000;
  const { nodes, expanded, showHidden, setScope, setNode, toggleExpanded, addExpanded, toggleShowHidden } =
    useLocalExplorerStore();

  // Ephemeral UI states — don't need to survive sidebar hide/show.
  const [pendingCreate, setPendingCreate] = useState<PendingCreate | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);

  const queueRef = useRef(createAsyncQueue(READDIR_CONCURRENCY));
  // Deduplicates overlapping fetchChildren(path) calls for the exact same
  // path (e.g. a double-click racing a keyboard toggle) — callers piggyback
  // on the same in-flight request instead of firing a second one.
  const inFlightRef = useRef<Map<string, Promise<void>>>(new Map());
  // Tracks how many times a dropped (generation-mismatched) response for a
  // path has already triggered a retry — reset on any clean (non-dropped)
  // completion so unrelated future drops for the same path aren't blocked by
  // stale state. See `shouldRetryDroppedFetch`.
  const retryCountRef = useRef<Map<string, number>>(new Map());

  const fetchChildren = useCallback(
    (path: string, opts?: { append?: boolean; silent?: boolean }): Promise<void> =>
      runFetchChildren(
        {
          provider,
          setNode,
          queue: queueRef.current,
          inFlight: inFlightRef.current,
          retryCounts: retryCountRef.current,
        },
        path,
        opts,
      ),
    [setNode, provider],
  );

  const loadMore = useCallback(
    (path: string) => {
      void fetchChildren(path, { append: true });
    },
    [fetchChildren],
  );

  // Scope (provider identity) or root change → reset persisted tree state and reload root.
  // Comparing scopeKey+rootPath together (not rootPath alone) prevents a stale cache
  // from a different provider (e.g. a different SSH host) leaking into the new scope
  // when both happen to share the same path string.
  useEffect(() => {
    if (!rootPath) {
      setScope(provider.id, null);
      setPendingCreate(null);
      setRenaming(null);
      return;
    }
    const current = useLocalExplorerStore.getState();
    if (current.scopeKey !== provider.id || current.rootPath !== rootPath) {
      setScope(provider.id, rootPath);
      setPendingCreate(null);
      setRenaming(null);
      // setScope may have just hydrated `nodes`/`expanded` from a cached
      // remote snapshot (see useLocalExplorerStore.ts) — if so, the tree is
      // already rendering the cached view instantly; kick off a silent
      // background revalidation instead of a blocking fetch. A cache miss
      // (or a local scope, which is never cached) falls back to the
      // original blocking behavior.
      const afterScope = useLocalExplorerStore.getState();
      if (afterScope.nodes[rootPath]?.status === "loaded") {
        void fetchChildren(rootPath, { silent: true });
        for (const p of afterScope.expanded) void fetchChildren(p, { silent: true });
      } else {
        void fetchChildren(rootPath);
      }
    } else if (!current.nodes[rootPath]) {
      // Store is fresh (e.g. first mount after store reset) — still fetch root.
      void fetchChildren(rootPath);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rootPath, provider.id, setScope, fetchChildren]);

  // Sync OS watchers with the current tree state on mount/unmount/root change.
  // The expanded Set in the store survives component unmounts, so on remount we
  // restore all watchers that were active before the sidebar panel switch.
  // No-op for providers that don't support live watching (e.g. remote/SFTP).
  useEffect(() => {
    if (!provider.capabilities.supportsWatch || !provider.syncWatchers) return () => {};
    if (!rootPath) {
      void provider.syncWatchers([]);
      return () => {};
    }
    const expandedPaths = [...useLocalExplorerStore.getState().expanded];
    void provider.syncWatchers([rootPath, ...expandedPaths]);

    return () => {
      void provider.syncWatchers?.([]);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rootPath, provider]);

  // Listen for OS-level directory change events and refresh the affected dir.
  // Only local providers ever emit this event (see fs/watcher.rs).
  useEffect(() => {
    if (!provider.capabilities.supportsWatch) return () => {};
    let unlisten: (() => void) | undefined;
    listen<{ path: string }>("fs:dir-changed", (event) => {
      const { path } = event.payload;
      const currentNodes = useLocalExplorerStore.getState().nodes;
      if (currentNodes[path] !== undefined) {
        void fetchChildren(path);
      }
    }).then((fn) => {
      unlisten = fn;
    });
    return () => unlisten?.();
  }, [fetchChildren, provider.capabilities.supportsWatch]);

  // Providers without push-based watching (remote/SFTP) get a conservative
  // background refresh of the root and every currently-expanded directory
  // instead — dedupe + the concurrency queue above mean this can never pile
  // up requests even if a poll tick lands while a manual fetch is still
  // running. Local providers rely on OS watchers and skip this entirely.
  useEffect(() => {
    if (provider.capabilities.supportsWatch || !rootPath || remotePollIntervalMs <= 0) return;
    const interval = setInterval(() => {
      const state = useLocalExplorerStore.getState();
      // Scope may have moved on since this interval was scheduled (e.g. the
      // sidebar target changed) — a stale poll must not resurrect it.
      if (state.scopeKey !== provider.id || state.rootPath !== rootPath) return;
      // Silent — a background poll must never flash a "loading" state over
      // already-good data (this was a pre-existing wart independent of
      // caching: every poll tick used to blow away loaded entries with a
      // transient "loading" placeholder).
      void fetchChildren(rootPath, { silent: true });
      for (const path of state.expanded) {
        void fetchChildren(path, { silent: true });
      }
    }, remotePollIntervalMs);
    return () => clearInterval(interval);
  }, [provider, rootPath, fetchChildren, remotePollIntervalMs]);

  const toggle = useCallback(
    (path: string) => {
      // Read expansion state BEFORE toggling so we know which direction we went.
      const wasExpanded = useLocalExplorerStore.getState().expanded.has(path);
      toggleExpanded(path);
      if (provider.capabilities.supportsWatch) {
        if (wasExpanded) void provider.unwatch?.(path);
        else void provider.watch?.(path);
      }
      const node = useLocalExplorerStore.getState().nodes[path];
      if (!node || node.status === "error") {
        void fetchChildren(path);
      }
    },
    [toggleExpanded, fetchChildren, provider],
  );

  const expand = useCallback(
    (path: string) => {
      addExpanded(path);
      if (provider.capabilities.supportsWatch) void provider.watch?.(path);
      // Also retry a previously-errored node — matches `toggle`'s guard.
      // Without this, a node that failed once (e.g. a transient SFTP error)
      // stays permanently stuck showing the error for any caller that only
      // expands (keyboard nav, beginCreate) rather than toggling/refreshing.
      const node = useLocalExplorerStore.getState().nodes[path];
      if (!node || node.status === "error") {
        void fetchChildren(path);
      }
    },
    [addExpanded, fetchChildren, provider],
  );

  const refresh = useCallback(
    (path: string) => {
      void fetchChildren(path);
    },
    [fetchChildren],
  );

  // --- mutations ---

  const beginCreate = useCallback(
    (parentPath: string, kind: "file" | "dir") => {
      setRenaming(null);
      setPendingCreate({ parentPath, kind });
      if (rootPath && parentPath !== rootPath) {
        addExpanded(parentPath);
      }
      const node = useLocalExplorerStore.getState().nodes[parentPath];
      if (!node || node.status === "error") {
        void fetchChildren(parentPath);
      }
    },
    [rootPath, addExpanded, fetchChildren],
  );

  const cancelCreate = useCallback(() => setPendingCreate(null), []);

  const commitCreate = useCallback(
    async (name: string) => {
      if (!pendingCreate) return;
      const trimmed = name.trim();
      if (!trimmed) {
        setPendingCreate(null);
        return;
      }
      const path = provider.joinPath(pendingCreate.parentPath, trimmed);
      try {
        if (pendingCreate.kind === "dir") await provider.mkdir(path);
        else await provider.createFile(path);
        await fetchChildren(pendingCreate.parentPath);
      } catch (e) {
        handleApiError(
          e,
          `${pendingCreate.kind === "dir" ? "Create folder" : "Create file"} failed`,
          "File Tree",
        );
      } finally {
        setPendingCreate(null);
      }
    },
    [pendingCreate, fetchChildren, provider],
  );

  const beginRename = useCallback((path: string) => {
    setPendingCreate(null);
    setRenaming(path);
  }, []);

  const cancelRename = useCallback(() => setRenaming(null), []);

  const commitRename = useCallback(
    async (newName: string) => {
      if (!renaming) return;
      const trimmed = newName.trim();
      const parent = dirname(renaming);
      const oldName = renaming.slice(parent === "/" ? 1 : parent.length + 1);
      if (!trimmed || trimmed === oldName) {
        setRenaming(null);
        return;
      }
      const to = provider.joinPath(parent, trimmed);
      try {
        await provider.rename(renaming, to);
        options?.onPathRenamed?.(renaming, to);
        await fetchChildren(parent);
      } catch (e) {
        handleApiError(e, "Rename failed", "File Tree");
      } finally {
        setRenaming(null);
      }
    },
    [renaming, fetchChildren, options, provider],
  );

  // Drag-and-drop move within the same tree — `rename` on both local and
  // remote backends is a plain filesystem/SFTP rename, which already moves
  // across directories, not just renames in place. Distinct from
  // `commitRename` only in that the destination is a directory the caller
  // resolved (drop target) rather than a typed name.
  const movePath = useCallback(
    async (path: string, destDir: string) => {
      const name = path.slice(path.lastIndexOf("/") + 1);
      const to = provider.joinPath(destDir, name);
      if (to === path) return;
      try {
        await provider.rename(path, to);
        options?.onPathRenamed?.(path, to);
        await fetchChildren(dirname(path));
        await fetchChildren(destDir);
      } catch (e) {
        handleApiError(e, "Move failed", "File Tree");
      }
    },
    [fetchChildren, options, provider],
  );

  const deletePath = useCallback(
    async (path: string) => {
      try {
        await provider.delete([path]);
        options?.onPathDeleted?.(path);
        await fetchChildren(dirname(path));
      } catch (e) {
        handleApiError(e, "Delete failed", "File Tree");
      }
    },
    [fetchChildren, options, provider],
  );

  const chmod = useCallback(
    async (path: string, permissions: number) => {
      try {
        await provider.chmod?.(path, permissions);
      } catch (e) {
        handleApiError(e, "Failed to set permissions", "File Tree");
      }
    },
    [provider],
  );

  const chown = useCallback(
    async (path: string, owner: string, group: string) => {
      try {
        await provider.chown?.(path, owner, group);
      } catch (e) {
        handleApiError(e, "Failed to change owner", "File Tree");
      }
    },
    [provider],
  );

  return {
    nodes,
    expanded,
    showHidden,
    toggleShowHidden,
    pendingCreate,
    renaming,
    capabilities: provider.capabilities,
    toggle,
    expand,
    refresh,
    loadMore,
    beginCreate,
    cancelCreate,
    commitCreate,
    beginRename,
    cancelRename,
    commitRename,
    movePath,
    deletePath,
    chmod,
    chown,
    joinPath: provider.joinPath,
  };
}
