import { create } from "zustand";
import { usePreferencesStore } from "@/modules/settings/preferences";
import type { FileEntry } from "./fsProvider";

export type ChildrenState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "loaded"; entries: FileEntry[]; hasMore?: boolean }
  | { status: "error"; message: string };

type TreeState = Record<string, ChildrenState>;

type LocalExplorerStore = {
  // Identity of the currently loaded scope (e.g. "local" or "ssh:<hostId>") plus
  // its root path. `nodes`/`expanded` only ever hold data for THIS scope — a
  // scope change wipes and reloads, it never merges two scopes' caches. This
  // prevents path collisions (e.g. two different hosts both having "/etc").
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

  setScope: (scopeKey, root) =>
    set((s) => ({ scopeKey, rootPath: root, nodes: {}, expanded: new Set(), generation: s.generation + 1 })),

  toggleShowHidden: () => set((s) => ({ showHidden: !s.showHidden, nodes: {}, expanded: new Set() })),

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

  reset: () => set({ nodes: {}, expanded: new Set() }),
}));

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
