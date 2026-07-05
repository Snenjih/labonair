import { useEffect, useRef, useState } from "react";
import { Popover, PopoverAnchor } from "@/components/ui/popover";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { HistoryPopover } from "./HistoryPopover";
import { historyListFor, loadHistory } from "./lib/commandHistory";
import { createShellComposerEditor, type ShellComposerHandle } from "./lib/shellComposerEditor";
import {
  beginBlock,
  hasShellIntegration,
  isCommandRunning,
  subscribeIntegrationState,
  write,
} from "../lib/terminalSessionRegistry";

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
export function ShellComposerInput({
  sessionId,
  cwd,
  kind,
}: {
  sessionId: string;
  cwd: string | null;
  kind: "local" | "ssh";
}) {
  const blocksEnabled = usePreferencesStore((s) => s.terminalBlocksEnabled);
  const fontFamily = usePreferencesStore((s) => s.terminalFontFamily);
  const historyPopupEnabled = usePreferencesStore((s) => s.terminalComposerHistoryPopup);
  const cursorStyle = usePreferencesStore((s) => s.terminalCursorStyle);
  const cursorBlink = usePreferencesStore((s) => s.terminalCursorBlink);
  const cursorBlinkInterval = usePreferencesStore((s) => s.terminalCursorBlinkInterval);

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

  const submitCommand = (text: string) => {
    if (blocksEnabledRef.current) beginBlock(sessionId, text, cwdRef.current);
    write(sessionId, text.endsWith("\n") ? text : `${text}\n`);
    drafts.delete(sessionId);
  };

  // ── History popup (terminalComposerHistoryPopup setting) ──────────────────
  // State lives here (React), read/driven imperatively by the CodeMirror
  // keymap via refs — the keymap closures are created once per editor
  // instance (see the effect below) and would otherwise read stale values.
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyIndex, setHistoryIndex] = useState(0);
  const historyOpenRef = useRef(false);
  historyOpenRef.current = historyOpen;
  const historyIndexRef = useRef(0);
  historyIndexRef.current = historyIndex;

  const runSelected = () => {
    const list = historyListFor(sessionId);
    const cmd = list[historyIndexRef.current];
    setHistoryOpen(false);
    if (!cmd) return;
    submitCommand(cmd);
    handleRef.current?.setValue("");
  };

  // fontFamily/cursor* intentionally excluded from deps — purely cosmetic,
  // live changes don't warrant tearing down and losing composer focus; the
  // editor picks up current values fresh next time it's (re)created for a
  // phase/session change. historyPopupEnabled IS in deps below (unlike
  // those) — it changes which keymap branch runs (popup vs inline nav), so
  // toggling it should take effect immediately rather than waiting for an
  // unrelated phase/session change.
  // biome-ignore lint/correctness/useExhaustiveDependencies: see above
  useEffect(() => {
    const el = containerRef.current;
    if (!el || phase !== "ready") return;

    // Re-fetches every time the session goes idle again (i.e. after every
    // command, since this effect re-runs on phase changes) — this is what
    // makes newly-run commands show up with no explicit "record" step.
    void loadHistory(sessionId, kind === "ssh" ? { kind: "ssh", sessionId } : { kind: "local" });

    const handle = createShellComposerEditor(
      el,
      sessionId,
      {
        onSubmit: submitCommand,
        history: historyPopupEnabled
          ? {
              isOpen: () => historyOpenRef.current,
              open: () => {
                const list = historyListFor(sessionId);
                if (list.length === 0) return;
                historyIndexRef.current = list.length - 1;
                setHistoryIndex(list.length - 1);
                setHistoryOpen(true);
              },
              close: () => setHistoryOpen(false),
              move: (direction) => {
                const list = historyListFor(sessionId);
                if (list.length === 0) return;
                const next = Math.min(Math.max(historyIndexRef.current + direction, 0), list.length - 1);
                historyIndexRef.current = next;
                setHistoryIndex(next);
              },
              runSelected,
            }
          : undefined,
      },
      { fontFamily, cursorStyle, cursorBlink, cursorBlinkInterval },
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
      setHistoryOpen(false);
    };
  }, [sessionId, phase, kind, historyPopupEnabled]);

  const arrow = (
    <span className="shrink-0 select-none font-mono text-sm leading-none text-foreground group-focus-within:text-primary">
      ❯
    </span>
  );

  if (phase !== "ready") {
    return (
      <div className="group flex flex-1 items-center gap-2">
        {arrow}
        <div className="flex h-7 flex-1 items-center text-[13px] text-muted-foreground/50">
          {phase === "running" ? "Command running…" : "Waiting for shell integration…"}
        </div>
      </div>
    );
  }

  return (
    <div className="group flex min-w-0 flex-1 items-center gap-2">
      {arrow}
      <Popover open={historyOpen} onOpenChange={setHistoryOpen}>
        <PopoverAnchor asChild>
          <div ref={containerRef} className="nexum-shell-composer min-w-0 flex-1" />
        </PopoverAnchor>
        {historyPopupEnabled && (
          <HistoryPopover
            items={historyListFor(sessionId)}
            selectedIndex={historyIndex}
            onHover={(i) => {
              historyIndexRef.current = i;
              setHistoryIndex(i);
            }}
            onSelect={(cmd) => {
              setHistoryOpen(false);
              submitCommand(cmd);
              handleRef.current?.setValue("");
            }}
          />
        )}
      </Popover>
    </div>
  );
}
