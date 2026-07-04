import { buildTerminalTheme } from "@/styles/terminalTheme";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { FitAddon } from "@xterm/addon-fit";
import { ImageAddon } from "@xterm/addon-image";
import { LigaturesAddon } from "@xterm/addon-ligatures";
import { SearchAddon } from "@xterm/addon-search";
import { SerializeAddon } from "@xterm/addon-serialize";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { WebglAddon } from "@xterm/addon-webgl";
import { Terminal } from "@xterm/xterm";
import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { containsSchemeSeparator, LOCAL_URL_RE, stripTrailingPunct } from "./detectLocalUrl";
import { registerCwdHandler, registerPromptTracker, registerTerminalQueryHandlers } from "./osc-handlers";
import { attachToPty, decodeBase64, openPty, type PtyEvent, type PtySession } from "./pty-bridge";
import { resumeSession, suspendSession, type DecodedChunk } from "./suspendedSessionBuffer";

type Options = {
  container: React.RefObject<HTMLDivElement | null>;
  visible: boolean;
  sessionId?: string;
  initialCwd?: string;
  initialCommand?: string;
  /** True while this tab is backgrounded and past the suspend threshold (see
   *  tabVirtualization.ts). Tears down the xterm/WebGL renderer but keeps the
   *  underlying PTY process and its Channel alive — see suspendedSessionBuffer.ts. */
  suspended?: boolean;
  onSearchReady?: (addon: SearchAddon) => void;
  onExit?: (code: number) => void;
  onCwd?: (cwd: string) => void;
  onDetectedLocalUrl?: (url: string) => void;
};

const FONT_WEIGHT_MAP: Record<string, string | number> = {
  normal: "normal",
  medium: 500,
  bold: "bold",
};

// WebGL context loss leaves _renderer.value undefined for ~1000ms during recovery.
// Any fit() call in that window crashes with "undefined is not an object (evaluating
// 'this._renderer.value.dimensions')". Safe to swallow — the next successful fit()
// after WebGL re-attaches corrects dimensions.
function safeFit(fit: FitAddon | null | undefined): void {
  if (!fit) return;
  try {
    fit.fit();
  } catch {
    /* renderer not ready */
  }
}

let _bellAudioCtx: AudioContext | null = null;
function getBellAudioContext(): AudioContext {
  if (!_bellAudioCtx || _bellAudioCtx.state === "closed") {
    _bellAudioCtx = new AudioContext();
  }
  return _bellAudioCtx;
}

