import { buildTerminalTheme } from "@/styles/terminalTheme";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { useTheme } from "@/modules/theme";
import type { SshTerminalTab } from "@/modules/tabs";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { WebglAddon } from "@xterm/addon-webgl";
import { Terminal } from "@xterm/xterm";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { SshLoadingScreen } from "./SshLoadingScreen";

const FONT_WEIGHT_MAP: Record<string, string | number> = {
  normal: "normal",
  medium: 500,
  bold: "bold",
};

interface Props {
  tab: SshTerminalTab;
  isActive: boolean;
}

export function SshTerminalPane({ tab, isActive }: Props) {
  const [isConnected, setIsConnected] = useState(false);
  const [hasError, setHasError] = useState(false);
  const { resolvedTheme } = useTheme();

  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);

  // Apply live preference changes to the xterm instance (mirrors useTerminalSession).
  useEffect(() => {
    const unsub = usePreferencesStore.subscribe((state, prev) => {
      const term = termRef.current;
      const fit = fitRef.current;
      if (!term) return;

      if (state.terminalCursorBlink !== prev.terminalCursorBlink)
        term.options.cursorBlink = state.terminalCursorBlink;
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
    });
    return unsub;
  }, []);

  // Re-apply theme when app theme (dark/light) changes.
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
    const tabIdStr = tab.id.toString();

    // Buffer output that arrives before xterm is ready so we don't miss
    // the initial shell prompt / MOTD.
    const earlyBuffer: string[] = [];
    let term: Terminal | null = null;

    listen<{ tab_id: string; data: string }>("ssh_pty_output", (event) => {
      if (event.payload.tab_id !== tabIdStr) return;
      if (term) {
        term.write(event.payload.data);
      } else {
        earlyBuffer.push(event.payload.data);
      }
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
      });
      term = t;
      termRef.current = t;

      const fit = new FitAddon();
      fitRef.current = fit;
      t.loadAddon(fit);
      t.loadAddon(new WebLinksAddon((_e, uri) => openUrl(uri).catch(console.error)));
      t.open(containerRef.current);
      fit.fit();

      try {
        const webgl = new WebglAddon();
        webgl.onContextLoss(() => webgl.dispose());
        t.loadAddon(webgl);
      } catch (e) {
        console.warn("WebGL unavailable:", e);
      }

      // Flush buffered output that arrived before xterm was ready
      for (const chunk of earlyBuffer) t.write(chunk);
      earlyBuffer.length = 0;

      // Navigate to initial directory if the tab was opened from SFTP
      if (tab.cwd) {
        invoke("ssh_pty_write", { tabId: tabIdStr, data: `cd ${tab.cwd}\n` }).catch(console.error);
      }

      // Send keystrokes to the SSH channel
      t.onData((data) => {
        invoke("ssh_pty_write", { tabId: tabIdStr, data }).catch(console.error);
      });

      // Resize handling
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
          tabId: tabIdStr,
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
      invoke("ssh_disconnect", { tabId: tab.id.toString() }).catch(console.error);
      termRef.current?.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected]);

  useLayoutEffect(() => {
    if (!isActive || !isConnected) return;
    fitRef.current?.fit();
    termRef.current?.focus();
  }, [isActive, isConnected]);

  if (!isConnected && !hasError) {
    // Estimate terminal dimensions from the viewport before the xterm instance
    // exists. Subtracting typical UI chrome (header ~36px, statusbar ~24px,
    // sidebar ~220px). Character cell: ~7.8px wide × ~18px tall at 13px font.
    const estCols = Math.max(80, Math.floor((window.innerWidth - 220) / 7.8));
    const estRows = Math.max(24, Math.floor((window.innerHeight - 60) / 18));
    return (
      <SshLoadingScreen
        tabId={tab.id.toString()}
        hostId={tab.hostId}
        quickConnect={tab.quickConnect}
        hostName={tab.title}
        connectionType="ssh"
        initialCols={estCols}
        initialRows={estRows}
        onConnected={() => setIsConnected(true)}
        onError={() => setHasError(true)}
      />
    );
  }

  if (hasError) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
        Connection closed.
      </div>
    );
  }

  return <div ref={containerRef} className="h-full w-full" />;
}
