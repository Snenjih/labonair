import { invoke } from "@tauri-apps/api/core";
import type React from "react";
import { useMemo } from "react";
import type { PanelImperativeHandle } from "react-resizable-panels";
import { useChatStore } from "@/modules/ai";
import type { RegistryCallbacks } from "@/modules/command-palette";
import type { EditorPaneHandle } from "@/modules/editor";
import { useHostsStore } from "@/modules/hosts/store/hostsStore";
import { openSettingsWindow, type SettingsTab } from "@/modules/settings/openSettingsWindow";
import type { CommandSnippet, SnippetExecMode } from "@/modules/snippets";
import { useSourceControlStore } from "@/modules/source-control/store/sourceControlStore";
import type { SidebarPanel } from "@/modules/statusbar";
import { selectActivePaneId, useTabsStore, type WorkspaceTab } from "@/modules/tabs";
import type { TerminalPaneHandle } from "@/modules/terminal";

export interface UsePaletteCallbacksOptions {
  openNewTab: () => void;
  handleClose: (id: number) => void;
  togglePanelAndFocus: () => void;
  askFromSelection: () => void;
  execSnippet: (snippet: CommandSnippet, mode?: SnippetExecMode) => void;
  setActivePanel: React.Dispatch<React.SetStateAction<SidebarPanel>>;
  sidebarRef: React.RefObject<PanelImperativeHandle | null>;
  openShortcuts: () => void;
  openPreviewTab: (url: string) => number;
  terminalRefs: React.MutableRefObject<Map<string, TerminalPaneHandle>>;
  editorRefs: React.MutableRefObject<Map<number, EditorPaneHandle>>;
}

export interface PaletteCallbacksReturn {
  paletteCallbacks: RegistryCallbacks;
  activeContext: "terminal" | "editor" | "sftp" | "home" | "ssh-terminal" | null;
}

