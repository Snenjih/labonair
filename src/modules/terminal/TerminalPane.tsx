import { explorerDrag } from "@/modules/explorer/lib/explorerDrag";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { useChatStore } from "@/modules/ai/store/chatStore";
import { useShallow } from "zustand/react/shallow";
import { useTheme } from "@/modules/theme";
import { BlockInputBar, BlockOverlay } from "@/modules/terminal/block";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import type { SearchAddon } from "@xterm/addon-search";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { dropPaths } from "./lib/drop-paths";
import { useTerminalSession } from "./lib/useTerminalSession";

export type TerminalPaneHandle = {
  write: (data: string) => void;
  focus: () => void;
  getBuffer: (maxLines?: number) => string | null;
  getSelection: () => string | null;
  serialize: (scrollback?: number) => string | null;
};

type Props = {
  tabId: string;
  visible: boolean;
  initialCwd?: string;
  initialCommand?: string;
  terminalMode?: "standard" | "block";
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
      terminalMode,
      onSearchReady,
      onExit,
      onCwd,
      onDetectedLocalUrl,
    },
    ref,
  ) {
    const containerRef = useRef<HTMLDivElement>(null);
    const searchAddonRef = useRef<SearchAddon | null>(null);
    const { resolvedTheme } = useTheme();
    const session = useTerminalSession({
      container: containerRef,
      visible,
      sessionId: tabId,
      initialCwd,
      initialCommand,
      terminalMode,
      onSearchReady: (a) => {
        searchAddonRef.current = a;
        onSearchReady?.(tabId, a);
      },
      onExit: (c) => onExit?.(tabId, c),
      onCwd: (c) => onCwd?.(tabId, c),
      onDetectedLocalUrl: (u) => onDetectedLocalUrl?.(tabId, u),
    });

    const blockPrefs = usePreferencesStore(useShallow((s) => ({
      showHeader: s.blockTerminalShowHeader,
      showExitCode: s.blockTerminalShowExitCode,
      showExecutionTime: s.blockTerminalShowExecutionTime,
      showCwd: s.blockTerminalShowCwd,
      compactHeaders: s.blockTerminalCompactHeaders,
      highlightFailed: s.blockTerminalHighlightFailed,
      autoCollapseOnAltScreen: s.blockTerminalAutoCollapseOnAltScreen,
    })));

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
        serialize: (scrollback?: number) => session.serialize(scrollback),
      }),
      [session],
    );

    const rightClickPastes = usePreferencesStore((s) => s.terminalRightClickPastes);
    const [hasSelection, setHasSelection] = useState(false);

    const terminalContainer = (
      <div
        ref={containerRef}
        className="h-full w-full"
        style={{
          visibility: visible ? undefined : "hidden",
          pointerEvents: visible ? "auto" : "none",
        }}
      />
    );

    const blockOverlay = terminalMode === "block" ? (
      <BlockOverlay
        term={null}
        containerRef={containerRef}
        decorations={session.blockDecorations}
        mode={session.blockMode}
        sessionId={tabId}
        settings={blockPrefs}
        searchAddon={searchAddonRef.current}
      />
    ) : null;

    const inner = terminalMode === "block" ? (
      <div className="flex h-full w-full flex-col">
        <div className="relative min-h-0 flex-1">
          {terminalContainer}
          {blockOverlay}
        </div>
        <BlockInputBar />
      </div>
    ) : (
      <div className="relative h-full w-full">
        {terminalContainer}
      </div>
    );

    if (rightClickPastes) return inner;

    return (
      <ContextMenu onOpenChange={(open) => { if (open) setHasSelection(!!session.getSelection()); }}>
        <ContextMenuTrigger asChild>{inner}</ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem
            disabled={!hasSelection}
            onSelect={() => {
              const sel = session.getSelection() ?? "";
              void navigator.clipboard.writeText(sel).catch(() => undefined);
            }}
          >
            Copy
          </ContextMenuItem>
          <ContextMenuItem
            onSelect={() => {
              void navigator.clipboard.readText()
                .then((t) => session.write(t))
                .catch(() => undefined);
            }}
          >
            Paste
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => session.clear()}>
            Clear
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            disabled={!hasSelection}
            onSelect={() => {
              const sel = session.getSelection() ?? "";
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
