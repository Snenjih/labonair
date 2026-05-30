import { explorerDrag } from "@/modules/explorer/lib/explorerDrag";
import { useTheme } from "@/modules/theme";
import type { SearchAddon } from "@xterm/addon-search";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import { dropPaths } from "./lib/drop-paths";
import { useTerminalSession } from "./lib/useTerminalSession";

export type TerminalPaneHandle = {
  write: (data: string) => void;
  focus: () => void;
  getBuffer: (maxLines?: number) => string | null;
  getSelection: () => string | null;
};

type Props = {
  tabId: string;
  visible: boolean;
  initialCwd?: string;
  initialCommand?: string;
  onSearchReady?: (tabId: string, addon: SearchAddon) => void;
  onExit?: (tabId: string, code: number) => void;
  onCwd?: (tabId: string, cwd: string) => void;
  onDetectedLocalUrl?: (tabId: string, url: string) => void;
};

export const TerminalPane = forwardRef<TerminalPaneHandle, Props>(
  function TerminalPane(
    {
      tabId,
      visible,
      initialCwd,
      initialCommand,
      onSearchReady,
      onExit,
      onCwd,
      onDetectedLocalUrl,
    },
    ref,
  ) {
    const containerRef = useRef<HTMLDivElement>(null);
    const { resolvedTheme } = useTheme();
    const session = useTerminalSession({
      container: containerRef,
      visible,
      initialCwd,
      initialCommand,
      onSearchReady: (a) => onSearchReady?.(tabId, a),
      onExit: (c) => onExit?.(tabId, c),
      onCwd: (c) => onCwd?.(tabId, c),
      onDetectedLocalUrl: (u) => onDetectedLocalUrl?.(tabId, u),
    });

    useEffect(() => {
      // Defer one frame so CSS-variable token resolution sees the new class.
      const id = requestAnimationFrame(() => session.applyTheme());
      return () => cancelAnimationFrame(id);
    }, [resolvedTheme, session]);

    // Capture-phase pointerup so the drop fires even if xterm consumes the event.
    useEffect(() => {
      function onUp(e: PointerEvent) {
        const paths = explorerDrag.get();
        if (!paths) return;
        const el = containerRef.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        if (
          e.clientX >= r.left && e.clientX <= r.right &&
          e.clientY >= r.top  && e.clientY <= r.bottom
        ) {
          session.write(dropPaths(paths));
          session.focus();
        }
      }
      document.addEventListener("pointerup", onUp, { capture: true });
      return () => document.removeEventListener("pointerup", onUp, { capture: true });
    }, [session]);

    useImperativeHandle(
      ref,
      () => ({
        write: (data: string) => session.write(data),
        focus: () => session.focus(),
        getBuffer: (max?: number) => session.getBuffer(max),
        getSelection: () => session.getSelection(),
      }),
      [session],
    );

    return (
      <div
        ref={containerRef}
        className="h-full w-full"
        style={{
          visibility: visible ? undefined : "hidden",
          pointerEvents: visible ? "auto" : "none",
        }}
      />
    );
  },
);
