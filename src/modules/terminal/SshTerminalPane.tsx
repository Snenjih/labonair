import { buildTerminalTheme } from "@/styles/terminalTheme";
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

const FONT_FAMILY = '"JetBrains Mono", SFMono-Regular, Menlo, monospace';
const FONT_SIZE = 14;

interface Props {
  tab: SshTerminalTab;
  isActive: boolean;
}

export function SshTerminalPane({ tab, isActive }: Props) {
  const [isConnected, setIsConnected] = useState(false);
  const [hasError, setHasError] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);

  // Initialize xterm.js once connected
  useEffect(() => {
    if (!isConnected) return;

    let disposed = false;
    const cleanups: Array<() => void> = [];

    (async () => {
      await document.fonts.load(`${FONT_SIZE}px "JetBrains Mono"`);
      if (disposed || !containerRef.current) return;

      const term = new Terminal({
        fontFamily: FONT_FAMILY,
        fontSize: FONT_SIZE,
        lineHeight: 1.05,
        theme: buildTerminalTheme(),
        cursorBlink: true,
        cursorStyle: "bar",
        cursorInactiveStyle: "outline",
        scrollback: 5_000,
        allowProposedApi: true,
      });
      termRef.current = term;

      const fit = new FitAddon();
      fitRef.current = fit;
      term.loadAddon(fit);
      term.loadAddon(new WebLinksAddon((_e, uri) => openUrl(uri).catch(console.error)));
      term.open(containerRef.current);
      fit.fit();

      try {
        const webgl = new WebglAddon();
        webgl.onContextLoss(() => webgl.dispose());
        term.loadAddon(webgl);
      } catch (e) {
        console.warn("WebGL unavailable:", e);
      }

      // Send keystrokes to the SSH channel
      const tabIdStr = tab.id.toString();
      term.onData((data) => {
        invoke("ssh_pty_write", { tabId: tabIdStr, data }).catch(console.error);
      });

      // Receive output from the SSH channel
      const unlisten = await listen<{ tab_id: string; data: string }>(
        "ssh_pty_output",
        (event) => {
          if (event.payload.tab_id !== tabIdStr) return;
          term.write(event.payload.data);
        },
      );
      cleanups.push(unlisten);

      // Resize handling
      const FIT_DEBOUNCE_MS = 8;
      const PTY_RESIZE_DEBOUNCE_MS = 256;
      let lastSentCols = term.cols;
      let lastSentRows = term.rows;
      let lastW = containerRef.current.clientWidth;
      let lastH = containerRef.current.clientHeight;
      let fitTimer: ReturnType<typeof setTimeout> | null = null;
      let ptyTimer: ReturnType<typeof setTimeout> | null = null;

      const el = containerRef.current;

      const flushPtyResize = () => {
        ptyTimer = null;
        if (disposed) return;
        if (term.cols === lastSentCols && term.rows === lastSentRows) return;
        lastSentCols = term.cols;
        lastSentRows = term.rows;
        invoke("ssh_pty_resize", {
          tabId: tabIdStr,
          cols: term.cols,
          rows: term.rows,
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

      if (isActive) term.focus();
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
    return (
      <SshLoadingScreen
        tabId={tab.id.toString()}
        hostId={tab.hostId}
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
