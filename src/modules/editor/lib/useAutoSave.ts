import { useEffect, useRef, type MutableRefObject } from "react";
import type { DocumentState } from "./useDocument";

type Options = {
  performSaveRef: MutableRefObject<() => Promise<void>>;
  doc: DocumentState;
  dirty: boolean;
  editVersion: number;
  editorAutoSave: "off" | "afterDelay" | "onFocusChange";
  editorAutoSaveDelay: number;
  isUntitled?: boolean;
};

export function useAutoSave({
  performSaveRef,
  doc,
  dirty,
  editVersion,
  editorAutoSave,
  editorAutoSaveDelay,
  isUntitled,
}: Options) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (editorAutoSave !== "afterDelay") return;
    if (doc.status !== "ready") return;
    if (isUntitled) return;
    if (!dirty) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      timerRef.current = null;
      await performSaveRef.current();
    }, editorAutoSaveDelay);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // performSaveRef is a stable ref object — intentionally omitted from deps.
    // `editVersion` (bumped on every keystroke, see useDocument's onChange)
    // is the actual re-arm trigger — `doc.status` alone only changes on
    // file load/reload, which is what previously made this timer fire once
    // per file-open instead of restarting on every edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editorAutoSave, editorAutoSaveDelay, editVersion, dirty, doc.status, isUntitled]);
}
