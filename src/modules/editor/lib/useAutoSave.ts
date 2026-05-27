import { useEffect, useRef, type MutableRefObject } from "react";
import type { DocumentState } from "./useDocument";

type Options = {
  performSaveRef: MutableRefObject<() => Promise<void>>;
  doc: DocumentState;
  editorAutoSave: "off" | "afterDelay" | "onFocusChange";
  editorAutoSaveDelay: number;
  isUntitled?: boolean;
};

export function useAutoSave({
  performSaveRef,
  doc,
  editorAutoSave,
  editorAutoSaveDelay,
  isUntitled,
}: Options) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (editorAutoSave !== "afterDelay") return;
    if (doc.status !== "ready") return;
    if (isUntitled) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      timerRef.current = null;
      await performSaveRef.current();
    }, editorAutoSaveDelay);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // performSaveRef is a stable ref object — intentionally omitted from deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editorAutoSave, editorAutoSaveDelay, doc, isUntitled]);
}