export function usePaletteCallbacks({
  openNewTab,
  handleClose,
  togglePanelAndFocus,
  askFromSelection,
  execSnippet,
  setActivePanel,
  sidebarRef,
  openShortcuts,
  terminalRefs,
  editorRefs,
}: UsePaletteCallbacksOptions): PaletteCallbacksReturn {
  // Stable store actions
  const setSelectedHost = useHostsStore((s) => s.setSelectedHost);

  // Reactive subscriptions for activeContext
  const activeId = useTabsStore((s) => s.activeId);
  const activePaneId = useTabsStore(selectActivePaneId);

  const activeContext = useMemo(() => {
    const { tabs: storeTabs, activeId: aid } = useTabsStore.getState();
    const tab = storeTabs.find((t) => t.id === aid);
    if (!tab) return null;
    if (tab.kind === "workspace") {
      const wt = tab as WorkspaceTab;
      const session = wt.sessions[wt.activePaneId];
      if (session?.kind === "ssh") return "ssh-terminal" as const;
      return "terminal" as const;
    }
    if (tab.kind === "editor") return "editor" as const;
    if (tab.kind === "sftp") return "sftp" as const;
    if (tab.kind === "home") return "home" as const;
    return null;
  }, [activeId, activePaneId]);

  const paletteCallbacks = useMemo<RegistryCallbacks>(() => {
    const {
      newSshTab,
      newSftpTab,
      openHomeTab,
      openUntitledTab,
      splitPane,
      closePane,
      setActiveId,
      openFileTab,
      newTab,
    } = useTabsStore.getState();

    return {
      openSettings: (section) => void openSettingsWindow(section as SettingsTab | undefined),
      openShortcuts,
      newSshTab,
      newSftpTab,
      newTab: openNewTab,
      openUntitledTab: () => void openUntitledTab(),
      openHomeTab,
      splitRight: () => {
        const { tabs: storeTabs, activeId: aid } = useTabsStore.getState();
        if (storeTabs.find((t) => t.id === aid)?.kind === "workspace") splitPane(aid, "horizontal");
      },
      splitDown: () => {
        const { tabs: storeTabs, activeId: aid } = useTabsStore.getState();
        if (storeTabs.find((t) => t.id === aid)?.kind === "workspace") splitPane(aid, "vertical");
      },
      closePane: () => {
        const { tabs: storeTabs, activeId: aid } = useTabsStore.getState();
        const tab = storeTabs.find((t) => t.id === aid);
        if (tab?.kind === "workspace") closePane(aid, (tab as WorkspaceTab).activePaneId);
      },
      closeCurrentTab: () => handleClose(useTabsStore.getState().activeId),
      toggleAi: togglePanelAndFocus,
      askSelection: askFromSelection,
      switchTab: setActiveId,
      injectIntoTerminal: (text) => {
        const paneId = selectActivePaneId(useTabsStore.getState());
        if (!paneId) return;
        terminalRefs.current.get(paneId)?.write(text);
        terminalRefs.current.get(paneId)?.focus();
      },
      runSnippet: (snippet, mode) => void execSnippet(snippet, mode),
      openSnippetsPanel: () => {
        setActivePanel("snippets");
        sidebarRef.current?.expand();
      },
      newAiSession: () => {
        useChatStore.getState().newSession();
        togglePanelAndFocus();
      },
      clearAiChat: () => {
        const { activeSessionId, deleteSession, newSession } = useChatStore.getState();
        if (activeSessionId) deleteSession(activeSessionId);
        newSession();
      },
      switchAiSession: (id) => {
        useChatStore.getState().switchSession(id);
        togglePanelAndFocus();
      },
      duplicateCurrentTab: () => {
        const { tabs: storeTabs, activeId: aid } = useTabsStore.getState();
        const tab = storeTabs.find((t) => t.id === aid);
        if (!tab) return;
        if (tab.kind === "workspace") {
          const wt = tab as WorkspaceTab;
          const session = wt.sessions[wt.activePaneId] ?? null;
          if (session?.kind === "ssh" && session.hostId) newSshTab(session.hostId, tab.title);
          else newTab(session?.cwd);
        } else if (tab.kind === "editor") {
          openFileTab((tab as { path: string }).path);
        }
      },
      closeOtherTabs: () => {
        const { tabs: storeTabs, activeId: aid } = useTabsStore.getState();
        storeTabs.forEach((t) => {
          if (t.id !== aid) handleClose(t.id);
        });
      },
      disconnectCurrentSsh: () => {
        const { tabs: storeTabs, activeId: aid } = useTabsStore.getState();
        const tab = storeTabs.find((t) => t.id === aid) as WorkspaceTab | undefined;
        if (tab?.kind !== "workspace") return;
        const session = tab.sessions[tab.activePaneId];
        if (session?.kind === "ssh" && session.id) void invoke("ssh_disconnect", { sessionId: session.id });
      },
      reconnectCurrentSsh: () => {
        const paneId = selectActivePaneId(useTabsStore.getState());
        if (paneId) window.dispatchEvent(new CustomEvent("labonair:ssh-reconnect", { detail: { paneId } }));
      },
      openNewHostForm: () => {
        openHomeTab();
        setTimeout(() => setSelectedHost("__new__"), 150);
      },
      jumpToEditorPosition: (pos: number) => {
        const { activeId: aid } = useTabsStore.getState();
        editorRefs.current.get(aid)?.jumpToPosition(pos);
      },
      formatEditorDocument: () => {
        const { activeId: aid } = useTabsStore.getState();
        editorRefs.current.get(aid)?.format();
      },
      openGitGraph: () => {
        const { openGitGraphTab } = useTabsStore.getState();
        const { repoRoot, currentBranch, hostId, sessionId } = useSourceControlStore.getState();
        const path = repoRoot ?? "";
        openGitGraphTab(path, currentBranch || "HEAD", hostId ?? undefined, sessionId ?? undefined);
      },
      focusSourceControl: () => {
        setActivePanel("source-control");
        sidebarRef.current?.expand();
      },
    };
  }, [
    openNewTab,
    handleClose,
    execSnippet,
    terminalRefs,
    editorRefs,
    togglePanelAndFocus,
    askFromSelection,
    setActivePanel,
    sidebarRef,
    setSelectedHost,
    openShortcuts,
  ]);

  return { paletteCallbacks, activeContext };
}
