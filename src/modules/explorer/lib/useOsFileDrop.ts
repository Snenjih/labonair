import { handleApiError } from "@/lib/errors";
import { useNotificationStore } from "@/modules/notifications/store/useNotificationStore";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useRef, useState } from "react";

export function useOsFileDrop(
  rootPath: string | null,
  isSearchActive: boolean,
  onDropped: (destDir: string) => void,
) {
  const [dropTargetPath, setDropTargetPath] = useState<string | null>(null);

  // Keep refs so the listener registered once always reads the latest values
  const isSearchActiveRef = useRef(isSearchActive);
  const onDroppedRef = useRef(onDropped);
  const rootPathRef = useRef(rootPath);

  useEffect(() => {
    isSearchActiveRef.current = isSearchActive;
  }, [isSearchActive]);
  useEffect(() => {
    onDroppedRef.current = onDropped;
  }, [onDropped]);
  useEffect(() => {
    rootPathRef.current = rootPath;
  }, [rootPath]);

  useEffect(() => {
    if (!rootPath) return;
    let unlisten: (() => void) | undefined;

    getCurrentWindow()
      .onDragDropEvent((event) => {
        const root = rootPathRef.current;
        if (!root) return;

        const { type } = event.payload;

        if (type === "leave") {
          setDropTargetPath(null);
          return;
        }

        if (isSearchActiveRef.current) return;

        if (type === "over" || type === "enter") {
          const pos = event.payload.position;
          const dpr = window.devicePixelRatio || 1;
          setDropTargetPath(resolveDropTarget(pos.x / dpr, pos.y / dpr, root));
          return;
        }

        if (type === "drop") {
          const pos = event.payload.position;
          const dpr = window.devicePixelRatio || 1;
          const paths = event.payload.paths ?? [];
          setDropTargetPath(null);

          if (paths.length === 0) return;

          const destDir = resolveDropTarget(pos.x / dpr, pos.y / dpr, root) ?? root;

          invoke<string[]>("fs_copy_into", { srcPaths: paths, destDir })
            .then((results) => {
              onDroppedRef.current(destDir);
              useNotificationStore.getState().addNotification({
                type: "success",
                title: "Files copied",
                message: `${results.length} item${results.length === 1 ? "" : "s"} copied to ${destDir.split("/").pop()}`,
                source: "Explorer",
              });
            })
            .catch((e) => handleApiError(e, "Failed to copy files", "Explorer"));
        }
      })
      .then((fn) => {
        unlisten = fn;
      });

    return () => unlisten?.();
  }, [rootPath]); // re-register only when rootPath changes

  return { dropTargetPath };
}

function resolveDropTarget(x: number, y: number, rootPath: string): string {
  const el = document.elementFromPoint(x, y);
  if (!el) return rootPath;

  const node = el.closest("[data-fs-path]") as HTMLElement | null;
  if (!node) return rootPath;

  const path = node.dataset.fsPath ?? rootPath;

  if (node.dataset.fsIsDir === "true") return path;

  // Dropped on a file node — use its parent directory
  const lastSlash = path.lastIndexOf("/");
  return lastSlash > 0 ? path.slice(0, lastSlash) : rootPath;
}
