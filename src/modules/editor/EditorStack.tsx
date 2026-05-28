import { cn } from "@/lib/utils";
import type { EditorTab } from "@/modules/tabs";
import { useTabsStore } from "@/modules/tabs/store/tabsStore";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { useTransferStore } from "@/modules/sftp/store/transferStore";
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import { EditorPane, type EditorPaneHandle } from "./EditorPane";

type Props = {
  onDirtyChange: (id: number, dirty: boolean) => void;
  registerHandle: (id: number, handle: EditorPaneHandle | null) => void;
  onCloseTab: (id: number) => void;
  onSaveAs: (id: number, newPath: string) => void;
};

export function EditorStack({
  onDirtyChange,
  registerHandle,
  onCloseTab,
  onSaveAs,
}: Props) {
  const editors = useTabsStore(
    useShallow((s) => s.tabs.filter((t): t is EditorTab => t.kind === "editor")),
  );
  const activeId = useTabsStore((s) => s.activeId);

  // Stable per-tab callbacks. Inline arrows in `ref` and `onDirtyChange`
  // change identity every render, which makes React detach+reattach the ref
  // callback and re-invoke `onDirtyChange`, triggering setState loops in
  // the parent. Memoizing per id keeps each callback's identity stable.
  const registerRef = useRef(registerHandle);
  const dirtyRef = useRef(onDirtyChange);
  const closeRef = useRef(onCloseTab);
  const saveAsRef = useRef(onSaveAs);
  useEffect(() => {
    registerRef.current = registerHandle;
  }, [registerHandle]);
  useEffect(() => {
    dirtyRef.current = onDirtyChange;
  }, [onDirtyChange]);
  useEffect(() => {
    closeRef.current = onCloseTab;
  }, [onCloseTab]);
  useEffect(() => {
    saveAsRef.current = onSaveAs;
  }, [onSaveAs]);

  const refCallbacks = useRef(
    new Map<number, (h: EditorPaneHandle | null) => void>(),
  );
  const dirtyCallbacks = useRef(new Map<number, (dirty: boolean) => void>());
  const closeCallbacks = useRef(new Map<number, () => void>());
  const savedCallbacks = useRef(new Map<number, (() => void) | undefined>());
  const saveAsCallbacks = useRef(new Map<number, ((newPath: string) => void) | undefined>());

  const getRefCallback = (id: number) => {
    let cb = refCallbacks.current.get(id);
    if (!cb) {
      cb = (h: EditorPaneHandle | null) => registerRef.current(id, h);
      refCallbacks.current.set(id, cb);
    }
    return cb;
  };
  const getDirtyCallback = (id: number) => {
    let cb = dirtyCallbacks.current.get(id);
    if (!cb) {
      cb = (dirty: boolean) => dirtyRef.current(id, dirty);
      dirtyCallbacks.current.set(id, cb);
    }
    return cb;
  };
  const getCloseCallback = (id: number) => {
    let cb = closeCallbacks.current.get(id);
    if (!cb) {
      cb = () => closeRef.current(id);
      closeCallbacks.current.set(id, cb);
    }
    return cb;
  };

  const getSaveAsCallback = (t: EditorTab) => {
    if (!t.isUntitled) return undefined;
    let cb = saveAsCallbacks.current.get(t.id);
    if (!cb) {
      cb = (newPath: string) => saveAsRef.current(t.id, newPath);
      saveAsCallbacks.current.set(t.id, cb);
    }
    return cb;
  };

  const getSavedCallback = (t: EditorTab) => {
    if (!t.remoteHostTabId || !t.remotePath) return undefined;
    let cb = savedCallbacks.current.get(t.id);
    if (!cb) {
      cb = () => {
        const showTransfers = usePreferencesStore.getState().sftpRemoteEditShowTransfers;
        const jobId = crypto.randomUUID();
        if (showTransfers) {
          useTransferStore.getState().addJob({
            id: jobId,
            session_id: t.remoteHostTabId!,
            src_path: "(editor)",
            dest_path: t.remotePath!,
            direction: "upload",
            status: "running",
            bytes_total: 0,
            bytes_transferred: 0,
            speed_bps: 0,
          });
        }
        void invoke("save_remote_edit", {
          sessionId: t.remoteHostTabId,
          remotePath: t.remotePath,
          localTempPath: t.path,
        }).then(() => {
          if (showTransfers) {
            useTransferStore.getState().updateJob({
              id: jobId,
              session_id: t.remoteHostTabId!,
              src_path: "(editor)",
              dest_path: t.remotePath!,
              direction: "upload",
              status: "completed",
              bytes_total: 1,
              bytes_transferred: 1,
              speed_bps: 0,
            });
          }
        }).catch((e: unknown) => {
          if (showTransfers) {
            useTransferStore.getState().updateJob({
              id: jobId,
              session_id: t.remoteHostTabId!,
              src_path: "(editor)",
              dest_path: t.remotePath!,
              direction: "upload",
              status: { failed: String(e) },
              bytes_total: 0,
              bytes_transferred: 0,
              speed_bps: 0,
            });
          }
          console.error("Failed to save to remote:", e);
        });
      };
      savedCallbacks.current.set(t.id, cb);
    }
    return cb;
  };

  // Drop callback entries for closed tabs to avoid unbounded growth.
  useEffect(() => {
    const live = new Set(editors.map((t) => t.id));
    for (const id of refCallbacks.current.keys()) {
      if (!live.has(id)) refCallbacks.current.delete(id);
    }
    for (const id of dirtyCallbacks.current.keys()) {
      if (!live.has(id)) dirtyCallbacks.current.delete(id);
    }
    for (const id of closeCallbacks.current.keys()) {
      if (!live.has(id)) closeCallbacks.current.delete(id);
    }
    for (const id of savedCallbacks.current.keys()) {
      if (!live.has(id)) savedCallbacks.current.delete(id);
    }
    for (const id of saveAsCallbacks.current.keys()) {
      if (!live.has(id)) saveAsCallbacks.current.delete(id);
    }
  }, [editors]);

  if (editors.length === 0) return null;
  return (
    <div className="relative h-full w-full">
      {editors.map((t) => {
        const visible = t.id === activeId;
        return (
          <div
            key={t.id}
            className={cn(
              "absolute inset-0",
              !visible && "invisible pointer-events-none",
            )}
            aria-hidden={!visible}
          >
            <EditorPane
              ref={getRefCallback(t.id)}
              path={t.path}
              isUntitled={t.isUntitled}
              isActive={visible}
              onDirtyChange={getDirtyCallback(t.id)}
              onClose={getCloseCallback(t.id)}
              onSaved={getSavedCallback(t)}
              onSaveAs={getSaveAsCallback(t)}
            />
          </div>
        );
      })}
    </div>
  );
}
