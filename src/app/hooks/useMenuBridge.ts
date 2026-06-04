import { useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { useChatStore } from "@/modules/ai";
import {
  useTabsStore,
  selectActiveTabKind,
  type WorkspaceTab,
} from "@/modules/tabs";
import {
  DEFAULT_PREFERENCES,
  setTerminalFontSize,
  setEditorFontSize,
  setSftpFontSize,
} from "@/modules/settings/store";
import { usePreferencesStore } from "@/modules/settings/preferences";
import type { EditorPaneHandle } from "@/modules/editor";

export interface AppActions {
  openNewTab: () => void;
  openHomeTab: () => void;
  openPreviewTab: (url: string) => number;
  openUntitledTab: () => Promise<number>;
  newSshTab: (hostId: string, title: string, cwd?: string, initialCommand?: string) => number;
  newSftpTab: (hostId: string, title: string) => number;
  openFileTab: (path: string) => number | null;
  handleClose: (id: number) => void;
  cycleTab: (delta: 1 | -1) => void;
  splitPane: (tabId: number, direction: "horizontal" | "vertical") => void;
  closePane: (tabId: number, paneId: string) => void;
  togglePanelAndFocus: () => void;
  askFromSelection: () => void;
  toggleSidebar: () => void;
  openShortcuts: () => void;
  openFind: () => void;
  activeEditorHandle: EditorPaneHandle | null;
}

export function useMenuBridge(actions: AppActions): void {
  // menuHandlersRef is updated every render intentionally — no useMemo/useEffect.
  // This ensures listeners always call current handlers without re-registration.
  const menuHandlersRef = useRef<Record<string, () => void>>({});

  menuHandlersRef.current = {
    "menu:new_terminal_tab": () => actions.openNewTab(),
    "menu:new_ssh_tab": () => actions.openHomeTab(),
    "menu:new_sftp_tab": () => actions.openHomeTab(),
    "menu:new_preview_tab": () => actions.openPreviewTab(""),
    "menu:new_editor_tab": () => void actions.openUntitledTab(),
    "menu:close_tab": () => actions.handleClose(useTabsStore.getState().activeId),
    "menu:close_pane": () => {
      const { tabs: storeTabs, activeId: aid } = useTabsStore.getState();
      const tab = storeTabs.find((t) => t.id === aid);
      if (tab?.kind === "workspace") actions.closePane(aid, (tab as WorkspaceTab).activePaneId);
    },
    "menu:toggle_sidebar": () => actions.toggleSidebar(),
    "menu:toggle_ai": () => actions.togglePanelAndFocus(),
    "menu:toggle_ai_2": () => actions.togglePanelAndFocus(),
    "menu:zoom_in": () => {
      const kind = selectActiveTabKind(useTabsStore.getState());
      if (kind === "workspace") void setTerminalFontSize(Math.min(usePreferencesStore.getState().terminalFontSize + 1, 32));
      else if (kind === "editor") void setEditorFontSize(Math.min(usePreferencesStore.getState().editorFontSize + 1, 32));
      else if (kind === "sftp") void setSftpFontSize(Math.min(usePreferencesStore.getState().sftpFontSize + 1, 20));
    },
    "menu:zoom_out": () => {
      const kind = selectActiveTabKind(useTabsStore.getState());
      if (kind === "workspace") void setTerminalFontSize(Math.max(usePreferencesStore.getState().terminalFontSize - 1, 8));
      else if (kind === "editor") void setEditorFontSize(Math.max(usePreferencesStore.getState().editorFontSize - 1, 8));
      else if (kind === "sftp") void setSftpFontSize(Math.max(usePreferencesStore.getState().sftpFontSize - 1, 10));
    },
    "menu:zoom_reset": () => {
      const kind = selectActiveTabKind(useTabsStore.getState());
      if (kind === "workspace") void setTerminalFontSize(DEFAULT_PREFERENCES.terminalFontSize);
      else if (kind === "editor") void setEditorFontSize(DEFAULT_PREFERENCES.editorFontSize);
      else if (kind === "sftp") void setSftpFontSize(DEFAULT_PREFERENCES.sftpFontSize);
    },
    "menu:split_pane_right": () => {
      const { tabs: storeTabs, activeId: aid } = useTabsStore.getState();
      if (storeTabs.find((t) => t.id === aid)?.kind === "workspace") actions.splitPane(aid, "horizontal");
    },
    "menu:split_pane_down": () => {
      const { tabs: storeTabs, activeId: aid } = useTabsStore.getState();
      if (storeTabs.find((t) => t.id === aid)?.kind === "workspace") actions.splitPane(aid, "vertical");
    },
    "menu:find": () => actions.openFind(),
    "menu:open_shortcuts": () => actions.openShortcuts(),
    "menu:next_tab": () => actions.cycleTab(1),
    "menu:prev_tab": () => actions.cycleTab(-1),
    "menu:open_host_manager": () => actions.openHomeTab(),
    "menu:new_ssh_connection": () => actions.openHomeTab(),
    "menu:new_quick_ssh": () => actions.openHomeTab(),
    "menu:ask_selection": () => actions.askFromSelection(),
    "menu:new_ai_session": () => {
      useChatStore.getState().newSession();
      actions.togglePanelAndFocus();
    },
    "menu:clear_chat": () => {
      const { activeSessionId, deleteSession, newSession } = useChatStore.getState();
      if (activeSessionId) deleteSession(activeSessionId);
      newSession();
    },
  };

  // Register menu listeners ONCE — handlers always current via ref above
  useEffect(() => {
    const cleanups: Array<() => void> = [];
    const on = (event: string) => {
      listen(event, () => menuHandlersRef.current[event]?.()).then((u) => cleanups.push(u));
    };
    for (const event of Object.keys(menuHandlersRef.current)) on(event);
    return () => cleanups.forEach((fn) => fn());
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // nexum:open-file listener
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<{ path: string }>("nexum:open-file", (event) => {
      actions.openFileTab(event.payload.path);
    }).then((fn) => { unlisten = fn; });
    return () => unlisten?.();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // nexum:open-preview listener
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<{ path: string; title: string }>("nexum:open-preview", (event) => {
      useTabsStore.getState().newPreviewTab(event.payload.path, event.payload.title);
    }).then((fn) => { unlisten = fn; });
    return () => unlisten?.();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

}
