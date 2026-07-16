import { invoke, type Channel } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { SearchAddon } from "@xterm/addon-search";
import { AnimatePresence } from "motion/react";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useChatStore } from "@/modules/ai/store/chatStore";
import { explorerDrag } from "@/modules/explorer/lib/explorerDrag";
import { reconnectExplorerSessionForHost } from "@/modules/explorer/lib/useLazyExplorerSession";
import { useConnectionStatusStore, useHostsStore } from "@/modules/hosts";
import { useNotificationStore } from "@/modules/notifications/store/useNotificationStore";
import { usePreferencesStore } from "@/modules/settings/preferences";
import type { TerminalSessionData } from "@/modules/tabs";
import { useTheme } from "@/modules/theme";
import { dropPaths } from "./lib/drop-paths";
import { safeCursorPos } from "./lib/osc-handlers";
import { applyTheme as poolApplyTheme, getSlotForLeaf } from "./lib/rendererPool";
import { PtyResizeQueue } from "./lib/resizeQueue";
import { createSshOutputChannel, type SshPtyEvent } from "./lib/ssh-pty-bridge";
import {
  deliverText,
  focus as registryFocus,
  getBuffer as registryGetBuffer,
  getSelection as registryGetSelection,
  insertIntoComposer,
  registerSession,
  resetForReconnect,
  serialize as registrySerialize,
  setContainer,
  setFocused,
  setVisible,
  type SessionBridge,
} from "./lib/terminalSessionRegistry";
import { SshLoadingScreen } from "./SshLoadingScreen";
import { SudoFillPopup } from "./SudoFillPopup";
import type { TerminalPaneHandle } from "./TerminalPane";

const ANSI_RE = /\x1B\[[0-9;]*[mGKHFJA-Za-z]|\x1B\][^\x07]*\x07|\x1B[@-_][0-?]*[ -/]*[@-~]/g;
const SUDO_PROMPT_RE = /\[sudo\] password for [^:]+:|sudo password:/i;
const TAIL_MAX = 300;

function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, "");
}

function getCursorPixelPos(sessionId: string, container: HTMLDivElement): { x: number; y: number } {
  const term = getSlotForLeaf(sessionId)?.term;
  // During a renderer-pool slot rebind, cursorX/cursorY can transiently be
  // non-finite (same window the CPR handler guards against) — fall back to
  // screen-center rather than positioning the popup at a NaN offset.
  const pos = term ? safeCursorPos(term) : null;
  if (!term || !pos) return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  const rect = container.getBoundingClientRect();
  const cellW = rect.width / term.cols;
  const cellH = rect.height / term.rows;
  return {
    x: rect.left + (pos.x + 0.5) * cellW,
    y: rect.top + (pos.y + 1) * cellH,
  };
}

interface Props {
  sessionId: string;
  /** The owning `WorkspaceTab.id` — used only to populate `ConnectionEntry.workspaceTabId`
   *  so the StatusBar jump-host dropdown can focus the right tab on click. */
  tabId: number;
  session: TerminalSessionData;
  isActive: boolean;
  tabVisible?: boolean;
  onSearchReady?: (addon: SearchAddon) => void;
  /** OSC 7 cwd reports from the remote shell — see ssh::shell_integration on
   *  the Rust side for how the hook gets installed. Lets the sidebar
   *  explorer / breadcrumb follow `cd` on a remote shell like they already
   *  do for local terminals. */
  onCwd?: (cwd: string) => void;
}