export function useTerminalSession({
  container,
  visible,
  sessionId,
  initialCwd,
  initialCommand,
  suspended = false,
  onSearchReady,
  onExit,
  onCwd,
  onDetectedLocalUrl,
}: Options) {
  const detectedRef = useRef<string | null>(null);
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
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const serializeRef = useRef<SerializeAddon | null>(null);
  const ptyRef = useRef<PtySession | null>(null);
  // Mirrors `suspended` synchronously during render (not in an effect) so the
  // mount effect's cleanup — which runs in the SAME commit as the prop flip —
  // can tell "cleaning up because we're suspending" (hand off to the
  // suspend registry) apart from "cleaning up because we're really
  // unmounting while still live" (close the pty for real).
  const suspendedRef = useRef(suspended);
  suspendedRef.current = suspended;

  // Apply terminal preference changes to the live xterm instance.
  useEffect(() => {
    const unsub = usePreferencesStore.subscribe((state, prev) => {
      const term = termRef.current;
      const fit = fitRef.current;
      if (!term) return;

      if (state.terminalCursorBlink !== prev.terminalCursorBlink) {
        term.options.cursorBlink = state.terminalCursorBlink;
      }
      // bellStyle was removed in xterm v6; bell is handled via onBell listener
      if (state.terminalCursorStyle !== prev.terminalCursorStyle) {
        term.options.cursorStyle = state.terminalCursorStyle;
      }
      if (state.terminalFontFamily !== prev.terminalFontFamily) {
        term.options.fontFamily = state.terminalFontFamily;
        safeFit(fit);
      }
      if (state.terminalFontSize !== prev.terminalFontSize) {
        term.options.fontSize = state.terminalFontSize;
        safeFit(fit);
      }
      if (state.terminalLetterSpacing !== prev.terminalLetterSpacing) {
        term.options.letterSpacing = state.terminalLetterSpacing;
        safeFit(fit);
      }
      if (state.terminalLineHeight !== prev.terminalLineHeight) {
        term.options.lineHeight = state.terminalLineHeight;
        safeFit(fit);
      }
      if (state.terminalFontWeight !== prev.terminalFontWeight) {
        term.options.fontWeight = FONT_WEIGHT_MAP[state.terminalFontWeight] as
          | "normal"
          | "bold"
          | "100"
          | "200"
          | "300"
          | "400"
          | "500"
          | "600"
          | "700"
          | "800"
          | "900"
          | undefined;
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
        // fastScrollModifier exists at runtime in xterm v6 but is not in the public types
        (term.options as Record<string, unknown>).fastScrollModifier =
          state.terminalFastScrollModifier === "none" ? undefined : state.terminalFastScrollModifier;
      }
    });
    return unsub;
  }, []);

  useEffect(() => {
    // Suspended: nothing to (re)create here — the previous (live) run's
    // cleanup below already handed the pty off to suspendedSessionBuffer
    // instead of closing it.
    if (suspended) return;

    let disposed = false;
    const cleanups: Array<() => void> = [];

    // Hoisted above the async IIFE (and independent of the `term` it builds)
    // so both the mid-attach "disposed" race below and this effect's own
    // cleanup — neither of which can see the IIFE's locals — can reach them.
    const playBell = () => {
      if (!usePreferencesStore.getState().terminalBell) return;
      try {
        const ctx = getBellAudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 800;
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.15);
      } catch {
        /* ignore AudioContext errors */
      }
    };
    // Persistent across every chunk of one suspend cycle so a multi-byte
    // UTF-8 codepoint split across two channel messages decodes correctly.
    const suspendDecoder = new TextDecoder("utf-8", { fatal: false });
    const decodeLocalPtyEvent = (event: unknown): DecodedChunk => {
      const e = event as PtyEvent;
      if (e.type === "data") {
        return { text: suspendDecoder.decode(decodeBase64(e.data), { stream: true }) };
      }
      if (e.type === "exit") return { exitCode: e.code };
      return {};
    };

    (async () => {
      const prefs = usePreferencesStore.getState();
      const fontFamily = prefs.terminalFontFamily;
      const fontSize = prefs.terminalFontSize;

      await document.fonts.load(`${fontSize}px "JetBrains Mono"`);
      if (disposed || !container.current) return;

      const term = new Terminal({
        fontFamily,
        fontSize,
        lineHeight: prefs.terminalLineHeight,
        letterSpacing: prefs.terminalLetterSpacing,
        theme: buildTerminalTheme(),
        cursorBlink: prefs.terminalCursorBlink,
        cursorStyle: prefs.terminalCursorStyle,
        cursorInactiveStyle: "outline",
        scrollback: prefs.terminalScrollback,
        fontWeight: FONT_WEIGHT_MAP[prefs.terminalFontWeight] as
          | "normal"
          | "bold"
          | "100"
          | "200"
          | "300"
          | "400"
          | "500"
          | "600"
          | "700"
          | "800"
          | "900"
          | undefined,
        allowProposedApi: true,
        rightClickSelectsWord: prefs.terminalRightClickPastes,
        wordSeparator: prefs.terminalWordSeparator,
        scrollSensitivity: prefs.terminalScrollSensitivity,
        // fastScrollModifier is a runtime option in xterm v6 but not in public types
        ...({
          fastScrollModifier:
            prefs.terminalFastScrollModifier === "none" ? undefined : prefs.terminalFastScrollModifier,
        } as Record<string, unknown>),
        // OSC 8 hyperlinks — open in the system browser, not the Tauri webview
        linkHandler: {
          activate: (_e: MouseEvent, uri: string) => {
            openUrl(uri).catch(console.error);
          },
        },
      });
      termRef.current = term;

      // copyOnSelect: not a built-in option in xterm v6 — implement via selection event
      term.onSelectionChange(() => {
        if (!usePreferencesStore.getState().terminalCopyOnSelect) return;
        const text = term.getSelection();
        if (text) void navigator.clipboard.writeText(text).catch(() => undefined);
      });

      // On macOS in WKWebView, Cmd+C triggers the native Copy menu command which
      // copies DOM selection (empty for canvas-based xterm). Intercept the `copy`
      // event and write xterm's internal selection instead.
      const onCopy = (e: ClipboardEvent) => {
        const text = term.getSelection();
        if (!text) return;
        e.clipboardData?.setData("text/plain", text);
        e.preventDefault();
      };
      document.addEventListener("copy", onCopy, { capture: true });
      cleanups.push(() => document.removeEventListener("copy", onCopy, { capture: true }));
      // playBell is hoisted above (shared with the suspend-hand-off path below).
      term.onBell(playBell);

      const fit = new FitAddon();
      fitRef.current = fit;
      term.loadAddon(fit);

      const search = new SearchAddon();
      term.loadAddon(search);
      term.loadAddon(new WebLinksAddon((_e, uri) => openUrl(uri).catch(console.error)));
      term.loadAddon(new ImageAddon({ storageLimit: 32 }));

      term.open(container.current);
      fit.fit();
      // LigaturesAddon measures font metrics and must be loaded after open()
      term.loadAddon(new LigaturesAddon());

      // SerializeAddon must also be loaded after open()
      const serializeAddon = new SerializeAddon();
      serializeRef.current = serializeAddon;
      term.loadAddon(serializeAddon);

      // Resuming a suspended session? Grab it before the scrollback restore
      // below so we know whether there's live replay content to append after.
      const resumed = sessionId ? resumeSession(sessionId) : null;

      // Restore scrollback before opening PTY so history appears first
      if (sessionId && !disposed) {
        try {
          const ansi = await invoke<string | null>("scrollback_load", { sessionId });
          if (ansi && !disposed) {
            term.write(ansi);
            const sepLen = Math.max(20, term.cols - 20);
            term.write(`\r\n\x1b[2m\x1b[90m${"─".repeat(sepLen)} session restored \x1b[0m\r\n\r\n`);
          }
        } catch {
          /* graceful degradation — terminal starts normally */
        }
      }
      if (resumed?.replay) term.write(resumed.replay);

      if (prefs.terminalUseWebGL) {
        let webglRetryTimer: ReturnType<typeof setTimeout> | null = null;
        const attachWebGL = () => {
          if (disposed) return;
          try {
            const webgl = new WebglAddon();
            webgl.onContextLoss(() => {
              webgl.dispose();
              if (!disposed) webglRetryTimer = setTimeout(attachWebGL, 1000);
            });
            term.loadAddon(webgl);
          } catch (e) {
            console.warn("WebGL renderer unavailable:", e);
          }
        };
        attachWebGL();
        cleanups.push(() => {
          if (webglRetryTimer) clearTimeout(webglRetryTimer);
        });
      }

      const prompt = registerPromptTracker(term);
      cleanups.push(
        registerCwdHandler(term, (cwd) => onCwdRef.current?.(cwd)),
        prompt.dispose,
      );
      onSearchReadyRef.current?.(search);

      // Per-session decoder so interleaved chunks across tabs don't splice
      // a multi-byte UTF-8 codepoint between unrelated streams.
      const urlDecoder = new TextDecoder("utf-8", { fatal: false });

      const handleExit = (code: number) => {
        term.write(`\r\n\x1b[2m[process exited: ${code}]\x1b[0m\r\n`);
        term.options.disableStdin = true;
        onExitRef.current?.(code);
      };
      if (resumed?.exitCode !== undefined) handleExit(resumed.exitCode);

      const shellPref = usePreferencesStore.getState().terminalShell;
      const handlers = {
        onData: (bytes: Uint8Array) => {
          term.write(bytes);
          // Sniff for dev-server URLs in raw output. Byte-level prefilter
          // (':' '/' '/') skips decode+regex on the overwhelming majority
          // of chunks (ordinary terminal output, log tails, test runs).
          if (onDetectedRef.current && containsSchemeSeparator(bytes)) {
            const text = urlDecoder.decode(bytes, { stream: true });
            const matches = text.match(LOCAL_URL_RE);
            if (matches && matches.length > 0) {
              const url = stripTrailingPunct(matches[matches.length - 1]);
              if (url && url !== detectedRef.current) {
                detectedRef.current = url;
                onDetectedRef.current(url);
              }
            }
          }
        },
        onExit: handleExit,
      };
      const pty = resumed
        ? attachToPty(resumed.channel, resumed.backendId ?? 0, handlers)
        : await openPty(term.cols, term.rows, handlers, initialCwd, shellPref || undefined);
      if (disposed) {
        if (resumed && sessionId) {
          // Unmounted again before we finished reattaching (e.g. a very fast
          // tab-switch) — put it back rather than closing a still-wanted
          // background session for real.
          suspendSession(sessionId, pty.channel, decodeLocalPtyEvent, {
            onUrlDetected: (url) => onDetectedRef.current?.(url),
            onBell: playBell,
          });
        } else {
          pty.close();
        }
        return;
      }
      ptyRef.current = pty;
      cleanups.push(registerTerminalQueryHandlers(term, (d) => pty.write(d)));

      if (initialCommand) {
        const cmd = initialCommand.endsWith("\n") ? initialCommand : initialCommand + "\n";
        setTimeout(() => {
          if (!disposed) pty.write(cmd);
        }, 150);
      }

      term.onData((data) => pty.write(data));

      // Shift+Enter → send ESC + CR (\x1b\r) so Claude Code and similar
      // CLI tools can distinguish it from plain Enter and insert a newline
      // instead of submitting. Without this, xterm sends \r for both.
      term.attachCustomKeyEventHandler((e: KeyboardEvent) => {
        if (e.key === "Enter" && e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
          if (e.type === "keydown") pty.write("\x1b\r");
          return false; // prevent xterm from also sending \r
        }
        return true;
      });

      // Two-stage debounce:
      //  - FIT runs frequently (~one frame) so xterm visually keeps up with
      //    the window during drag. Local, no IPC.
      //  - PTY_RESIZE only fires on the trailing edge of the drag, because
      //    SIGWINCH is what causes shells / fancy prompts (powerlevel10k,
      //    starship) to redraw mid-resize, which the user perceives as
      //    blinking. The shell only cares about the FINAL size.
      const FIT_DEBOUNCE_MS = 8;
      const PTY_RESIZE_DEBOUNCE_MS = 256;
      let lastSentCols = term.cols;
      let lastSentRows = term.rows;
      let lastW = container.current.clientWidth;
      let lastH = container.current.clientHeight;
      let fitTimer: ReturnType<typeof setTimeout> | null = null;
      let ptyTimer: ReturnType<typeof setTimeout> | null = null;

      const el = container.current;
      const flushPtyResize = () => {
        ptyTimer = null;
        if (disposed) return;
        if (term.cols === lastSentCols && term.rows === lastSentRows) return;
        lastSentCols = term.cols;
        lastSentRows = term.rows;
        pty.resize(term.cols, term.rows);
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
          safeFit(fit);
          // Schedule (or re-schedule) a single trailing pty.resize. The
          // shell sees one SIGWINCH after the drag settles, not 60+/s.
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

      if (visible) term.focus();
    })();

    return () => {
      disposed = true;
      cleanups.forEach((fn) => fn());
      if (suspendedRef.current && sessionId && ptyRef.current) {
        // Suspending, not really closing — hand the live channel off so
        // output keeps flowing (buffered) while this pane is torn down.
        suspendSession(sessionId, ptyRef.current.channel, decodeLocalPtyEvent, {
          onUrlDetected: (url) => onDetectedRef.current?.(url),
          onBell: playBell,
        });
      } else {
        ptyRef.current?.close();
      }
      ptyRef.current = null;
      termRef.current?.dispose();
      termRef.current = null;
      fitRef.current = null;
      serializeRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suspended]);

  useLayoutEffect(() => {
    if (!visible) return;
    const term = termRef.current;
    const fit = fitRef.current;
    const pty = ptyRef.current;
    if (term && fit) {
      const prevCols = term.cols;
      const prevRows = term.rows;
      safeFit(fit);
      if (pty && (term.cols !== prevCols || term.rows !== prevRows)) {
        pty.resize(term.cols, term.rows);
      }
    }
    term?.focus();
  }, [visible]);

  const write = useCallback((data: string) => {
    ptyRef.current?.write(data);
  }, []);

  const focus = useCallback(() => {
    termRef.current?.focus();
  }, []);

  const getBuffer = useCallback((maxLines = 200): string | null => {
    const t = termRef.current;
    if (!t) return null;
    const buf = t.buffer.active;
    const total = buf.length;
    const lines: string[] = [];
    const start = Math.max(0, total - maxLines);
    for (let i = start; i < total; i++) {
      lines.push(buf.getLine(i)?.translateToString(true) ?? "");
    }
    while (lines.length && lines[lines.length - 1] === "") lines.pop();
    return lines.join("\n");
  }, []);

  const getSelection = useCallback((): string | null => {
    const sel = termRef.current?.getSelection() ?? "";
    return sel.length > 0 ? sel : null;
  }, []);

  const clear = useCallback(() => {
    termRef.current?.clear();
  }, []);

  const applyTheme = useCallback(() => {
    const term = termRef.current;
    if (!term) return;
    term.options.theme = buildTerminalTheme();
  }, []);

  const serialize = useCallback((scrollback?: number): string | null => {
    const addon = serializeRef.current;
    if (!addon) return null;
    return scrollback && scrollback > 0 ? addon.serialize({ scrollback }) : addon.serialize();
  }, []);

  return { write, focus, getBuffer, getSelection, clear, applyTheme, serialize };
}
