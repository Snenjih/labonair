import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { cn } from "@/lib/utils";
import type { PaneNode, TerminalSessionData, WorkspaceTab } from "@/modules/tabs";
import { useCallback, forwardRef, useImperativeHandle, useRef, type ReactNode } from "react";
import { SshTerminalPane } from "./SshTerminalPane";
import { TerminalPane, type TerminalPaneHandle } from "./TerminalPane";
import type { SearchAddon } from "@xterm/addon-search";

export type WorkspacePaneHandle = {
  /** Returns the handle for a specific session, or null. */
  getSessionHandle: (sessionId: string) => TerminalPaneHandle | null;
};

interface Props {
  tab: WorkspaceTab;
  onSetActivePane: (paneId: string) => void;
  onRegisterHandle: (sessionId: string, handle: TerminalPaneHandle | null) => void;
  onCwd: (sessionId: string, cwd: string) => void;
  onClosePane: (paneId: string) => void;
  onSearchReady?: (sessionId: string, addon: SearchAddon) => void;
  onDetectedLocalUrl?: (sessionId: string, url: string) => void;
}

export const WorkspacePane = forwardRef<WorkspacePaneHandle, Props>(
  function WorkspacePane(
    { tab, onSetActivePane, onRegisterHandle, onCwd, onClosePane, onSearchReady, onDetectedLocalUrl },
    ref,
  ) {
    const handleRefs = useRef<Map<string, TerminalPaneHandle>>(new Map());

    useImperativeHandle(ref, () => ({
      getSessionHandle: (sessionId: string) =>
        handleRefs.current.get(sessionId) ?? null,
    }), []);

    const registerHandle = useCallback(
      (sessionId: string, handle: TerminalPaneHandle | null) => {
        if (handle) handleRefs.current.set(sessionId, handle);
        else handleRefs.current.delete(sessionId);
        onRegisterHandle(sessionId, handle);
      },
      [onRegisterHandle],
    );

    const renderNode = (node: PaneNode): ReactNode => {
      if (node.type === "split") {
        const panelChildren = node.children.flatMap((child, idx): ReactNode[] => {
          const items: ReactNode[] = [];
          if (idx > 0) {
            items.push(<ResizableHandle key={`handle-${node.id}-${idx}`} withHandle />);
          }
          items.push(
            <ResizablePanel
              key={child.id}
              defaultSize={`${node.sizes[idx] ?? 50}%`}
              minSize="10%"
            >
              {renderNode(child)}
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
            {panelChildren}
          </ResizablePanelGroup>
        );
      }

      // Leaf pane
      const paneId = node.id;
      const session = tab.sessions[paneId];
      const isActive = tab.activePaneId === paneId;

      if (!session) return null;

      return (
        <div
          key={paneId}
          className={cn(
            "group relative flex h-full w-full flex-col overflow-hidden",
            isActive && "ring-1 ring-inset ring-accent",
          )}
          onClick={() => onSetActivePane(paneId)}
        >
          <PaneHeader
            session={session}
            onClose={() => onClosePane(paneId)}
          />
          <div className="min-h-0 flex-1">
            {session.kind === "local" ? (
              <TerminalPane
                key={paneId}
                tabId={paneId}
                visible
                initialCwd={session.cwd}
                ref={(h) => registerHandle(paneId, h)}
                onSearchReady={(_, addon) => onSearchReady?.(paneId, addon)}
                onCwd={(_, cwd) => onCwd(paneId, cwd)}
                onDetectedLocalUrl={(_, url) => onDetectedLocalUrl?.(paneId, url)}
              />
            ) : (
              <SshTerminalPane
                key={paneId}
                sessionId={paneId}
                session={session}
                isActive={isActive}
                ref={(h) => registerHandle(paneId, h)}
              />
            )}
          </div>
        </div>
      );
    };

    return <div className="h-full w-full">{renderNode(tab.layout)}</div>;
  },
);

// ── Tiny pane header ──────────────────────────────────────────────────────────

function PaneHeader({
  session,
  onClose,
}: {
  session: TerminalSessionData;
  onClose: () => void;
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
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="flex h-4 w-4 items-center justify-center rounded text-[10px] text-foreground/60 opacity-40 transition-opacity hover:bg-accent hover:opacity-100 group-hover:opacity-100 focus:opacity-100"
        tabIndex={-1}
        aria-label="Close pane"
      >
        ×
      </button>
    </div>
  );
}
