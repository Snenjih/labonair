import type { RefObject } from "react";
import { useEffect, useRef, useState } from "react";
import { explorerDrag } from "./explorerDrag";
import { resolveDropTarget } from "./useOsFileDrop";
import { dirname } from "./useFileTree";

/** A drop is a no-op (same folder) or invalid (into itself / one of its own
 *  descendants) — split out from `onUp` below so it's unit-testable without
 *  touching pointer events or the DOM. */
export function canDropInto(path: string, destDir: string): boolean {
  if (destDir === dirname(path) || destDir === path) return false;
  return !destDir.startsWith(`${path}/`);
}

/**
 * Handles dropping a row dragged via `explorerDrag` (the pure-JS drag used
 * for both local and remote rows — see `FileTreeNode`'s pointer-drag setup)
 * back onto a directory in the SAME tree, moving it there. Purely a same-scope
 * move: a drop is only honored when the drag's origin host matches
 * `currentHostId` (both `null` for local↔local), since moving between two
 * different hosts — or between a remote host and local — would need an
 * actual upload/download, not a rename.
 *
 * Mirrors `TerminalPane`/`SshTerminalPane`'s own `explorerDrag` consumers:
 * a capture-phase `pointerup` on `document` so the drop is seen even if
 * something inside the tree would otherwise swallow it.
 */
export function useInternalDrop(
  containerRef: RefObject<HTMLElement | null>,
  rootPath: string | null,
  currentHostId: string | null,
  onMoved: (path: string, destDir: string) => void,
) {
  const [dropTargetPath, setDropTargetPath] = useState<string | null>(null);

  // Kept in a ref (re-registering the effect below only on rootPath/hostId
  // change, not on every render) — mirrors `useOsFileDrop`'s own callback-ref
  // pattern, since `onMoved` is typically a fresh closure every render.
  const onMovedRef = useRef(onMoved);
  useEffect(() => {
    onMovedRef.current = onMoved;
  }, [onMoved]);

  useEffect(() => {
    if (!rootPath) return;

    function withinContainer(x: number, y: number): boolean {
      const el = containerRef.current;
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    }

    function activeDragForThisScope() {
      const drag = explorerDrag.get();
      if (!drag) return null;
      return (drag.origin?.hostId ?? null) === currentHostId ? drag : null;
    }

    function onMove(e: PointerEvent) {
      const drag = activeDragForThisScope();
      if (!drag || !rootPath || !withinContainer(e.clientX, e.clientY)) {
        setDropTargetPath(null);
        return;
      }
      setDropTargetPath(resolveDropTarget(e.clientX, e.clientY, rootPath));
    }

    function onUp(e: PointerEvent) {
      setDropTargetPath(null);
      const drag = activeDragForThisScope();
      if (!drag || !rootPath || !withinContainer(e.clientX, e.clientY)) return;

      const [path] = drag.paths;
      if (!path) return;
      const destDir = resolveDropTarget(e.clientX, e.clientY, rootPath);
      if (!canDropInto(path, destDir)) return;
      onMovedRef.current(path, destDir);
    }

    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp, { capture: true });
    return () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp, { capture: true });
    };
  }, [rootPath, currentHostId, containerRef]);

  return { dropTargetPath };
}
