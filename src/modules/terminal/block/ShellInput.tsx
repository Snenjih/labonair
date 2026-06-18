import { useEffect, useRef } from "react";
import { useTabsStore, selectActivePaneId } from "@/modules/tabs";
import { getActiveBlockSession } from "@/modules/tabs/store/tabsStore";
import { createShellEditor, type ShellEditorHandle } from "./lib/shellEditor";
import "./block.css";

interface ShellInputProps {
  onRestoreFocus?: () => void;
}

export function ShellInput({ onRestoreFocus }: ShellInputProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<ShellEditorHandle | null>(null);
  const draftRef = useRef<Map<string, string>>(new Map());

  // Re-create editor when the active pane changes (tab switch)
  const activePaneId = useTabsStore(selectActivePaneId);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const session = getActiveBlockSession(useTabsStore.getState());
    if (!session) return;

    const savedDraft = draftRef.current.get(activePaneId ?? "") ?? "";

    const handle = createShellEditor(el, {
      onSubmit: (text) => {
        draftRef.current.delete(activePaneId ?? "");
        session.submit(text);
        onRestoreFocus?.();
      },
      onInterrupt: () => {
        session.interrupt();
        onRestoreFocus?.();
      },
      getCwd: session.getCwd,
    });

    if (savedDraft) handle.setValue(savedDraft);
    editorRef.current = handle;
    handle.focus();

    return () => {
      // Save draft before destroying so it survives tab switches
      const currentValue = handle.getValue();
      if (currentValue.trim()) {
        draftRef.current.set(activePaneId ?? "", currentValue);
      } else {
        draftRef.current.delete(activePaneId ?? "");
      }
      handle.destroy();
      editorRef.current = null;
    };
  }, [activePaneId, onRestoreFocus]);

  return (
    <div
      ref={containerRef}
      className="nexum-shell-editor flex-1 min-w-0"
    />
  );
}
