import { useEffect, useRef, useState } from "react";
import { Popover, PopoverAnchor } from "@/components/ui/popover";
import { usePreferencesStore } from "@/modules/settings/preferences";
import {
  hasShellIntegration,
  isCommandRunning,
  registerComposerFocus,
  registerComposerInsert,
  subscribeIntegrationState,
  write,
} from "../lib/terminalSessionRegistry";
import { ArgumentCompletionPopover } from "./ArgumentCompletionPopover";
import { HistoryPopover } from "./HistoryPopover";
import { historyListFor, loadHistory } from "./lib/commandHistory";
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
export function ShellComposerInput({ sessionId, kind }: { sessionId: string; kind: "local" | "ssh" }) {
  const fontFamily = usePreferencesStore((s) => s.terminalFontFamily);
  const historyPopupEnabled = usePreferencesStore((s) => s.terminalComposerHistoryPopup);
  const argCompletionEnabled = usePreferencesStore((s) => s.terminalComposerArgumentCompletion);
  const cursorStyle = usePreferencesStore((s) => s.terminalCursorStyle);
  const cursorBlink = usePreferencesStore((s) => s.terminalCursorBlink);
  const cursorBlinkInterval = usePreferencesStore((s) => s.terminalCursorBlinkInterval);

  const containerRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<ShellComposerHandle | null>(null);

  const [phase, setPhase] = useState<SessionPhase>(() => phaseOf(sessionId));

  useEffect(() => {
    setPhase(phaseOf(sessionId));
    return subscribeIntegrationState(sessionId, () => setPhase(phaseOf(sessionId)));
  }, [sessionId]);

  // Blocks (when enabled) are created purely from the shell's own OSC 133 C
  // payload now — see blockDecorations.ts — so submitting here doesn't need
  // to separately announce anything; it works identically whether the
  // command came from this composer or was typed directly into the terminal.
  const submitCommand = (text: string) => {
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

  // ── Argument completion (terminalComposerArgumentCompletion setting) ──────
  // Same division of labor as the history popup above: shellComposerEditor
  // owns tokenizing/matching/the doc edits, this component only renders the
  // popover and mirrors its open/candidates/selected state. `tokenFrom` is
  // only read by mouse clicks (onSelect below) — keyboard-driven cycling
  // (Tab/Arrow) applies candidates from inside shellComposerEditor's own
  // closure state without needing it here.
  const [argOpen, setArgOpen] = useState(false);
  const [argCandidates, setArgCandidates] = useState<string[]>([]);
  const [argSelected, setArgSelected] = useState(0);
  const argTokenFromRef = useRef(0);

  // fontFamily/cursor* intentionally excluded from deps — purely cosmetic,
  // live changes don't warrant tearing down and losing composer focus; the
  // editor picks up current values fresh next time it's (re)created for a
  // phase/session change. historyPopupEnabled/argCompletionEnabled ARE in
  // deps below (unlike those) — they change which keymap branches run, so
  // toggling either should take effect immediately rather than waiting for
  // an unrelated phase/session change.
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
        argCompletion: argCompletionEnabled
          ? {
              setCandidates: (candidates, selected, tokenFrom) => {
                argTokenFromRef.current = tokenFrom;
                setArgCandidates(candidates);
                setArgSelected(selected);
                setArgOpen(true);
              },
              close: () => setArgOpen(false),
            }
          : undefined,
      },
      { fontFamily, cursorStyle, cursorBlink, cursorBlinkInterval },
    );
    const draft = drafts.get(sessionId);
    if (draft) handle.setValue(draft);
    handle.focus();
    handleRef.current = handle;
    // Lets WorkspacePane's click interceptor land focus back here instead of
    // on the raw terminal while Blocks is active and idle (see
    // shouldBlockTerminalClick) — registered only while an editor actually
    // exists to receive it.
    const unregisterFocus = registerComposerFocus(sessionId, () => handleRef.current?.focus());
    // Lets explorer drag-drop (TerminalPane/SshTerminalPane) redirect quoted
    // path pasting here instead of writing straight to the pty — same
    // "only while mounted" lifecycle as the focus handler above.
    const unregisterInsert = registerComposerInsert(sessionId, (text) => handleRef.current?.insertText(text));

    return () => {
      const value = handle.getValue();
      if (value.trim()) drafts.set(sessionId, value);
      else drafts.delete(sessionId);
      unregisterFocus();
      unregisterInsert();
      handle.destroy();
      handleRef.current = null;
      setHistoryOpen(false);
      setArgOpen(false);
    };
  }, [sessionId, phase, kind, historyPopupEnabled, argCompletionEnabled]);

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
      <Popover
        open={historyOpen || argOpen}
        onOpenChange={(open) => {
          if (open) return; // both are only ever opened imperatively, from the keymap
          setHistoryOpen(false);
          setArgOpen(false);
        }}
      >
        <PopoverAnchor asChild>
          <div ref={containerRef} className="nexum-shell-composer min-w-0 flex-1" />
        </PopoverAnchor>
        {historyPopupEnabled && historyOpen && (
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
        {argCompletionEnabled && argOpen && (
          <ArgumentCompletionPopover
            candidates={argCandidates}
            selectedIndex={argSelected}
            onHover={setArgSelected}
            onSelect={(value) => {
              const view = handleRef.current?.view;
              if (view) {
                view.dispatch({
                  changes: { from: argTokenFromRef.current, to: view.state.doc.length, insert: value },
                  selection: { anchor: argTokenFromRef.current + value.length },
                });
                view.focus();
              }
              setArgOpen(false);
            }}
          />
        )}
      </Popover>
    </div>
  );
}
