import { buildTerminalTheme } from "@/styles/terminalTheme";
import { handleApiError } from "@/lib/errors";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { useTheme } from "@/modules/theme";
import type { TerminalSessionData } from "@/modules/tabs";
import {
  BlockDecorations,
  BlockOverlay,
  ModeMachine,
  buildOsc133InjectionScript,
  loadBlockMeta,
  saveBlockMeta,
  waitForFirstOsc133,
} from "@/modules/terminal/block";
import type { BlockMode } from "@/modules/terminal/block";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { FitAddon } from "@xterm/addon-fit";
import { ImageAddon } from "@xterm/addon-image";
import { LigaturesAddon } from "@xterm/addon-ligatures";
import { SearchAddon } from "@xterm/addon-search";
import { SerializeAddon } from "@xterm/addon-serialize";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { WebglAddon } from "@xterm/addon-webgl";
import { Terminal } from "@xterm/xterm";
import { AnimatePresence } from "motion/react";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useChatStore } from "@/modules/ai/store/chatStore";
import { useNotificationStore } from "@/modules/notifications/store/useNotificationStore";
import { explorerDrag } from "@/modules/explorer/lib/explorerDrag";
import { dropPaths } from "./lib/drop-paths";
import { SshLoadingScreen } from "./SshLoadingScreen";
import { SudoFillPopup } from "./SudoFillPopup";
import type { TerminalPaneHandle } from "./TerminalPane";

const FONT_WEIGHT_MAP: Record<string, string | number> = {
  normal: "normal",
  medium: 500,
  bold: "bold",
};

const ANSI_RE = /\x1B\[[0-9;]*[mGKHFJA-Za-z]|\x1B\][^\x07]*\x07|\x1B[@-_][0-?]*[ -/]*[@-~]/g;
const SUDO_PROMPT_RE = /\[sudo\] password for [^:]+:|sudo password:/i;
const TAIL_MAX = 300;

function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, "");
}

function getCursorPixelPos(
  term: Terminal,
  container: HTMLDivElement,
): { x: number; y: number } {
  const rect = container.getBoundingClientRect();
  const cellW = rect.width / term.cols;
  const cellH = rect.height / term.rows;
  return {
    x: rect.left + (term.buffer.active.cursorX + 0.5) * cellW,
    y: rect.top + (term.buffer.active.cursorY + 1) * cellH,
  };
}

interface Props {
  sessionId: string;
  session: TerminalSessionData;
  isActive: boolean;
  tabVisible?: boolean;
  onSearchReady?: (addon: SearchAddon) => void;
}

