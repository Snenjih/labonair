import { listen } from "@tauri-apps/api/event";
import { handleApiError } from "@/lib/errors";
import { useCallback, useEffect, useState } from "react";
import type { FsProvider } from "./fsProvider";
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

export function useFileTree(
  provider: FsProvider,
  rootPath: string | null,
  options?: Options,
) {
  const {
    nodes,
    expanded,
    showHidden,
    setScope,
    setNode,
    toggleExpanded,
    addExpanded,
    toggleShowHidden,
  } = useLocalExplorerStore();

  // Ephemeral UI states — don't need to survive sidebar hide/show.
  const [pendingCreate, setPendingCreate] = useState<PendingCreate | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);

  const fetchChildren = useCallback(
    async (path: string) => {
      const show_hidden = useLocalExplorerStore.getState().showHidden;
      const requestGeneration = useLocalExplorerStore.getState().generation;
      setNode(path, { status: "loading" });
      try {
        const page = await provider.readDir(path, { showHidden: show_hidden });
        // Discard a response that outlived a scope change (e.g. the user
        // switched away from this host/root while the request was in
        // flight) — applying it now would write into whatever scope is
        // active by the time it resolves.
        if (useLocalExplorerStore.getState().generation !== requestGeneration) return;
        setNode(path, { status: "loaded", entries: page.entries, hasMore: page.hasMore });
      } catch (e) {
        if (useLocalExplorerStore.getState().generation !== requestGeneration) return;
        setNode(path, { status: "error", message: String(e) });
      }
    },
    [setNode, provider],
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
      void fetchChildren(rootPath);
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
      if (!useLocalExplorerStore.getState().nodes[path]) {
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
      const path = provider.joinPath(pendingCreate.parentPath, trimmed);
      try {
        if (pendingCreate.kind === "dir") await provider.mkdir(path);
        else await provider.createFile(path);
        await fetchChildren(pendingCreate.parentPath);
      } catch (e) {
        handleApiError(e, `${pendingCreate.kind === "dir" ? "Create folder" : "Create file"} failed`, "File Tree");
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
    beginCreate,
    cancelCreate,
    commitCreate,
    beginRename,
    cancelRename,
    commitRename,
    deletePath,
    joinPath: provider.joinPath,
  };
}