export const SshTerminalPane = forwardRef<TerminalPaneHandle, Props>(function SshTerminalPane(
  { sessionId, tabId, session, isActive, tabVisible = true, onSearchReady, onCwd },
  ref,
) {
  const [isConnected, setIsConnected] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [isDisconnected, setIsDisconnected] = useState(false);
  const [disconnectReason, setDisconnectReason] = useState("");
  const [reconnectCountdown, setReconnectCountdown] = useState(0);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const [autoReconnectFailed, setAutoReconnectFailed] = useState(false);
  const rightClickPastes = usePreferencesStore((s) => s.terminalRightClickPastes);
  const sshAutoReconnectMaxAttempts = usePreferencesStore((s) => s.sshAutoReconnectMaxAttempts);
  const [hasSelection, setHasSelection] = useState(false);
  const [sudoPopup, setSudoPopup] = useState<{ x: number; y: number } | null>(null);
  // Real terminal dimensions measured from the actual container element before
  // the SSH connection starts. Avoids the off-by-1-3-column mismatch that the
  // old pixel-heuristic (window.innerWidth / 7.8) produced, which caused
  // history-scroll corruption because the shell initialised with a wrong COLUMNS.
  const [initialDims, setInitialDims] = useState<{ cols: number; rows: number } | null>(null);
  const { resolvedTheme } = useTheme();

  const containerRef = useRef<HTMLDivElement>(null);
  const tabVisibleRef = useRef(tabVisible);
  useEffect(() => {
    tabVisibleRef.current = tabVisible;
  }, [tabVisible]);
  const onSearchReadyRef = useRef(onSearchReady);
  onSearchReadyRef.current = onSearchReady;
  const onCwdRef = useRef(onCwd);
  onCwdRef.current = onCwd;
  const sudoPasswordRef = useRef<string | null>(null);
  const sudoDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const outputTailRef = useRef<string>("");
  const sudoPopupRef = useRef<{ x: number; y: number } | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const intentionalDisconnectRef = useRef(false);
  const reconnectAttemptRef = useRef(0);

  // Per-session output channel — point-to-point delivery from the Rust reader
  // thread. Its `onmessage` starts out buffering into `preConnectBufferRef`
  // (data can start flowing before `isConnected` flips true — see the
  // connected-effect below, which hands off to live delivery and drains this
  // buffer). `handleReconnect` replaces the channel with a fresh one so a
  // stale channel from a dead connection is never reused.
  const preConnectBufferRef = useRef<string[]>([]);
  const handlePreConnectData = useCallback((data: string) => {
    preConnectBufferRef.current.push(data);
  }, []);
  const [channel, setChannel] = useState<Channel<SshPtyEvent>>(() =>
    createSshOutputChannel(handlePreConnectData),
  );

  // Measure the real container dimensions once the pane is actually visible.
  // We use a ResizeObserver instead of a one-shot useLayoutEffect because
  // SshTerminalPane mounts while its parent in WorkspacePane still has
  // display:none (paneRects hasn't been computed yet). getBoundingClientRect()
  // returns 0×0 at that point, so the one-shot approach never sets initialDims
  // and the loading screen never appears. The observer fires as soon as the
  // slot rect is resolved and the container gets real dimensions.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const obs = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      if (width === 0 || height === 0) return;
      const prefs = usePreferencesStore.getState();
      try {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("no 2d context");
        ctx.font = `${prefs.terminalFontSize}px ${prefs.terminalFontFamily}`;
        const charWidth = Math.ceil(ctx.measureText("W").width) + (prefs.terminalLetterSpacing ?? 0);
        const charHeight = Math.ceil(prefs.terminalFontSize * (prefs.terminalLineHeight ?? 1.0));
        setInitialDims({
          cols: Math.max(2, Math.floor(width / charWidth)),
          rows: Math.max(1, Math.floor(height / charHeight)),
        });
      } catch {
        setInitialDims({
          cols: Math.max(80, Math.floor(width / 7.8)),
          rows: Math.max(24, Math.floor(height / 17)),
        });
      }
      obs.disconnect(); // measure once, then stop
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const showSudoPopup = useCallback((pos: { x: number; y: number }) => {
    sudoPopupRef.current = pos;
    setSudoPopup(pos);
  }, []);

  const hideSudoPopup = useCallback(() => {
    sudoPopupRef.current = null;
    sudoPasswordRef.current = null;
    setSudoPopup(null);
  }, []);

  const handleReconnect = useCallback(() => {
    // Clean up auto-reconnect state
    if (reconnectTimerRef.current) {
      clearInterval(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    intentionalDisconnectRef.current = false;
    setReconnectCountdown(0);
    setAutoReconnectFailed(false);
    // Reset in place rather than releasing the renderer-pool slot back to the
    // pool — the session identity (sessionId) never changes across a
    // reconnect, so there's no reason to pay for a full slot teardown/rebuild
    // on the next bind.
    resetForReconnect(sessionId);
    invoke("ssh_disconnect", { sessionId }).catch(console.error);
    if (session.hostId) {
      invoke("ssh_stop_tunnels", { hostId: session.hostId }).catch(console.error);
    }
    // Fresh channel for the new connection attempt — the old one belonged to
    // a now-dead reader thread and must not be reused.
    preConnectBufferRef.current = [];
    setChannel(createSshOutputChannel(handlePreConnectData));
    setIsDisconnected(false);
    setIsConnected(false);
    setHasError(false);
    useConnectionStatusStore.getState().setStatus(sessionId, "connecting");
  }, [sessionId, session.hostId, handlePreConnectData]);

  const handleCancelReconnect = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearInterval(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    intentionalDisconnectRef.current = true;
    setReconnectCountdown(0);
    setAutoReconnectFailed(false);
    setReconnectAttempt(0);
    reconnectAttemptRef.current = 0;
  }, []);

  const startAutoReconnect = useCallback(() => {
    const prefs = usePreferencesStore.getState();
    const delay = Math.max(1, prefs.sshAutoReconnectDelay);
    const maxAttempts = prefs.sshAutoReconnectMaxAttempts;

    reconnectAttemptRef.current += 1;
    const attempt = reconnectAttemptRef.current;

    if (attempt > maxAttempts) {
      setAutoReconnectFailed(true);
      setReconnectCountdown(0);
      return;
    }

    setReconnectAttempt(attempt);
    setReconnectCountdown(delay);

    if (reconnectTimerRef.current) clearInterval(reconnectTimerRef.current);
    reconnectTimerRef.current = setInterval(() => {
      setReconnectCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(reconnectTimerRef.current!);
          reconnectTimerRef.current = null;
          handleReconnect();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, [handleReconnect]);

  // Keep a stable ref to startAutoReconnect for use inside event listeners
  const startAutoReconnectRef = useRef(startAutoReconnect);
  startAutoReconnectRef.current = startAutoReconnect;

  const handleSudoFill = useCallback(() => {
    const pw = sudoPasswordRef.current;
    if (!pw) return;
    sudoPopupRef.current = null;
    sudoPasswordRef.current = null;
    setSudoPopup(null);
    invoke("ssh_pty_write", { sessionId, data: pw + "\n" }).catch(console.error);
  }, [sessionId]);

  const getSelection = useCallback(() => registryGetSelection(sessionId), [sessionId]);

  useImperativeHandle(
    ref,
    () => ({
      write: (data: string) => {
        // Sends to the remote shell (matches local TerminalPane's `write`,
        // which forwards to the pty process, not the local render buffer).
        invoke("ssh_pty_write", { sessionId, data }).catch(console.error);
      },
      focus: () => registryFocus(sessionId),
      getBuffer: (maxLines?: number) => registryGetBuffer(sessionId, maxLines),
      getSelection,
      serialize: (scrollback?: number) => registrySerialize(sessionId, scrollback),
    }),
    [sessionId, getSelection],
  );

  // Explorer drag-to-terminal (pointer events, WKWebView-safe)
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onUp(e: PointerEvent) {
      if (!tabVisibleRef.current) return;
      const drag = explorerDrag.get();
      if (!drag || !isConnected) return;
      const el = wrapperRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
        const { terminalComposerEnabled, terminalBlocksEnabled } = usePreferencesStore.getState();
        if (
          terminalComposerEnabled &&
          terminalBlocksEnabled &&
          insertIntoComposer(sessionId, dropPaths(drag.paths))
        ) {
          return;
        }
        invoke("ssh_pty_write", { sessionId, data: dropPaths(drag.paths) }).catch(console.error);
        registryFocus(sessionId);
      }
    }
    document.addEventListener("pointerup", onUp, { capture: true });
    return () => document.removeEventListener("pointerup", onUp, { capture: true });
  }, [isConnected, sessionId]);

  // Tracks this pane's live status in the shared cross-tab connection-status
  // store — feeds the StatusBar jump-host dropdown, which aggregates over
  // every open terminal/SFTP/explorer connection, not just the active tab.
  // Runs independently of the isConnected-gated effect below (which owns the
  // PTY/channel lifecycle) so an unconditional `remove()` fires on every
  // unmount path, including a pane that errors out before ever connecting —
  // that effect's own cleanup only runs once `isConnected` has been true.
  useEffect(() => {
    if (!session.hostId) return; // quick-connect sessions have no Host row, hence no possible jump host
    const hostId = session.hostId;
    const host = useHostsStore.getState().hosts.find((h) => h.id === hostId);
    const jumpHostName = host?.jump_host_id
      ? (useHostsStore.getState().hosts.find((h) => h.id === host.jump_host_id)?.name ?? "unknown host")
      : null;
    useConnectionStatusStore.getState().upsert(sessionId, {
      hostId,
      kind: "terminal",
      status: "connecting",
      error: null,
      jumpHostName,
      hostLabel: session.title,
      workspaceTabId: tabId,
      paneId: sessionId,
    });
    return () => useConnectionStatusStore.getState().remove(sessionId);
  }, [sessionId, tabId, session.hostId, session.title]);

  // Listen for palette-triggered reconnect
  useEffect(() => {
    function onReconnect(e: Event) {
      const paneId = (e as CustomEvent<{ paneId: string }>).detail?.paneId;
      if (paneId === sessionId) handleReconnect();
    }
    window.addEventListener("labonair:ssh-reconnect", onReconnect);
    return () => window.removeEventListener("labonair:ssh-reconnect", onReconnect);
  }, [sessionId, handleReconnect]);

  // Register with the renderer-pool session registry and wire the output
  // channel once connected. Font/theme/WebGL/addon setup, the resize
  // observer, bell, copy-on-select and key handling all live on the shared
  // pool slot now (rendererPool.ts) — this effect only owns SSH-specific
  // concerns: the connection lifecycle, sudo-prompt detection, and the
  // scrollback-then-live-output ordering on (re)connect.
  // biome-ignore lint/correctness/useExhaustiveDependencies: session/sessionId/callback refs are intentionally excluded — this effect keys only off connection identity (isConnected, channel), reading the rest fresh via refs/closures each run
  useEffect(() => {
    if (!isConnected) return;

    let disposed = false;
    const cleanups: Array<() => void> = [];
    const earlyBuffer: string[] = [];

    const resizeQueue = new PtyResizeQueue((cols, rows) =>
      invoke("ssh_pty_resize", { sessionId, cols, rows }),
    );

    const bridge: SessionBridge = {
      writeToPty: (data) => {
        if (sudoPopupRef.current) hideSudoPopup();
        invoke("ssh_pty_write", { sessionId, data }).catch(console.error);
      },
      resizePty: (cols, rows) => {
        resizeQueue.resize(cols, rows);
      },
      kickPty: (cols, rows) => {
        resizeQueue.kick(cols, rows);
      },
    };

    registerSession({
      sessionId,
      bridge,
      callbacks: {
        onSearchReady: (a) => onSearchReadyRef.current?.(a),
        onCwd: (c) => onCwdRef.current?.(c),
      },
      // Mirrors the `blocks` flag SshLoadingScreen just sent to ssh_connect
      // (read fresh, same lifecycle moment — connect and this registration
      // happen back-to-back for the same session).
      blocksBakedIn: usePreferencesStore.getState().terminalBlocksEnabled,
      isRemote: true,
    });
    if (containerRef.current) setContainer(sessionId, containerRef.current);
    setFocused(sessionId, isActive && tabVisible);
    setVisible(sessionId, tabVisible);

    const scanForSudoPrompt = (data: string) => {
      if (!session.hostId) return;
      const stripped = stripAnsi(data);
      outputTailRef.current = (outputTailRef.current + stripped).slice(-TAIL_MAX);
      if (SUDO_PROMPT_RE.test(outputTailRef.current)) {
        if (sudoDebounceRef.current) clearTimeout(sudoDebounceRef.current);
        sudoDebounceRef.current = setTimeout(async () => {
          sudoDebounceRef.current = null;
          if (sudoPopupRef.current) return;
          try {
            const pw = await invoke<string | null>("get_sudo_password", { hostId: session.hostId });
            if (!pw) return;
            sudoPasswordRef.current = pw;
            const pos = containerRef.current
              ? getCursorPixelPos(sessionId, containerRef.current)
              : { x: window.innerWidth / 2, y: window.innerHeight / 2 };
            showSudoPopup(pos);
          } catch {
            // keychain unavailable — silent no-op
          }
        }, 300);
      }
    };

    // Hand the channel off from "buffer until connected" (createSshOutputChannel's
    // initial handler, wired in the state initializer above) to a local
    // buffer that preserves ordering until scrollback has loaded — mirrors
    // the pre-connect-race handling this pane already does.
    if (preConnectBufferRef.current.length > 0) {
      earlyBuffer.push(...preConnectBufferRef.current);
      preConnectBufferRef.current = [];
    }
    channel.onmessage = (event) => {
      if (event.type !== "data") return;
      earlyBuffer.push(event.data);
      scanForSudoPrompt(event.data);
    };

    (async () => {
      // Register both listeners concurrently — a sequential await would open a
      // window where ssh_connection_lost or session_established could fire before
      // their listener is live, silently dropping the event.
      const [unlistenLost, unlistenEstablished] = await Promise.all([
        listen<{ session_id: string; reason: string }>("ssh_connection_lost", ({ payload }) => {
          if (payload.session_id !== sessionId) return;
          setIsDisconnected(true);
          setDisconnectReason(payload.reason);
          useConnectionStatusStore.getState().setStatus(sessionId, "error", payload.reason);
          useNotificationStore.getState().addNotification({
            type: "error",
            title: "SSH Connection Lost",
            message: payload.reason || "The connection was dropped unexpectedly.",
            source: session.title || "SSH",
          });
          // Read prefs fresh at disconnect time so live setting changes are respected.
          const currentPrefs = usePreferencesStore.getState();
          const isAuthFailure = (payload.reason ?? "").toLowerCase().includes("auth");
          if (!intentionalDisconnectRef.current && currentPrefs.sshAutoReconnect && !isAuthFailure) {
            reconnectAttemptRef.current = 0;
            startAutoReconnectRef.current();
          }
        }),
        listen<{ session_id: string }>("session_established", ({ payload }) => {
          if (payload.session_id !== sessionId) return;
          reconnectAttemptRef.current = 0;
          setReconnectAttempt(0);
          setAutoReconnectFailed(false);
          useConnectionStatusStore.getState().setStatus(sessionId, "connected");
          // The sidebar Explorer's lazy session for this host (if any) is a
          // completely separate SSH/SFTP connection from this terminal's PTY
          // session — nothing else tells it the network is back. Quick-
          // connect sessions have no saved host, so nothing to notify.
          if (session.hostId) reconnectExplorerSessionForHost(session.hostId);
        }),
      ]);
      if (disposed) {
        unlistenLost();
        unlistenEstablished();
        return;
      }
      cleanups.push(unlistenLost, unlistenEstablished);

      // Restore scrollback BEFORE flushing earlyBuffer so old content appears first.
      try {
        const ansi = await invoke<string | null>("scrollback_load", {
          sessionId,
          maxBytes: usePreferencesStore.getState().scrollbackMaxSizeMb * 1024 * 1024,
        });
        if (ansi && !disposed) {
          deliverText(sessionId, ansi);
          const cols = getSlotForLeaf(sessionId)?.term.cols ?? 80;
          const sepLen = Math.max(20, cols - 20);
          deliverText(sessionId, `\r\n\x1b[2m\x1b[90m${"─".repeat(sepLen)} session restored \x1b[0m\r\n\r\n`);
        }
      } catch {
        /* graceful degradation */
      }
      if (disposed) return;

      for (const chunk of earlyBuffer) deliverText(sessionId, chunk);
      earlyBuffer.length = 0;
      channel.onmessage = (event) => {
        if (event.type !== "data") return;
        deliverText(sessionId, event.data);
        scanForSudoPrompt(event.data);
      };

      if (session.cwd) {
        invoke("ssh_pty_write", { sessionId, data: `cd ${session.cwd}\n` }).catch(console.error);
      }
      if (session.initialCommand) {
        const cmd = session.initialCommand.endsWith("\n")
          ? session.initialCommand
          : session.initialCommand + "\n";
        setTimeout(() => {
          if (!disposed) invoke("ssh_pty_write", { sessionId, data: cmd }).catch(console.error);
        }, 300);
      }
      if (session.startupSnippet) {
        const { command, mode } = session.startupSnippet;
        const data = mode === "execute" ? (command.endsWith("\n") ? command : command + "\n") : command;
        setTimeout(() => {
          if (!disposed) invoke("ssh_pty_write", { sessionId, data }).catch(console.error);
        }, 300);
      }
    })().catch(console.error);

    return () => {
      disposed = true;
      resizeQueue.dispose();
      cleanups.forEach((fn) => fn());
      if (sudoDebounceRef.current) clearTimeout(sudoDebounceRef.current);
      if (reconnectTimerRef.current) {
        // Cleared unconditionally: a pending auto-reconnect countdown must
        // never fire after this cleanup — it would call handleReconnect()
        // against a session that's already tearing down.
        clearInterval(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      sudoPopupRef.current = null;
      sudoPasswordRef.current = null;
      invoke("ssh_disconnect", { sessionId }).catch(console.error);
      if (session.hostId) {
        invoke("ssh_stop_tunnels", { hostId: session.hostId }).catch(console.error);
      }
    };
  }, [isConnected, channel]);

  useEffect(() => {
    setFocused(sessionId, isActive && tabVisible);
    setVisible(sessionId, tabVisible);
  }, [sessionId, isActive, tabVisible]);

  // Re-apply theme when app theme changes — a global pool-wide operation, but
  // something has to trigger it, and a pure-SSH workspace (no local tabs
  // mounted) would otherwise never call it at all.
  // biome-ignore lint/correctness/useExhaustiveDependencies: resolvedTheme isn't read in the body — it's the intentional re-run trigger for the global poolApplyTheme() call
  useEffect(() => {
    poolApplyTheme();
  }, [resolvedTheme]);

  const paneContent = (
    <div ref={wrapperRef} className="relative h-full w-full">
      {/* Container is always mounted so the ResizeObserver can measure real
            dimensions once the pane slot becomes visible. Hidden behind the
            overlay during the loading phase. */}
      <div ref={containerRef} className="h-full w-full" />
      {!isConnected &&
        !hasError &&
        (initialDims ? (
          <div className="absolute inset-0 z-10">
            <SshLoadingScreen
              sessionId={sessionId}
              hostId={session.hostId}
              quickConnect={session.quickConnect}
              hostName={session.title}
              connectionType="ssh"
              initialCols={initialDims.cols}
              initialRows={initialDims.rows}
              channel={channel}
              onConnected={() => {
                setIsConnected(true);
                useConnectionStatusStore.getState().setStatus(sessionId, "connected");
              }}
              onError={(message) => {
                setHasError(true);
                useConnectionStatusStore.getState().setStatus(sessionId, "error", message);
              }}
            />
          </div>
        ) : (
          // Container just mounted, measurement pending — blank for one frame.
          <div className="absolute inset-0 z-10 bg-background" />
        ))}
      {hasError && (
        <div className="absolute inset-0 z-10 flex items-center justify-center text-muted-foreground text-sm bg-background">
          Connection closed.
        </div>
      )}
      {isDisconnected && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/80">
          <div className="rounded-xl border border-border bg-card p-6 shadow-xl flex flex-col items-center gap-3 max-w-sm w-full text-center">
            <span className="text-base font-semibold text-foreground">Connection Lost</span>
            {disconnectReason && <span className="text-sm text-muted-foreground">{disconnectReason}</span>}
            {reconnectCountdown > 0 && !autoReconnectFailed && (
              <>
                <span className="text-sm text-muted-foreground">
                  Auto-reconnecting in {reconnectCountdown}s…{" "}
                  <span className="text-xs">
                    (Attempt {reconnectAttempt} / {sshAutoReconnectMaxAttempts})
                  </span>
                </span>
                <div className="flex gap-2 w-full">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 h-8 text-xs"
                    onClick={handleCancelReconnect}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    className="flex-1 h-8 text-xs"
                    onClick={() => {
                      if (reconnectTimerRef.current) {
                        clearInterval(reconnectTimerRef.current);
                        reconnectTimerRef.current = null;
                      }
                      setReconnectCountdown(0);
                      handleReconnect();
                    }}
                  >
                    Reconnect Now
                  </Button>
                </div>
              </>
            )}
            {autoReconnectFailed && (
              <>
                <span className="text-sm text-muted-foreground">
                  Could not reconnect after {sshAutoReconnectMaxAttempts} attempts.
                </span>
                <Button
                  size="sm"
                  onClick={() => {
                    setAutoReconnectFailed(false);
                    reconnectAttemptRef.current = 0;
                    handleReconnect();
                  }}
                >
                  Retry
                </Button>
              </>
            )}
            {reconnectCountdown === 0 && !autoReconnectFailed && (
              <Button onClick={handleReconnect}>Reconnect</Button>
            )}
          </div>
        </div>
      )}
      <AnimatePresence>
        {sudoPopup && (
          <SudoFillPopup
            key="sudo-fill"
            x={sudoPopup.x}
            y={sudoPopup.y}
            onFill={handleSudoFill}
            onDismiss={hideSudoPopup}
          />
        )}
      </AnimatePresence>
    </div>
  );

  if (rightClickPastes) return paneContent;

  return (
    <ContextMenu
      onOpenChange={(open) => {
        if (open) setHasSelection(!!getSelection());
      }}
    >
      <ContextMenuTrigger asChild>{paneContent}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem
          disabled={!hasSelection}
          onSelect={() => {
            const sel = getSelection() ?? "";
            void navigator.clipboard.writeText(sel).catch(() => undefined);
          }}
        >
          Copy
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={() => {
            void navigator.clipboard
              .readText()
              .then((t) => invoke("ssh_pty_write", { sessionId, data: t }).catch(console.error))
              .catch(console.error);
          }}
        >
          Paste
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={() => invoke("ssh_pty_write", { sessionId, data: "clear\n" }).catch(console.error)}
        >
          Clear
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          disabled={!hasSelection}
          onSelect={() => {
            const sel = getSelection() ?? "";
            useChatStore.getState().attachSelection(sel, "terminal");
          }}
        >
          Ask AI about Selection
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
});