export const SshTerminalPane = forwardRef<TerminalPaneHandle, Props>(
  function SshTerminalPane({ sessionId, session, isActive, tabVisible = true, onSearchReady}, ref) {
    const [isConnected, setIsConnected] = useState(false);
    const [hasError, setHasError] = useState(false);
    const [isDisconnected, setIsDisconnected] = useState(false);
    const [disconnectReason, setDisconnectReason] = useState("");
    const rightClickPastes = usePreferencesStore((s) => s.terminalRightClickPastes);
    const blockSettings = usePreferencesStore((s) => ({
      showHeader: s.blockTerminalShowHeader,
      showExitCode: s.blockTerminalShowExitCode,
      showExecutionTime: s.blockTerminalShowExecutionTime,
      showCwd: s.blockTerminalShowCwd,
      compactHeaders: s.blockTerminalCompactHeaders,
      highlightFailed: s.blockTerminalHighlightFailed,
      autoCollapseOnAltScreen: s.blockTerminalAutoCollapseOnAltScreen,
    }));
    const [hasSelection, setHasSelection] = useState(false);
    const [sudoPopup, setSudoPopup] = useState<{ x: number; y: number } | null>(null);
    // Real terminal dimensions measured from the actual container element before
    // the SSH connection starts. Avoids the off-by-1-3-column mismatch that the
    // old pixel-heuristic (window.innerWidth / 7.8) produced, which caused
    // history-scroll corruption because the shell initialised with a wrong COLUMNS.
    const [initialDims, setInitialDims] = useState<{ cols: number; rows: number } | null>(null);
    const { resolvedTheme } = useTheme();

    const containerRef = useRef<HTMLDivElement>(null);
    const termRef = useRef<Terminal | null>(null);
    const fitRef = useRef<FitAddon | null>(null);
    const serializeRef = useRef<SerializeAddon | null>(null);
    const searchRef = useRef<SearchAddon | null>(null);
    const onSearchReadyRef = useRef(onSearchReady);
    onSearchReadyRef.current = onSearchReady;
    const sudoPasswordRef = useRef<string | null>(null);
    const sudoDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const outputTailRef = useRef<string>("");
    const sudoPopupRef = useRef<{ x: number; y: number } | null>(null);
    const blockDecorationsRef = useRef<BlockDecorations | null>(null);
    const [blockMode, setBlockMode] = useState<BlockMode>("prompt");

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      termRef.current?.dispose();
      termRef.current = null;
      fitRef.current = null;
      invoke("ssh_disconnect", { sessionId }).catch(console.error);
      if (session.hostId) {
        invoke("ssh_stop_tunnels", { hostId: session.hostId }).catch(console.error);
      }
      setIsDisconnected(false);
      setIsConnected(false);
      setHasError(false);
    }, [sessionId, session.hostId]);

    const handleSudoFill = useCallback(() => {
      const pw = sudoPasswordRef.current;
      if (!pw) return;
      sudoPopupRef.current = null;
      sudoPasswordRef.current = null;
      setSudoPopup(null);
      invoke("ssh_pty_write", { sessionId, data: pw + "\n" }).catch(console.error);
    }, [sessionId]);

    const getSelection = useCallback(
      () => termRef.current?.getSelection() ?? null,
      [],
    );

    useImperativeHandle(ref, () => ({
      write: (data: string) => {
        termRef.current?.write(data);
      },
      focus: () => {
        termRef.current?.focus();
      },
      getBuffer: (maxLines?: number) => {
        const term = termRef.current;
        if (!term) return null;
        const buf = term.buffer.active;
        const start = maxLines ? Math.max(0, buf.length - maxLines) : 0;
        const lines: string[] = [];
        for (let i = start; i < buf.length; i++) {
          lines.push(buf.getLine(i)?.translateToString(true) ?? "");
        }
        return lines.join("\n");
      },
      getSelection,
      serialize: (scrollback?: number) => {
        const addon = serializeRef.current;
        if (!addon) return null;
        return scrollback && scrollback > 0 ? addon.serialize({ scrollback }) : addon.serialize();
      },
    }), [getSelection]);

    // Explorer drag-to-terminal (pointer events, WKWebView-safe)
    const wrapperRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      function onUp(e: PointerEvent) {
        const paths = explorerDrag.get();
        if (!paths || !isConnected) return;
        const el = wrapperRef.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        if (
          e.clientX >= r.left && e.clientX <= r.right &&
          e.clientY >= r.top  && e.clientY <= r.bottom
        ) {
          invoke("ssh_pty_write", { sessionId, data: dropPaths(paths) }).catch(console.error);
          termRef.current?.focus();
        }
      }
      document.addEventListener("pointerup", onUp, { capture: true });
      return () => document.removeEventListener("pointerup", onUp, { capture: true });
    }, [isConnected, sessionId]);

    // Listen for palette-triggered reconnect
    useEffect(() => {
      function onReconnect(e: Event) {
        const paneId = (e as CustomEvent<{ paneId: string }>).detail?.paneId;
        if (paneId === sessionId) handleReconnect();
      }
      window.addEventListener("nexum:ssh-reconnect", onReconnect);
      return () => window.removeEventListener("nexum:ssh-reconnect", onReconnect);
    }, [sessionId, handleReconnect]);

    // Apply live preference changes
    useEffect(() => {
      const unsub = usePreferencesStore.subscribe((state, prev) => {
        const term = termRef.current;
        const fit = fitRef.current;
        if (!term) return;

        if (state.terminalCursorBlink !== prev.terminalCursorBlink)
          term.options.cursorBlink = state.terminalCursorBlink;
        // bellStyle was removed in xterm v6; bell is handled via onBell listener
        if (state.terminalCursorStyle !== prev.terminalCursorStyle)
          term.options.cursorStyle = state.terminalCursorStyle;
        if (state.terminalFontFamily !== prev.terminalFontFamily) {
          term.options.fontFamily = state.terminalFontFamily;
          fit?.fit();
        }
        if (state.terminalFontSize !== prev.terminalFontSize) {
          term.options.fontSize = state.terminalFontSize;
          fit?.fit();
        }
        if (state.terminalLetterSpacing !== prev.terminalLetterSpacing) {
          term.options.letterSpacing = state.terminalLetterSpacing;
          fit?.fit();
        }
        if (state.terminalLineHeight !== prev.terminalLineHeight) {
          term.options.lineHeight = state.terminalLineHeight;
          fit?.fit();
        }
        if (state.terminalFontWeight !== prev.terminalFontWeight) {
          term.options.fontWeight = FONT_WEIGHT_MAP[state.terminalFontWeight] as
            | "normal" | "bold" | "100" | "200" | "300" | "400"
            | "500" | "600" | "700" | "800" | "900" | undefined;
        }
        if (state.terminalRightClickPastes !== prev.terminalRightClickPastes) {
          term.options.rightClickSelectsWord = state.terminalRightClickPastes;
        }
        if (state.terminalWordSeparator !== prev.terminalWordSeparator) {
          term.options.wordSeparator = state.terminalWordSeparator;
        }
        if (state.terminalScrollSensitivity !== prev.terminalScrollSensitivity) {
          term.options.scrollSensitivity = state.terminalScrollSensitivity;
        }
        if (state.terminalFastScrollModifier !== prev.terminalFastScrollModifier) {
          (term.options as Record<string, unknown>).fastScrollModifier =
            state.terminalFastScrollModifier === "none"
              ? undefined
              : state.terminalFastScrollModifier;
        }
      });
      return unsub;
    }, []);

    // Re-apply theme when app theme changes
    useEffect(() => {
      const id = requestAnimationFrame(() => {
        const term = termRef.current;
        if (term) term.options.theme = buildTerminalTheme();
      });
      return () => cancelAnimationFrame(id);
    }, [resolvedTheme]);

    // Initialize xterm.js once connected
    useEffect(() => {
      if (!isConnected) return;

      let disposed = false;
      const cleanups: Array<() => void> = [];

      const earlyBuffer: string[] = [];
      let term: Terminal | null = null;

      listen<{ session_id: string; data: string }>("ssh_pty_output", (event) => {
        if (event.payload.session_id !== sessionId) return;
        const { data } = event.payload;
        if (term) {
          term.write(data);
        } else {
          earlyBuffer.push(data);
        }

        if (session.hostId) {
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
                const pos = term && containerRef.current
                  ? getCursorPixelPos(term, containerRef.current)
                  : { x: window.innerWidth / 2, y: window.innerHeight / 2 };
                showSudoPopup(pos);
              } catch {
                // keychain unavailable — silent no-op
              }
            }, 300);
          }
        }
      }).then((unlisten) => cleanups.push(unlisten));

      listen<{ session_id: string; reason: string }>("ssh_connection_lost", ({ payload }) => {
        if (payload.session_id !== sessionId) return;
        setIsDisconnected(true);
        setDisconnectReason(payload.reason);
        useNotificationStore.getState().addNotification({
          type: "error",
          title: "SSH Connection Lost",
          message: payload.reason || "The connection was dropped unexpectedly.",
          source: session.title || "SSH",
        });
      }).then((unlisten) => cleanups.push(unlisten));

      (async () => {
        const prefs = usePreferencesStore.getState();

        await document.fonts.load(`${prefs.terminalFontSize}px "JetBrains Mono"`);
        if (disposed || !containerRef.current) return;

        const t = new Terminal({
          fontFamily: prefs.terminalFontFamily,
          fontSize: prefs.terminalFontSize,
          lineHeight: prefs.terminalLineHeight,
          letterSpacing: prefs.terminalLetterSpacing,
          theme: buildTerminalTheme(),
          cursorBlink: prefs.terminalCursorBlink,
          cursorStyle: prefs.terminalCursorStyle,
          cursorInactiveStyle: "outline",
          scrollback: prefs.terminalScrollback,
          fontWeight: FONT_WEIGHT_MAP[prefs.terminalFontWeight] as
            | "normal" | "bold" | "100" | "200" | "300" | "400"
            | "500" | "600" | "700" | "800" | "900" | undefined,
          allowProposedApi: true,
          rightClickSelectsWord: prefs.terminalRightClickPastes,
          wordSeparator: prefs.terminalWordSeparator,
          scrollSensitivity: prefs.terminalScrollSensitivity,
          // fastScrollModifier is a runtime option in xterm v6 but not in public types
          ...({
            fastScrollModifier:
              prefs.terminalFastScrollModifier === "none"
                ? undefined
                : prefs.terminalFastScrollModifier,
          } as Record<string, unknown>),
          // OSC 8 hyperlinks — open in the system browser, not the Tauri webview
          linkHandler: {
            activate: (_e: MouseEvent, uri: string) => {
              openUrl(uri).catch((e) => handleApiError(e, "Failed to open URL", "SSH"));
            },
          },
        });
        // copyOnSelect: not a built-in option in xterm v6 — implement via selection event
        t.onSelectionChange(() => {
          if (!usePreferencesStore.getState().terminalCopyOnSelect) return;
          const text = t.getSelection();
          if (text) void navigator.clipboard.writeText(text).catch(() => undefined);
        });
        term = t;
        termRef.current = t;
        t.onBell(() => {
          if (!usePreferencesStore.getState().terminalBell) return;
          try {
            const ctx = new AudioContext();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.frequency.value = 800;
            gain.gain.setValueAtTime(0.3, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.15);
            osc.onended = () => ctx.close();
          } catch { /* ignore AudioContext errors */ }
        });

        const fit = new FitAddon();
        fitRef.current = fit;
        t.loadAddon(fit);
        const search = new SearchAddon();
        searchRef.current = search;
        t.loadAddon(search);
        t.loadAddon(new WebLinksAddon((_e, uri) => openUrl(uri).catch((e) => handleApiError(e, "Failed to open URL", "SSH"))));
        t.loadAddon(new ImageAddon({ storageLimit: 32 }));
        t.open(containerRef.current);
        fit.fit();
        // LigaturesAddon measures font metrics and must be loaded after open()
        t.loadAddon(new LigaturesAddon());

        // SerializeAddon must be loaded after open()
        const serializeAddon = new SerializeAddon();
        serializeRef.current = serializeAddon;
        t.loadAddon(serializeAddon);

        // Block mode setup
        if (session.terminalMode === "block") {
          const decorations = new BlockDecorations(t, () => "");
          decorations.init();
          blockDecorationsRef.current = decorations;

          const mm = new ModeMachine(t);
          const unsubMode = mm.subscribe((mode) => {
            if (!disposed) setBlockMode(mode);
          });

          if (prefs.blockTerminalScrollbackPersistence === "metadata") {
            void loadBlockMeta(session.id).then((blocks) => {
              if (blocks) decorations.hydrateFromMeta(blocks);
            });

            let saveTimer: ReturnType<typeof setTimeout> | null = null;
            const unsubSave = decorations.subscribe(() => {
              if (saveTimer) clearTimeout(saveTimer);
              saveTimer = setTimeout(() => {
                saveTimer = null;
                void saveBlockMeta(session.id, decorations.allBlocks());
              }, 1000);
            });
            cleanups.push(() => {
              if (saveTimer) clearTimeout(saveTimer);
              unsubSave();
            });
          }

          cleanups.push(
            () => { unsubMode(); mm.dispose(); },
            () => { decorations.dispose(); blockDecorationsRef.current = null; },
          );
        }

        // Restore scrollback BEFORE flushing earlyBuffer so old content appears first
        if (!disposed) {
          try {
            const ansi = await invoke<string | null>("scrollback_load", { sessionId });
            if (ansi && !disposed) {
              t.write(ansi);
              const sepLen = Math.max(20, t.cols - 20);
              t.write(`\r\n\x1b[2m\x1b[90m${"─".repeat(sepLen)} session restored \x1b[0m\r\n\r\n`);
            }
          } catch { /* graceful degradation */ }
        }

        // estCols/estRows are rough pixel estimates; send the real dimensions
        // immediately so TUI apps (claude, vim, htop, …) get the correct size.
        invoke("ssh_pty_resize", {
          sessionId,
          cols: t.cols,
          rows: t.rows,
        }).catch(console.error);
        onSearchReadyRef.current?.(search);

        if (prefs.terminalUseWebGL) {
          try {
            const webgl = new WebglAddon();
            webgl.onContextLoss(() => webgl.dispose());
            t.loadAddon(webgl);
          } catch (e) {
            console.warn("WebGL unavailable:", e);
          }
        }

        for (const chunk of earlyBuffer) t.write(chunk);
        earlyBuffer.length = 0;

        if (session.cwd) {
          invoke("ssh_pty_write", { sessionId, data: `cd ${session.cwd}\n` }).catch(console.error);
        }
        if (session.initialCommand) {
          const cmd = session.initialCommand.endsWith("\n") ? session.initialCommand : session.initialCommand + "\n";
          setTimeout(() => {
            if (!disposed) invoke("ssh_pty_write", { sessionId, data: cmd }).catch(console.error);
          }, 300);
        }
        if (session.startupSnippet) {
          const { command, mode } = session.startupSnippet;
          const data = mode === "execute"
            ? (command.endsWith("\n") ? command : command + "\n")
            : command;
          setTimeout(() => {
            if (!disposed) invoke("ssh_pty_write", { sessionId, data }).catch(console.error);
          }, 300);
        }

        // OSC 133 injection for block mode
        if (session.terminalMode === "block") {
          setTimeout(async () => {
            if (disposed) return;
            try {
              const script = buildOsc133InjectionScript("auto");
              await invoke<void>("ssh_pty_write", { sessionId, data: script + "\n" });

              const decorations = blockDecorationsRef.current;
              if (decorations) {
                const injectionTimeout = usePreferencesStore.getState().blockTerminalSshInjectionTimeoutMs ?? 3000;
                const success = await waitForFirstOsc133(decorations, injectionTimeout);
                if (!success) {
                  console.warn("Block terminal: OSC 133 injection timed out — shell integration unavailable");
                  useNotificationStore.getState().addNotification({
                    type: "error",
                    title: "Block Terminal",
                    message: "Shell integration injection timed out. Block mode may not work correctly.",
                    source: session.title || "SSH",
                  });
                }
              }
            } catch (e) {
              console.error("Block terminal: OSC 133 injection failed", e);
            }
          }, 600);
        }

        t.onData((data) => {
          if (sudoPopupRef.current) hideSudoPopup();
          invoke("ssh_pty_write", { sessionId, data }).catch(console.error);
        });

        const FIT_DEBOUNCE_MS = 8;
        const PTY_RESIZE_DEBOUNCE_MS = 256;
        let lastSentCols = t.cols;
        let lastSentRows = t.rows;
        let lastW = containerRef.current.clientWidth;
        let lastH = containerRef.current.clientHeight;
        let fitTimer: ReturnType<typeof setTimeout> | null = null;
        let ptyTimer: ReturnType<typeof setTimeout> | null = null;

        const el = containerRef.current;

        const flushPtyResize = () => {
          ptyTimer = null;
          if (disposed) return;
          if (t.cols === lastSentCols && t.rows === lastSentRows) return;
          lastSentCols = t.cols;
          lastSentRows = t.rows;
          invoke("ssh_pty_resize", {
            sessionId,
            cols: t.cols,
            rows: t.rows,
          }).catch(console.error);
        };

        const observer = new ResizeObserver(() => {
          if (fitTimer) clearTimeout(fitTimer);
          fitTimer = setTimeout(() => {
            fitTimer = null;
            if (disposed) return;
            const w = el.clientWidth;
            const h = el.clientHeight;
            if (w === lastW && h === lastH) return;
            lastW = w;
            lastH = h;
            fit.fit();
            if (ptyTimer) clearTimeout(ptyTimer);
            ptyTimer = setTimeout(flushPtyResize, PTY_RESIZE_DEBOUNCE_MS);
          }, FIT_DEBOUNCE_MS);
        });
        observer.observe(el);
        cleanups.push(() => {
          observer.disconnect();
          if (fitTimer) clearTimeout(fitTimer);
          if (ptyTimer) clearTimeout(ptyTimer);
        });

        if (isActive) t.focus();
      })();

      return () => {
        disposed = true;
        cleanups.forEach((fn) => fn());
        if (sudoDebounceRef.current) clearTimeout(sudoDebounceRef.current);
        sudoPopupRef.current = null;
        sudoPasswordRef.current = null;
        invoke("ssh_disconnect", { sessionId }).catch(console.error);
        if (session.hostId) {
          invoke("ssh_stop_tunnels", { hostId: session.hostId }).catch(console.error);
        }
        termRef.current?.dispose();
        termRef.current = null;
        fitRef.current = null;
        serializeRef.current = null;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isConnected]);

    useLayoutEffect(() => {
      if (!isConnected) return;
      const term = termRef.current;
      const fit = fitRef.current;
      if (term && fit) {
        const prevCols = term.cols;
        const prevRows = term.rows;
        // fit() runs on all panes (not just isActive) so that when tabVisible
        // transitions true, every pane in the workspace is already correctly sized.
        fit.fit();
        if (term.cols !== prevCols || term.rows !== prevRows) {
          invoke("ssh_pty_resize", {
            sessionId,
            cols: term.cols,
            rows: term.rows,
          }).catch(console.error);
        }
      }
      if (isActive && tabVisible) term?.focus();
    }, [isActive, isConnected, tabVisible, sessionId]);

    const paneContent = (
      <div ref={wrapperRef} className="relative h-full w-full">
        {/* Container is always mounted so the ResizeObserver can measure real
            dimensions once the pane slot becomes visible. Hidden behind the
            overlay during the loading phase. */}
        <div ref={containerRef} className="h-full w-full" />
        {session.terminalMode === "block" && (
          <BlockOverlay
            term={termRef.current}
            containerRef={containerRef}
            decorations={blockDecorationsRef.current}
            mode={blockMode}
            sessionId={session.id}
            settings={blockSettings}
            searchAddon={searchRef.current}
          />
        )}
        {(!isConnected && !hasError) && (initialDims ? (
          <div className="absolute inset-0 z-10">
            <SshLoadingScreen
              sessionId={sessionId}
              hostId={session.hostId}
              quickConnect={session.quickConnect}
              hostName={session.title}
              connectionType="ssh"
              initialCols={initialDims.cols}
              initialRows={initialDims.rows}
              onConnected={() => setIsConnected(true)}
              onError={() => setHasError(true)}
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
            <div className="rounded-xl border border-border bg-card p-6 shadow-xl flex flex-col items-center gap-3 max-w-xs text-center">
              <span className="text-base font-semibold text-foreground">Connection Lost</span>
              <span className="text-sm text-muted-foreground">{disconnectReason}</span>
              <Button onClick={handleReconnect}>Reconnect</Button>
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
      <ContextMenu onOpenChange={(open) => { if (open) setHasSelection(!!getSelection()); }}>
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
              void navigator.clipboard.readText()
                .then((t) => invoke("ssh_pty_write", { sessionId, data: t }).catch(console.error))
                .catch(console.error);
            }}
          >
            Paste
          </ContextMenuItem>
          <ContextMenuItem
            onSelect={() =>
              invoke("ssh_pty_write", { sessionId, data: "clear\n" }).catch(console.error)
            }
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
  },
);
