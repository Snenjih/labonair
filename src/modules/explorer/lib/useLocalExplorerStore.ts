import { create } from "zustand";
import type { FileEntry } from "./fsProvider";

type ChildrenState =
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

  setScope: (scopeKey, root) =>
    set({ scopeKey, rootPath: root, nodes: {}, expanded: new Set() }),

  toggleShowHidden: () =>
    set((s) => ({ showHidden: !s.showHidden, nodes: {}, expanded: new Set() })),

  setNode: (path, state) =>
    set((s) => ({ nodes: { ...s.nodes, [path]: state } })),

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
