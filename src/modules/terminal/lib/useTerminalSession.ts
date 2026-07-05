import { usePreferencesStore } from "@/modules/settings/preferences";
import { invoke } from "@tauri-apps/api/core";
import type { SearchAddon } from "@xterm/addon-search";
import { useCallback, useEffect, useRef } from "react";
import { openPty, type PtySession } from "./pty-bridge";
import { applyTheme as poolApplyTheme } from "./rendererPool";
import {
  clear as registryClear,
  deliverBytes,
  focus as registryFocus,
  getBuffer as registryGetBuffer,
  getSelection as registryGetSelection,
  registerSession,
  serialize as registrySerialize,
  setContainer,
  setFocused,
  setShellExited,
  setVisible,
  write as registryWrite,
  type SessionBridge,
} from "./terminalSessionRegistry";

type Options = {
  container: React.RefObject<HTMLDivElement | null>;
  visible: boolean;
  sessionId?: string;
  initialCwd?: string;
  initialCommand?: string;
  onSearchReady?: (addon: SearchAddon) => void;
  onExit?: (code: number) => void;
  onCwd?: (cwd: string) => void;
  onDetectedLocalUrl?: (url: string) => void;
};

export function useTerminalSession({
  container,
  visible,
  sessionId,
  initialCwd,
  initialCommand,
  onSearchReady,
  onExit,
  onCwd,
  onDetectedLocalUrl,
}: Options) {
  const onDetectedRef = useRef(onDetectedLocalUrl);
  const onCwdRef = useRef(onCwd);
  const onExitRef = useRef(onExit);
  const onSearchReadyRef = useRef(onSearchReady);
  useEffect(() => {
    onDetectedRef.current = onDetectedLocalUrl;
    onCwdRef.current = onCwd;
    onExitRef.current = onExit;
    onSearchReadyRef.current = onSearchReady;
  }, [onDetectedLocalUrl, onCwd, onExit, onSearchReady]);

  const ptyRef = useRef<PtySession | null>(null);
  const pendingInputRef = useRef("");
  // The renderer pool may bind (and therefore fit + resize) this session
  // before `openPty` resolves — resizePty stashes the latest known size here
  // regardless of whether the pty exists yet, so the size isn't silently
  // dropped; a catch-up resize fires once the pty is actually open.
  const pendingSizeRef = useRef<{ cols: number; rows: number } | null>(null);

  // Registers this session once per mount and wires visibility/focus through
  // to the renderer pool. `sessionId` is stable for a pane's lifetime.
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally sessionId-only — initialCwd/initialCommand only ever seed the first spawn, re-running on their change would tear down and respawn a live pty
  useEffect(() => {
    if (!sessionId) return;
    let disposed = false;

    const bridge: SessionBridge = {
      writeToPty: (data) => {
        if (ptyRef.current) void ptyRef.current.write(data);
        else pendingInputRef.current += data;
      },
      resizePty: (cols, rows) => {
        pendingSizeRef.current = { cols, rows };
        void ptyRef.current?.resize(cols, rows);
      },
      kickPty: (cols, rows) => {
        const pty = ptyRef.current;
        if (!pty || cols <= 0 || rows <= 0) return;
        // Linux only emits SIGWINCH when the winsize ioctl actually changes
        // dims, so bump +1 row then restore to force a TUI repaint.
        pty
          .resize(cols, rows + 1)
          .then(() => pty.resize(cols, rows))
          .catch((e) => console.warn("[labonair] kickPty failed:", e));
      },
    };

    const blocksPref = usePreferencesStore.getState().terminalBlocksEnabled;

    registerSession({
      sessionId,
      bridge,
      callbacks: {
        onSearchReady: (a) => onSearchReadyRef.current?.(a),
        onExit: (c) => onExitRef.current?.(c),
        onCwd: (c) => onCwdRef.current?.(c),
        onDetectedLocalUrl: (u) => onDetectedRef.current?.(u),
      },
      blocksBakedIn: blocksPref,
      checkForegroundJob: async () => {
        const pty = ptyRef.current;
        if (!pty) return false;
        try {
          return await invoke<boolean>("pty_has_foreground_job", { id: pty.id });
        } catch {
          return false;
        }
      },
    });

    if (container.current) setContainer(sessionId, container.current);
    setFocused(sessionId, visible);
    setVisible(sessionId, visible);

    (async () => {
      const shellPref = usePreferencesStore.getState().terminalShell;
      const startCols = pendingSizeRef.current?.cols ?? 80;
      const startRows = pendingSizeRef.current?.rows ?? 24;
      const pty = await openPty(
        startCols,
        startRows,
        {
          onData: (bytes) => deliverBytes(sessionId, bytes),
          onExit: (code) => {
            setShellExited(sessionId, true);
            onExitRef.current?.(code);
          },
        },
        initialCwd,
        shellPref || undefined,
        blocksPref,
      );
      if (disposed) {
        pty.close();
        return;
      }
      ptyRef.current = pty;
      if (pendingInputRef.current) {
        void pty.write(pendingInputRef.current);
        pendingInputRef.current = "";
      }
      // Catch up if the real size (measured by the pool's first bind) arrived
      // — or changed again — while the pty was still spawning.
      const pending = pendingSizeRef.current;
      if (pending && (pending.cols !== startCols || pending.rows !== startRows)) {
        void pty.resize(pending.cols, pending.rows);
      }
      if (initialCommand) {
        const cmd = initialCommand.endsWith("\n") ? initialCommand : `${initialCommand}\n`;
        setTimeout(() => {
          if (!disposed) void pty.write(cmd);
        }, 150);
      }
    })();

    return () => {
      disposed = true;
      ptyRef.current?.close();
      ptyRef.current = null;
    };
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;
    setFocused(sessionId, visible);
    setVisible(sessionId, visible);
  }, [sessionId, visible]);

  // Live preference changes (font/cursor/scrollback/WebGL/…) are applied to
  // every pool slot by a single module-level subscription in rendererPool.ts
  // (see bindPreferencesListener) — not per-hook-instance, so it keeps
  // working even for a workspace with only SSH tabs mounted.

  const write = useCallback(
    (data: string) => {
      if (sessionId) registryWrite(sessionId, data);
    },
    [sessionId],
  );

  const focus = useCallback(() => {
    if (sessionId) registryFocus(sessionId);
  }, [sessionId]);

  const getBuffer = useCallback(
    (maxLines = 200): string | null => (sessionId ? registryGetBuffer(sessionId, maxLines) : null),
    [sessionId],
  );

  const getSelection = useCallback(
    (): string | null => (sessionId ? registryGetSelection(sessionId) : null),
    [sessionId],
  );

  const clear = useCallback(() => {
    if (sessionId) registryClear(sessionId);
  }, [sessionId]);

  const applyTheme = useCallback(() => {
    poolApplyTheme();
  }, []);

  const serialize = useCallback(
    (scrollbackLines?: number): string | null =>
      sessionId ? registrySerialize(sessionId, scrollbackLines) : null,
    [sessionId],
  );

  return { write, focus, getBuffer, getSelection, clear, applyTheme, serialize };
}
