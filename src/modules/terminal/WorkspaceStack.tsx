import { cn } from "@/lib/utils";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { useTabsStore } from "@/modules/tabs/store/tabsStore";
import type { WorkspaceTab } from "@/modules/tabs/types";
import React, { useCallback } from "react";
import { useShallow } from "zustand/react/shallow";
import { disposeSession } from "./lib/terminalSessionRegistry";
import { WorkspacePane, type WorkspacePaneHandle } from "./WorkspacePane";
import type { TerminalPaneHandle } from "./TerminalPane";

type Props = {
  workspacePaneRefs: React.MutableRefObject<Map<number, WorkspacePaneHandle>>;
  terminalRefs: React.MutableRefObject<Map<string, TerminalPaneHandle>>;
  onDetectedLocalUrl: (sessionId: string, url: string) => void;
};

// ─── Per-tab container ────────────────────────────────────────────────────────

type ContainerProps = {
  tabId: number;
  workspacePaneRefs: Props["workspacePaneRefs"];
  terminalRefs: Props["terminalRefs"];
  onDetectedLocalUrl: Props["onDetectedLocalUrl"];
};

function WorkspacePaneContainer({
  tabId,
  workspacePaneRefs,
  terminalRefs,
  onDetectedLocalUrl,
}: ContainerProps) {
  const tab = useTabsStore((s) => s.tabs.find((t) => t.id === tabId) as WorkspaceTab | undefined);
  const isActive = useTabsStore((s) => s.activeId === tabId);
  const terminalShowPaneFooter = usePreferencesStore((s) => s.terminalShowPaneFooter);

  const registerPaneRef = useCallback(
    (h: WorkspacePaneHandle | null) => {
      if (h) workspacePaneRefs.current.set(tabId, h);
      else workspacePaneRefs.current.delete(tabId);
    },
    [tabId, workspacePaneRefs],
  );

  const onSetActivePane = useCallback(
    (paneId: string) => useTabsStore.getState().setActivePaneId(tabId, paneId),
    [tabId],
  );

  const onRegisterHandle = useCallback(
    (sessionId: string, handle: TerminalPaneHandle | null) => {
      if (handle) terminalRefs.current.set(sessionId, handle);
      else terminalRefs.current.delete(sessionId);
    },
    [terminalRefs],
  );

  const onCwd = useCallback(
    (sessionId: string, cwd: string) => useTabsStore.getState().updatePaneSessionCwd(tabId, sessionId, cwd),
    [tabId],
  );

  const onClosePane = useCallback(
    (paneId: string) => {
      // Frees a bound or merely-retained renderer-pool slot (no-op if
      // neither exists — a backgrounded pane may have neither) before the
      // store removes the pane and its owning component unmounts.
      disposeSession(paneId);
      useTabsStore.getState().closePane(tabId, paneId);
    },
    [tabId],
  );

  if (!tab) return null;

  return (
    <div
      inert={!isActive || undefined}
      className={cn(
        "absolute inset-0 z-0 px-3 pt-2",
        terminalShowPaneFooter && "pb-2",
        !isActive && "opacity-0",
      )}
      aria-hidden={!isActive}
    >
      <WorkspacePane
        ref={registerPaneRef}
        tab={tab}
        tabVisible={isActive}
        onSetActivePane={onSetActivePane}
        onRegisterHandle={onRegisterHandle}
        onCwd={onCwd}
        onClosePane={onClosePane}
        onDetectedLocalUrl={onDetectedLocalUrl}
      />
    </div>
  );
}

// ─── Stack ────────────────────────────────────────────────────────────────────

export const WorkspaceStack = React.memo(function WorkspaceStack({
  workspacePaneRefs,
  terminalRefs,
  onDetectedLocalUrl,
}: Props) {
  // Cold tabs (restored but never activated — see tabsStore's `newTab`/
  // `setActiveId`) simply don't mount here, so no PTY/SSH connection is
  // spawned for them until `setActiveId` clears the flag on first activation.
  const workspaceTabIds = useTabsStore(
    useShallow((s) =>
      s.tabs
        .filter((t) => t.kind === "workspace" && !(t as WorkspaceTab).cold)
        .map((t) => t.id),
    ),
  );

  return (
    <>
      {workspaceTabIds.map((tabId) => (
        <WorkspacePaneContainer
          key={tabId}
          tabId={tabId}
          workspacePaneRefs={workspacePaneRefs}
          terminalRefs={terminalRefs}
          onDetectedLocalUrl={onDetectedLocalUrl}
        />
      ))}
    </>
  );
});
