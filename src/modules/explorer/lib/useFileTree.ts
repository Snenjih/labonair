import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useState } from "react";
import { useLocalExplorerStore } from "./useLocalExplorerStore";

export type DirEntry = {
  name: string;
  kind: "file" | "dir" | "symlink";
  size: number;
  mtime: number;
};

export type PendingCreate = {
  parentPath: string;
  kind: "file" | "dir";
};

export function joinPath(parent: string, name: string): string {
  if (parent.endsWith("/")) return `${parent}${name}`;
  return `${parent}/${name}`;
}

export function dirname(path: string): string {
  const i = path.lastIndexOf("/");
  if (i <= 0) return "/";
  return path.slice(0, i);
}

type Options = {
  onPathRenamed?: (from: string, to: string) => void;
  onPathDeleted?: (path: string) => void;
  showHiddenFiles?: boolean;
};

export function useFileTree(rootPath: string | null, options?: Options) {
  const { nodes, expanded, setRootPath, setNode, toggleExpanded, addExpanded } =
    useLocalExplorerStore();

  // Ephemeral UI states — don't need to survive sidebar hide/show.
  const [pendingCreate, setPendingCreate] = useState<PendingCreate | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);

  const fetchChildren = useCallback(
    async (path: string) => {
      setNode(path, { status: "loading" });
      try {
        const entries = await invoke<DirEntry[]>("fs_read_dir", {
          path,
          show_hidden: options?.showHiddenFiles,
        });
        setNode(path, { status: "loaded", entries });
      } catch (e) {
        setNode(path, { status: "error", message: String(e) });
      }
    },
    [setNode, options?.showHiddenFiles],
  );

  // Root change → reset persisted tree state and reload root.
  useEffect(() => {
    if (!rootPath) {
      setRootPath(null);
      setPendingCreate(null);
      setRenaming(null);
      return;
    }
    // Only reset when root actually changes to avoid re-fetching on re-renders.
    const current = useLocalExplorerStore.getState().rootPath;
    if (current !== rootPath) {
      setRootPath(rootPath);
      setPendingCreate(null);
      setRenaming(null);
      void fetchChildren(rootPath);
    } else if (!useLocalExplorerStore.getState().nodes[rootPath]) {
      // Store is fresh (e.g. first mount after store reset) — still fetch root.
      void fetchChildren(rootPath);
    }
  }, [rootPath, setRootPath, fetchChildren]);

  const toggle = useCallback(
    (path: string) => {
      toggleExpanded(path);
      const node = useLocalExplorerStore.getState().nodes[path];
      if (!node || node.status === "error") {
        void fetchChildren(path);
      }
    },
    [toggleExpanded, fetchChildren],
  );

  const expand = useCallback(
    (path: string) => {
      addExpanded(path);
      if (!useLocalExplorerStore.getState().nodes[path]) {
        void fetchChildren(path);
      }
    },
    [addExpanded, fetchChildren],
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
      if (!useLocalExplorerStore.getState().nodes[parentPath]) {
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
      const path = joinPath(pendingCreate.parentPath, trimmed);
      const cmd =
        pendingCreate.kind === "dir" ? "fs_create_dir" : "fs_create_file";
      try {
        await invoke(cmd, { path });
        await fetchChildren(pendingCreate.parentPath);
      } catch (e) {
        console.error(`${cmd} failed:`, e);
      } finally {
        setPendingCreate(null);
      }
    },
    [pendingCreate, fetchChildren],
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
      const to = joinPath(parent, trimmed);
      try {
        await invoke("fs_rename", { from: renaming, to });
        options?.onPathRenamed?.(renaming, to);
        await fetchChildren(parent);
      } catch (e) {
        console.error("fs_rename failed:", e);
      } finally {
        setRenaming(null);
      }
    },
    [renaming, fetchChildren, options],
  );

  const deletePath = useCallback(
    async (path: string) => {
      try {
        await invoke("fs_delete", { path });
        options?.onPathDeleted?.(path);
        await fetchChildren(dirname(path));
      } catch (e) {
        console.error("fs_delete failed:", e);
      }
    },
    [fetchChildren, options],
  );

  return {
    nodes,
    expanded,
    pendingCreate,
    renaming,
    toggle,
    expand,
    refresh,
    beginCreate,
    cancelCreate,
    commitCreate,
    beginRename,
    cancelRename,
    commitRename,
    deletePath,
    joinPath,
  };
}
