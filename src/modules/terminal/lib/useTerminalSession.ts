import { buildTerminalTheme } from "@/styles/terminalTheme";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { openUrl } from "@tauri-apps/plugin-opener";
import { FitAddon } from "@xterm/addon-fit";
import { ImageAddon } from "@xterm/addon-image";
import { LigaturesAddon } from "@xterm/addon-ligatures";
import { SearchAddon } from "@xterm/addon-search";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { WebglAddon } from "@xterm/addon-webgl";
import { Terminal } from "@xterm/xterm";
import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { registerCwdHandler, registerPromptTracker } from "./osc-handlers";
import { openPty, type PtySession } from "./pty-bridge";

type Options = {
  container: React.RefObject<HTMLDivElement | null>;
  visible: boolean;
  initialCwd?: string;
  initialCommand?: string;
  onSearchReady?: (addon: SearchAddon) => void;
  onExit?: (code: number) => void;
  onCwd?: (cwd: string) => void;
  onDetectedLocalUrl?: (url: string) => void;
};

// Matches dev-server-style local URLs (vite, next dev, webpack, …). Anchors
// on a word boundary so we don't catch substrings of longer paths.
const LOCAL_URL_RE =
  /\bhttps?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0)(?::\d{1,5})?(?:\/[^\s\x1b]*)?/g;

const FONT_WEIGHT_MAP: Record<string, string | number> = {
  normal: "normal",
  medium: 500,
  bold: "bold",
};

export function useTerminalSession({
  container,
  visible,
  initialCwd,
  initialCommand,
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
  const ptyRef = useRef<PtySession | null>(null);

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
          state.terminalFastScrollModifier === "none"
            ? undefined
            : state.terminalFastScrollModifier;
      }
    });
    return unsub;
  }, []);

  useEffect(() => {
    let disposed = false;
    const cleanups: Array<() => void> = [];

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
            prefs.terminalFastScrollModifier === "none"
              ? undefined
              : prefs.terminalFastScrollModifier,
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
      term.onBell(() => {
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
      term.loadAddon(fit);

      const search = new SearchAddon();
      term.loadAddon(search);
      term.loadAddon(
        new WebLinksAddon((_e, uri) => openUrl(uri).catch(console.error)),
      );
      term.loadAddon(new ImageAddon({ storageLimit: 32 }));

      term.open(container.current);
      fit.fit();
      // LigaturesAddon measures font metrics and must be loaded after open()
      term.loadAddon(new LigaturesAddon());

      if (prefs.terminalUseWebGL) {
        try {
          const webgl = new WebglAddon();
          webgl.onContextLoss(() => webgl.dispose());
          term.loadAddon(webgl);
        } catch (e) {
          console.warn("WebGL renderer unavailable:", e);
        }
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

      const shellPref = usePreferencesStore.getState().terminalShell;
      const pty = await openPty(
        term.cols,
        term.rows,
        {
          onData: (bytes) => {
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
          onExit: (code) => {
            term.write(`\r\n\x1b[2m[process exited: ${code}]\x1b[0m\r\n`);
            term.options.disableStdin = true;
            onExitRef.current?.(code);
          },
        },
        initialCwd,
        shellPref || undefined,
      );
      if (disposed) {
        pty.close();
        return;
      }
      ptyRef.current = pty;

      if (initialCommand) {
        const cmd = initialCommand.endsWith("\n") ? initialCommand : initialCommand + "\n";
        setTimeout(() => { if (!disposed) pty.write(cmd); }, 150);
      }

      term.onData((data) => pty.write(data));

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
          fit.fit();
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
      ptyRef.current?.close();
      ptyRef.current = null;
      termRef.current?.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useLayoutEffect(() => {
    if (!visible) return;
    const term = termRef.current;
    const fit = fitRef.current;
    const pty = ptyRef.current;
    if (term && fit) {
      const prevCols = term.cols;
      const prevRows = term.rows;
      fit.fit();
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

  return { write, focus, getBuffer, getSelection, clear, applyTheme };
}

function stripTrailingPunct(url: string): string {
  return url.replace(/[.,);\]]+$/, "");
}

// Looks for the literal byte sequence ":" "/" "/" — the cheapest signal
// that a chunk *might* contain a URL. Avoids per-chunk UTF-8 decode + regex
// scan when running noisy commands.
function containsSchemeSeparator(bytes: Uint8Array): boolean {
  const n = bytes.length;
  for (let i = 0; i < n - 2; i++) {
    if (bytes[i] === 0x3a && bytes[i + 1] === 0x2f && bytes[i + 2] === 0x2f) {
      return true;
    }
  }
  return false;
}
