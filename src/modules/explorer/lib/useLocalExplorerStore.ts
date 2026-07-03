import { create } from "zustand";
import { useHostsStore } from "@/modules/hosts";
import { usePreferencesStore } from "@/modules/settings/preferences";
import type { FileEntry } from "./fsProvider";

export type ChildrenState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "loaded"; entries: FileEntry[]; hasMore?: boolean }
  | { status: "error"; message: string };

type TreeState = Record<string, ChildrenState>;

/** A snapshot of a remote scope's tree, kept around after the user switches
 *  away so switching back can render instantly instead of re-fetching over
 *  the network. Local scopes are never cached — see `isRemoteScope`. */
type RemoteScopeSnapshot = {
  rootPath: string;
  nodes: TreeState;
  expanded: Set<string>;
  lastAccessedAt: number;
};

function isRemoteScope(scopeKey: string): boolean {
  return scopeKey.startsWith("ssh:");
}

/** Oldest-`lastAccessedAt`-first eviction when over `maxCached` — mirrors
 *  `selectEvictionCandidates` in `useLazyExplorerSession.ts`. Exported for
 *  unit testing without touching the live store. */
export function selectScopesToEvict(
  entries: Array<{ scopeKey: string; lastAccessedAt: number }>,
  maxCached: number,
): string[] {
  const sorted = [...entries].sort((a, b) => a.lastAccessedAt - b.lastAccessedAt);
  const overflow = Math.max(0, sorted.length - maxCached);
  return sorted.slice(0, overflow).map((e) => e.scopeKey);
}

/** A cached snapshot is only usable if it's for the EXACT root path being
 *  requested — e.g. the SSH terminal's cwd may have changed since the host
 *  was last browsed, in which case this must be treated as a miss rather
 *  than showing an unrelated folder's stale contents. Exported for unit
 *  testing without touching the live store. */
export function shouldHydrateFromCache(
  cached: RemoteScopeSnapshot | undefined,
  requestedRootPath: string | null,
): cached is RemoteScopeSnapshot {
  return !!cached && requestedRootPath !== null && cached.rootPath === requestedRootPath;
}

type LocalExplorerStore = {
  // Identity of the currently loaded scope (e.g. "local" or "ssh:<hostId>") plus
  // its root path. `nodes`/`expanded` reflect THIS scope's live, current state.
  scopeKey: string;
  rootPath: string | null;
  nodes: TreeState;
  expanded: Set<string>;
  showHidden: boolean;
  /** Bumped on every scope/root change. `useFileTree` captures this before an
   *  in-flight `readDir` and discards the response if it no longer matches
   *  when the request resolves — otherwise a slow remote fetch from a scope
   *  the user has since navigated away from could write stale entries into
   *  whatever scope is active by the time it lands. */
  generation: number;
  /** Snapshots of remote scopes the user has recently left, keyed by
   *  scopeKey (`ssh:<hostId>`) — bounded to `explorerMaxCachedRemoteScopes`
   *  entries, oldest evicted first. Local scopes are never cached here
   *  (local reads are cheap enough that caching would only add risk). */
  remoteScopeCache: Record<string, RemoteScopeSnapshot>;

  setScope: (scopeKey: string, root: string | null) => void;
  setNode: (path: string, state: ChildrenState) => void;
  toggleExpanded: (path: string) => void;
  addExpanded: (path: string) => void;
  reset: () => void;
  toggleShowHidden: () => void;
};

export const useLocalExplorerStore = create<LocalExplorerStore>((set) => ({
  scopeKey: "local",
  rootPath: null,
  nodes: {},
  expanded: new Set(),
  showHidden: false,
  generation: 0,
  remoteScopeCache: {},

  setScope: (scopeKey, root) =>
    set((s) => {
      let remoteScopeCache = s.remoteScopeCache;
      // Snapshot the scope being LEFT, if it was remote and had a root —
      // stale-while-revalidate: switching back to it later renders this
      // instantly while a silent background fetch (see useFileTree.ts)
      // brings it up to date.
      if (isRemoteScope(s.scopeKey) && s.rootPath) {
        const maxCached = usePreferencesStore.getState().explorerMaxCachedRemoteScopes;
        const next = {
          ...remoteScopeCache,
          [s.scopeKey]: {
            rootPath: s.rootPath,
            nodes: s.nodes,
            expanded: s.expanded,
            lastAccessedAt: Date.now(),
          },
        };
        const entries = Object.entries(next).map(([k, v]) => ({
          scopeKey: k,
          lastAccessedAt: v.lastAccessedAt,
        }));
        for (const evict of selectScopesToEvict(entries, maxCached)) delete next[evict];
        remoteScopeCache = next;
      }

      // Hydrate the scope being ENTERED, if it's a valid cache hit.
      const cached = isRemoteScope(scopeKey) ? remoteScopeCache[scopeKey] : undefined;
      const hit = shouldHydrateFromCache(cached, root);

      return {
        scopeKey,
        rootPath: root,
        nodes: hit ? cached.nodes : {},
        expanded: hit ? cached.expanded : new Set(),
        remoteScopeCache,
        generation: s.generation + 1,
      };
    }),

  // Every cached snapshot was fetched under the previous showHidden value —
  // toggling it invalidates all of them, not just the active scope.
  toggleShowHidden: () =>
    set((s) => ({ showHidden: !s.showHidden, nodes: {}, expanded: new Set(), remoteScopeCache: {} })),

  setNode: (path, state) => set((s) => ({ nodes: { ...s.nodes, [path]: state } })),

  toggleExpanded: (path) =>
    set((s) => {
      const next = new Set(s.expanded);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return { expanded: next };
    }),

  addExpanded: (path) =>
    set((s) => {
      if (s.expanded.has(path)) return s;
      const next = new Set(s.expanded);
      next.add(path);
      return { expanded: next };
    }),

  reset: () => set({ nodes: {}, expanded: new Set(), remoteScopeCache: {} }),
}));

// Drops a deleted host's cached scope, if any — hostIds are never reused so
// this is a memory-hygiene nicety, not a correctness requirement (the LRU
// cap in setScope already bounds total cache size regardless). Mirrors the
// module-scope subscription pattern below (seedShowHiddenFromPreferences).
useHostsStore.subscribe((state) => {
  const liveHostIds = new Set(state.hosts.map((h) => h.id));
  const { remoteScopeCache } = useLocalExplorerStore.getState();
  const next = { ...remoteScopeCache };
  let changed = false;
  for (const key of Object.keys(next)) {
    if (key.startsWith("ssh:") && !liveHostIds.has(key.slice("ssh:".length))) {
      delete next[key];
      changed = true;
    }
  }
  if (changed) useLocalExplorerStore.setState({ remoteScopeCache: next });
});

// Seeds the initial `showHidden` from the persisted `explorerShowHiddenByDefault`
// preference exactly once, as soon as preferences finish hydrating. Done here
// (module scope) rather than in a component effect so it applies before the
// first tree render regardless of which sidebar panel mounts first, and never
// re-fires to stomp on an in-session manual toggle.
let _hiddenSeeded = false;
function seedShowHiddenFromPreferences() {
  if (_hiddenSeeded) return;
  const prefs = usePreferencesStore.getState();
  if (!prefs.hydrated) return;
  _hiddenSeeded = true;
  if (prefs.explorerShowHiddenByDefault) {
    useLocalExplorerStore.setState({ showHidden: true });
  }
}
seedShowHiddenFromPreferences();
usePreferencesStore.subscribe(seedShowHiddenFromPreferences);
