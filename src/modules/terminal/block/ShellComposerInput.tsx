import { useEffect, useRef, useState } from "react";
import { usePreferencesStore } from "@/modules/settings/preferences";
import {
  beginBlock,
  hasShellIntegration,
  isCommandRunning,
  subscribeIntegrationState,
  write,
} from "../lib/terminalSessionRegistry";
import { createShellComposerEditor, type ShellComposerHandle } from "./lib/shellComposerEditor";

const drafts = new Map<string, string>();

type SessionPhase = "ungraduated" | "running" | "ready";

function phaseOf(sessionId: string): SessionPhase {
  if (!hasShellIntegration(sessionId)) return "ungraduated";
  if (isCommandRunning(sessionId)) return "running";
  return "ready";
}

/** The command half of the composer's AI/Command switch (see AiInputBar) —
 *  bound to one terminal session (pane), not the tab: each pane keeps its
 *  own draft, restored when you switch back to it. Only mounts an editable
 *  CodeMirror instance while the session is "ready" (shell integration
 *  confirmed, no command currently running) — while a command runs, real
 *  keyboard focus belongs to the terminal itself (see
 *  terminalSessionRegistry's applyComposerCursor/focus-on-"C"), so there is
 *  nothing useful for this input to do until it's idle again. */
export function ShellComposerInput({ sessionId, cwd }: { sessionId: string; cwd: string | null }) {
  const blocksEnabled = usePreferencesStore((s) => s.terminalBlocksEnabled);
  const fontFamily = usePreferencesStore((s) => s.terminalFontFamily);
  const containerRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<ShellComposerHandle | null>(null);
  const cwdRef = useRef(cwd);
  cwdRef.current = cwd;
  const blocksEnabledRef = useRef(blocksEnabled);
  blocksEnabledRef.current = blocksEnabled;

  const [phase, setPhase] = useState<SessionPhase>(() => phaseOf(sessionId));

  useEffect(() => {
    setPhase(phaseOf(sessionId));
    return subscribeIntegrationState(sessionId, () => setPhase(phaseOf(sessionId)));
  }, [sessionId]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || phase !== "ready") return;

    const handle = createShellComposerEditor(
      el,
      sessionId,
      {
        onSubmit: (text) => {
          if (blocksEnabledRef.current) beginBlock(sessionId, text, cwdRef.current);
          write(sessionId, text.endsWith("\n") ? text : `${text}\n`);
          drafts.delete(sessionId);
        },
      },
      fontFamily,
    );
    const draft = drafts.get(sessionId);
    if (draft) handle.setValue(draft);
    handle.focus();
    handleRef.current = handle;

    return () => {
      const value = handle.getValue();
      if (value.trim()) drafts.set(sessionId, value);
      else drafts.delete(sessionId);
      handle.destroy();
      handleRef.current = null;
    };
    // fontFamily intentionally excluded — live font changes don't warrant
    // tearing down and losing composer focus; the editor picks it up fresh
    // next time it's (re)created for a phase/session change.
    // biome-ignore lint/correctness/useExhaustiveDependencies: see above
  }, [sessionId, phase]);

  if (phase !== "ready") {
    return (
      <div className="flex h-7 flex-1 items-center text-[13px] text-muted-foreground/50">
        {phase === "running" ? "Command running…" : "Waiting for shell integration…"}
      </div>
    );
  }

  return <div ref={containerRef} className="nexum-shell-composer flex-1 min-w-0" />;
}
