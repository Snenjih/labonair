import { create } from "zustand";

type ChildrenState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "loaded"; entries: import("./useFileTree").DirEntry[] }
  | { status: "error"; message: string };

type TreeState = Record<string, ChildrenState>;

type LocalExplorerStore = {
  rootPath: string | null;
  nodes: TreeState;
  expanded: Set<string>;
  showHidden: boolean;

  setRootPath: (root: string | null) => void;
  setNode: (path: string, state: ChildrenState) => void;
  toggleExpanded: (path: string) => void;
  addExpanded: (path: string) => void;
  reset: () => void;
  toggleShowHidden: () => void;
};

export const useLocalExplorerStore = create<LocalExplorerStore>((set) => ({
  rootPath: null,
  nodes: {},
  expanded: new Set(),
  showHidden: false,

  setRootPath: (root) =>
    set({ rootPath: root, nodes: {}, expanded: new Set() }),

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
