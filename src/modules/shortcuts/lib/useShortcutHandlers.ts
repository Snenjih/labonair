import { useMemo } from "react";
import type React from "react";
import { useCommandStore } from "@/modules/command-palette";
import { usePreferencesStore } from "@/modules/settings/preferences";
import {
  DEFAULT_PREFERENCES,
  setTerminalFontSize,
  setEditorFontSize,
  setSftpFontSize,
  setZenModeShowHeader,
  setZenModeShowStatusbar,
} from "@/modules/settings/store";
import { useGlobalShortcuts } from "@/modules/shortcuts";
import { useTabsStore, selectActiveTabKind } from "@/modules/tabs";
import type { WorkspaceTab } from "@/modules/tabs";
import type { WorkspacePaneHandle } from "@/modules/terminal";
import type { EditorPaneHandle } from "@/modules/editor";

export interface UseShortcutHandlersOptions {
  openNewTab: () => void;
  handleClose: (id: number) => void;
  cycleTab: (delta: 1 | -1) => void;
  togglePanelAndFocus: () => void;
  askFromSelection: () => void;
  toggleSidebar: () => void;
  openPreviewTab: (url: string) => number;
  workspacePaneRefs: React.MutableRefObject<Map<number, WorkspacePaneHandle>>;
  activeEditorHandle: EditorPaneHandle | null;
  openShortcuts: () => void;
  openFind: () => void;
}

export function useShortcutHandlers(opts: UseShortcutHandlersOptions): void {
  const {
    openNewTab,
    handleClose,
    cycleTab,
    togglePanelAndFocus,
    askFromSelection,
    toggleSidebar,
    openPreviewTab,
    workspacePaneRefs,
    activeEditorHandle,
    openShortcuts,
  } = opts;

  const toggleCommandPalette = useCommandStore((s) => s.toggle);

  const {
    openUntitledTab,
    selectByIndex,
    splitPane,
    closePane,
  } = useTabsStore.getState();

  const shortcutHandlers = useMemo(() => ({
    "command.palette": () => toggleCommandPalette(),
    "tab.new": openNewTab,
    "tab.newPreview": () => openPreviewTab(""),
    "tab.newEditor": () => void openUntitledTab(),
    "tab.close": () => handleClose(useTabsStore.getState().activeId),
    "tab.next": () => cycleTab(1),
    "tab.prev": () => cycleTab(-1),
    "tab.selectByIndex": (e: KeyboardEvent) => selectByIndex(parseInt(e.key, 10) - 1),
    "search.focus": () => {
      const kind = selectActiveTabKind(useTabsStore.getState());
      const { activeId: aid } = useTabsStore.getState();
      if (kind === "workspace") workspacePaneRefs.current.get(aid)?.openFind();
      else if (kind === "editor") activeEditorHandle?.openFind();
    },
    "ai.toggle": togglePanelAndFocus,
    "ai.askSelection": askFromSelection,
    "shortcuts.open": () => openShortcuts(),
    "sidebar.toggle": toggleSidebar,
    "view.zenMode": () => {
      const { zenModeShowHeader: showH, zenModeShowStatusbar: showS } = usePreferencesStore.getState();
      const anyVisible = showH || showS;
      void setZenModeShowHeader(!anyVisible);
      void setZenModeShowStatusbar(!anyVisible);
    },
    "pane.splitRight": () => {
      const { tabs: storeTabs, activeId: aid } = useTabsStore.getState();
      if (storeTabs.find((t) => t.id === aid)?.kind === "workspace") splitPane(aid, "horizontal");
    },
    "pane.splitDown": () => {
      const { tabs: storeTabs, activeId: aid } = useTabsStore.getState();
      if (storeTabs.find((t) => t.id === aid)?.kind === "workspace") splitPane(aid, "vertical");
    },
    "pane.close": () => {
      const { tabs: storeTabs, activeId: aid } = useTabsStore.getState();
      const tab = storeTabs.find((t) => t.id === aid);
      if (tab?.kind === "workspace") closePane(aid, (tab as WorkspaceTab).activePaneId);
    },
    "view.zoomIn": () => {
      const kind = selectActiveTabKind(useTabsStore.getState());
      if (kind === "workspace") void setTerminalFontSize(Math.min(usePreferencesStore.getState().terminalFontSize + 1, 32));
      else if (kind === "editor") void setEditorFontSize(Math.min(usePreferencesStore.getState().editorFontSize + 1, 32));
      else if (kind === "sftp") void setSftpFontSize(Math.min(usePreferencesStore.getState().sftpFontSize + 1, 20));
    },
    "view.zoomOut": () => {
      const kind = selectActiveTabKind(useTabsStore.getState());
      if (kind === "workspace") void setTerminalFontSize(Math.max(usePreferencesStore.getState().terminalFontSize - 1, 8));
      else if (kind === "editor") void setEditorFontSize(Math.max(usePreferencesStore.getState().editorFontSize - 1, 8));
      else if (kind === "sftp") void setSftpFontSize(Math.max(usePreferencesStore.getState().sftpFontSize - 1, 10));
    },
    "view.zoomReset": () => {
      const kind = selectActiveTabKind(useTabsStore.getState());
      if (kind === "workspace") void setTerminalFontSize(DEFAULT_PREFERENCES.terminalFontSize);
      else if (kind === "editor") void setEditorFontSize(DEFAULT_PREFERENCES.editorFontSize);
      else if (kind === "sftp") void setSftpFontSize(DEFAULT_PREFERENCES.sftpFontSize);
    },
  }), [
    activeEditorHandle,
    cycleTab,
    handleClose,
    openNewTab,
    openPreviewTab,
    workspacePaneRefs,
    togglePanelAndFocus,
    askFromSelection,
    toggleSidebar,
    toggleCommandPalette,
    openShortcuts,
    openUntitledTab,
    selectByIndex,
    splitPane,
    closePane,
  ]);

  useGlobalShortcuts(shortcutHandlers);
}
