import { invoke } from "@tauri-apps/api/core";
import { save as dialogSave } from "@tauri-apps/plugin-dialog";
import { useCallback, useEffect, useRef, useState } from "react";

type ReadResult =
  | { kind: "text"; content: string; size: number }
  | { kind: "binary"; size: number }
  | { kind: "toolarge"; size: number; limit: number };

export type DocumentState =
  | { status: "loading" }
  | { status: "ready"; content: string; size: number }
  | { status: "binary"; size: number }
  | { status: "toolarge"; size: number; limit: number }
  | { status: "error"; message: string };

type Options = {
  path: string;
  isUntitled?: boolean;
  onDirtyChange?: (dirty: boolean) => void;
  onSaveAs?: (newPath: string) => void;
};

export function useDocument({ path, isUntitled, onDirtyChange, onSaveAs }: Options) {
  const [doc, setDoc] = useState<DocumentState>({ status: "loading" });
  const [dirty, setDirty] = useState(false);
  const [reloadCounter, setReloadCounter] = useState(0);

  // Track the saved buffer so we can detect changes cheaply.
  const savedRef = useRef<string>("");
  const bufferRef = useRef<string>("");
  const dirtyRef = useRef(false);
  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  // Notify parent of dirty transitions.
  const onDirtyChangeRef = useRef(onDirtyChange);
  useEffect(() => {
    onDirtyChangeRef.current = onDirtyChange;
  }, [onDirtyChange]);
  useEffect(() => {
    onDirtyChangeRef.current?.(dirty);
  }, [dirty]);

  // Load on path change or explicit reload.
  useEffect(() => {
    let cancelled = false;
    setDoc({ status: "loading" });
    setDirty(false);

    invoke<ReadResult>("fs_read_file", { path })
      .then((res) => {
        if (cancelled) return;
        if (res.kind === "text") {
          savedRef.current = res.content;
          bufferRef.current = res.content;
          setDoc({
            status: "ready",
            content: res.content,
            size: res.size,
          });
        } else if (res.kind === "binary") {
          setDoc({ status: "binary", size: res.size });
        } else if (res.kind === "toolarge") {
          setDoc({
            status: "toolarge",
            size: res.size,
            limit: res.limit,
          });
        }
      })
      .catch((e) => {
        if (!cancelled) setDoc({ status: "error", message: String(e) });
      });

    return () => {
      cancelled = true;
    };
  }, [path, reloadCounter]);

  /** Re-read the file from disk. No-op (silent) if the buffer is dirty —
   *  callers shouldn't clobber unsaved user edits. Returns whether reload ran. */
  const reload = useCallback((): boolean => {
    if (dirtyRef.current) return false;
    setReloadCounter((n) => n + 1);
    return true;
  }, []);

  const onChange = useCallback((next: string) => {
    bufferRef.current = next;
    setDirty(next !== savedRef.current);
  }, []);

  const onSaveAsRef = useRef(onSaveAs);
  useEffect(() => { onSaveAsRef.current = onSaveAs; }, [onSaveAs]);

  const pathRef = useRef(path);
  pathRef.current = path;
  const isUntitledRef = useRef(isUntitled);
  isUntitledRef.current = isUntitled;

  const save = useCallback(async () => {
    if (!dirtyRef.current && !isUntitledRef.current) return;
    const content = bufferRef.current;
    if (isUntitledRef.current) {
      const chosen = await dialogSave({
        defaultPath: "untitled.txt",
        filters: [{ name: "All Files", extensions: ["*"] }],
      });
      if (!chosen) return;
      await invoke("fs_write_file", { path: chosen, content });
      savedRef.current = content;
      setDirty(false);
      onSaveAsRef.current?.(chosen);
      return;
    }
    await invoke("fs_write_file", { path: pathRef.current, content });
    savedRef.current = content;
    setDirty(false);
  }, []);

  return { doc, dirty, onChange, save, reload };
}
