import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { cn } from "@/lib/utils";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { FindWidget } from "@/modules/search";
import type { PaneNode, TerminalSessionData, WorkspaceTab } from "@/modules/tabs";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { SshTerminalPane } from "./SshTerminalPane";
import { TerminalPane, type TerminalPaneHandle } from "./TerminalPane";
import type { SearchAddon } from "@xterm/addon-search";

export type WorkspacePaneHandle = {
  getSessionHandle: (sessionId: string) => TerminalPaneHandle | null;
  openFind: () => void;
};

interface Props {
  tab: WorkspaceTab;
  tabVisible: boolean;
  onSetActivePane: (paneId: string) => void;
  onRegisterHandle: (sessionId: string, handle: TerminalPaneHandle | null) => void;
  onCwd: (sessionId: string, cwd: string) => void;
  onClosePane: (paneId: string) => void;
  onDetectedLocalUrl?: (sessionId: string, url: string) => void;
}

type PaneRect = { x: number; y: number; w: number; h: number };

export const WorkspacePane = forwardRef<WorkspacePaneHandle, Props>(
  function WorkspacePane(
    { tab, tabVisible, onSetActivePane, onRegisterHandle, onCwd, onClosePane, onDetectedLocalUrl },
    ref,
  ) {
    const containerRef = useRef<HTMLDivElement>(null);
    const slotRefs = useRef<Map<string, HTMLDivElement>>(new Map());
    const handleRefs = useRef<Map<string, TerminalPaneHandle>>(new Map());
    const [paneRects, setPaneRects] = useState<Map<string, PaneRect>>(new Map());
    const showPaneHeader = usePreferencesStore((s) => s.terminalShowPaneHeader);

    const [findOpen, setFindOpen] = useState(false);
    const [activeAddon, setActiveAddon] = useState<SearchAddon | null>(null);
    const addonMap = useRef<Map<string, SearchAddon>>(new Map());

    useImperativeHandle(ref, () => ({
      getSessionHandle: (sessionId: string) =>
        handleRefs.current.get(sessionId) ?? null,
      openFind: () => setFindOpen(true),
    }), []);

    // Sync slot element rects → terminal absolute positions
    // useLayoutEffect instead of useEffect so the initial updateRect() calls
    // happen synchronously before the first paint. Without this, paneRects is
    // empty on the first render and terminal divs get display:none for one
    // frame — visible as a blank flash when switching to a terminal tab.
    useLayoutEffect(() => {
      const observers: ResizeObserver[] = [];
      const updateRect = (paneId: string) => {
        const slotEl = slotRefs.current.get(paneId);
        const containerEl = containerRef.current;
        if (!slotEl || !containerEl) return;
        const s = slotEl.getBoundingClientRect();
        const c = containerEl.getBoundingClientRect();
        setPaneRects((prev) => {
          const next = new Map(prev);
          next.set(paneId, { x: s.left - c.left, y: s.top - c.top, w: s.width, h: s.height });
          return next;
        });
      };

      for (const paneId of Object.keys(tab.sessions)) {
        const el = slotRefs.current.get(paneId);
        if (!el) continue;
        updateRect(paneId);
        const obs = new ResizeObserver(() => updateRect(paneId));
        obs.observe(el);
        observers.push(obs);
      }

      return () => {
        for (const obs of observers) obs.disconnect();
      };
    }, [tab.sessions, tab.layout]);

    // Keep activeAddon in sync with the active pane
    useEffect(() => {
      setActiveAddon(addonMap.current.get(tab.activePaneId) ?? null);
    }, [tab.activePaneId]);

    // Close find widget when switching active pane
    useEffect(() => {
      setFindOpen(false);
    }, [tab.activePaneId]);

    const handleSearchReady = useCallback((paneId: string, addon: SearchAddon) => {
      addonMap.current.set(paneId, addon);
      if (paneId === tab.activePaneId) setActiveAddon(addon);
    }, [tab.activePaneId]);

    const registerHandle = useCallback(
      (paneId: string, handle: TerminalPaneHandle | null) => {
        if (handle) {
          handleRefs.current.set(paneId, handle);
        } else {
          handleRefs.current.delete(paneId);
          addonMap.current.delete(paneId);
        }
        onRegisterHandle(paneId, handle);
      },
      [onRegisterHandle],
    );

    const registerSlot = useCallback((paneId: string, el: HTMLDivElement | null) => {
      if (el) slotRefs.current.set(paneId, el);
      else slotRefs.current.delete(paneId);
    }, []);

    // Slot tree: transparent panels with resize handles, no terminals inside
    const renderSlotTree = (node: PaneNode): ReactNode => {
      if (node.type === "split") {
        const children = node.children.flatMap((child, idx): ReactNode[] => {
          const items: ReactNode[] = [];
          if (idx > 0) {
            items.push(<ResizableHandle key={`handle-${node.id}-${idx}`} withHandle className="pointer-events-auto" />);
          }
          items.push(
            <ResizablePanel
              key={child.id}
              defaultSize={`${node.sizes[idx] ?? 50}%`}
              minSize="10%"
            >
              {renderSlotTree(child)}
            </ResizablePanel>,
          );
          return items;
        });
        return (
          <ResizablePanelGroup
            key={node.id}
            orientation={node.direction === "horizontal" ? "horizontal" : "vertical"}
            className="h-full w-full"
          >
            {children}
          </ResizablePanelGroup>
        );
      }

      // Leaf: transparent slot div — sized by the panel, no terminal here
      return (
        <div
          key={node.id}
          className="h-full w-full pointer-events-none"
          ref={(el) => registerSlot(node.id, el)}
        />
      );
    };

    return (
      <div ref={containerRef} className="relative h-full w-full overflow-hidden">
        {/* Find widget — floats above terminals */}
        <div className="absolute left-0 right-0 top-0 z-20">
          <FindWidget
            isOpen={findOpen}
            onClose={() => setFindOpen(false)}
            searchAddon={activeAddon ?? undefined}
          />
        </div>

        {/* Sizing layer: pointer-events-none so clicks fall through to terminals;
            ResizableHandle restores pointer-events-auto for dragging. */}
        <div className="absolute inset-0 z-10 pointer-events-none">
          {renderSlotTree(tab.layout)}
        </div>

        {/* Terminal layer: flat, stable keys — never remounts on layout changes */}
        {(() => {
          const hasMultiplePanes = Object.keys(tab.sessions).length > 1;
          return Object.entries(tab.sessions).map(([paneId, session]) => {
          const rect = paneRects.get(paneId);
          const isActive = tab.activePaneId === paneId;
          const headerH = showPaneHeader ? 24 : 0; // h-6 = 24px

          return (
            <div
              key={paneId}
              className={cn("absolute z-0", isActive && hasMultiplePanes && "ring-1 ring-inset ring-accent")}
              style={
                rect
                  ? { left: rect.x, top: rect.y, width: rect.w, height: rect.h }
                  : { display: "none" }
              }
              onClick={() => onSetActivePane(paneId)}
            >
              {showPaneHeader && (
                <PaneHeader
                  session={session}
                  onClose={(e) => {
                    e.stopPropagation();
                    onClosePane(paneId);
                  }}
                />
              )}
              <div
                style={{
                  position: "absolute",
                  top: headerH,
                  left: 0,
                  right: 0,
                  bottom: 0,
                }}
              >
                {session.kind === "local" ? (
                  <TerminalPane
                    key={paneId}
                    tabId={paneId}
                    visible={tabVisible}
                    initialCwd={session.cwd}
                    initialCommand={session.initialCommand}
                    ref={(h) => registerHandle(paneId, h)}
                    onSearchReady={(_, addon) => handleSearchReady(paneId, addon)}
                    onCwd={(_, cwd) => onCwd(paneId, cwd)}
                    onDetectedLocalUrl={(_, url) => onDetectedLocalUrl?.(paneId, url)}
                  />
                ) : (
                  <SshTerminalPane
                    key={paneId}
                    sessionId={paneId}
                    session={session}
                    isActive={isActive}
                    tabVisible={tabVisible}
                    ref={(h) => registerHandle(paneId, h)}
                    onSearchReady={(addon) => handleSearchReady(paneId, addon)}
                  />
                )}
              </div>
            </div>
          );
        });
        })()}
      </div>
    );
  },
);

// ── Pane header ───────────────────────────────────────────────────────────────

function PaneHeader({
  session,
  onClose,
}: {
  session: TerminalSessionData;
  onClose: (e: React.MouseEvent) => void;
}) {
  const label =
    session.kind === "ssh"
      ? (session.quickConnect
          ? `${session.quickConnect.username}@${session.quickConnect.hostAddress}`
          : session.title)
      : (session.cwd
          ? session.cwd.split("/").filter(Boolean).pop() ?? session.cwd
          : "shell");

  return (
    <div className="flex h-6 shrink-0 items-center justify-between gap-1 bg-muted/20 px-2">
      <span className="truncate text-[10px] text-muted-foreground">{label}</span>
      <button
        onClick={onClose}
        className="flex h-4 w-4 items-center justify-center rounded text-[10px] text-muted-foreground transition-colors hover:bg-destructive/20 hover:text-foreground focus:text-foreground"
        tabIndex={-1}
        aria-label="Close pane"
      >
        ×
      </button>
    </div>
  );
}
