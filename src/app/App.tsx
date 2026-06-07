import {
  hasAnyKey,
  useChatStore,
  useAiLiveBridge,
} from "@/modules/ai";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { useShortcutHandlers } from "@/modules/shortcuts";
import {
  useWorkspaceCwd,
  useTabManagement,
  useTabsStore,
  selectActiveTabKind,
} from "@/modules/tabs";
import { usePaletteCallbacks } from "@/modules/command-palette";
import { useMenuBridge } from "@/app/hooks/useMenuBridge";
import { useUpdater } from "@/modules/updater";
import { useAppBootstrap } from "@/app/hooks/useAppBootstrap";
import { useSessionLifecycle, setScrollbackLive } from "@/modules/session";
import { useSidebar } from "@/modules/statusbar";
import { usePreviewDetection } from "@/modules/terminal";
import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useState } from "react";
import { AppShell } from "@/app/components";

export default function App() {
  // ── Stable store actions (never change — safe to destructure once) ────────
  const {
    openHomeTab,
    openFileTab,
    openAiDiffTab,
    setAiDiffStatus,
    newSshTab,
    newQuickSshTab,
    newSftpTab,
    updateSftpPaths,
    openRemoteEditorTab,
    openUntitledTab,
    setActiveId,
    splitPane,
    closePane,
  } = useTabsStore.getState();

  // ── Bootstrap hooks ────────────────────────────────────────────────────────
  const { keysLoaded, apiKeys, home } = useAppBootstrap();
  const { sessionRestored, prefsHydrated } = useSessionLifecycle();
  const hasComposer = hasAnyKey(apiKeys);

  // ── useWorkspaceCwd MUST come before useTabManagement ─────────────────────
  const { explorerRoot, inheritedCwdForNewTab } = useWorkspaceCwd(home);

  // ── Sidebar hook ──────────────────────────────────────────────────────────
  const sidebar = useSidebar();

  // ── Tab management hook ───────────────────────────────────────────────────
  const tabs = useTabManagement({ home, inheritedCwdForNewTab });

  // ── Preview detection hook ────────────────────────────────────────────────
  const detectedPreviewUrl = usePreviewDetection(tabs.activeDetectedUrl);

  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const openMini = useChatStore((s) => s.openMini);
  const panelOpen = useChatStore((s) => s.panelOpen);
  const respondToApproval = useChatStore((s) => s.respondToApproval);

  const sidebarPosition = usePreferencesStore((s) => s.sidebarPosition);
  const zenModeShowHeader = usePreferencesStore((s) => s.zenModeShowHeader);
  const zenModeShowStatusbar = usePreferencesStore((s) => s.zenModeShowStatusbar);
  const aiEnabled = usePreferencesStore((s) => s.aiEnabled);
  const checkForUpdates = usePreferencesStore((s) => s.checkForUpdates);
  const reduceMotion = usePreferencesStore((s) => s.reduceMotion);
  useUpdater({ autoCheck: checkForUpdates });

  useEffect(() => {
    if (!prefsHydrated || !sessionRestored) return;
    void invoke("show_main_window");
  }, [prefsHydrated, sessionRestored]);

  // Safety net: show the window after 8 s even if a bootstrap condition never
  // resolves. show_main_window is idempotent so calling it twice is harmless.
  useEffect(() => {
    const t = setTimeout(() => void invoke("show_main_window"), 8_000);
    return () => clearTimeout(t);
  }, []);

  // Wire terminal refs into the scrollback live context
  useEffect(() => {
    setScrollbackLive({ getAllTerminalRefs: () => tabs.refs.terminalRefs.current });
  }, [tabs.refs.terminalRefs]);

  const ai = useAiLiveBridge({
    terminalRefs: tabs.refs.terminalRefs,
    editorRefs: tabs.refs.editorRefs,
    explorerRoot,
    home,
    openPreviewTab: tabs.openPreviewTab,
  });

  const openFind = useCallback(() => {
    const kind = selectActiveTabKind(useTabsStore.getState());
    const { activeId: aid } = useTabsStore.getState();
    if (kind === "workspace") tabs.refs.workspacePaneRefs.current.get(aid)?.openFind();
    else if (kind === "editor") tabs.activeEditorHandle?.openFind();
  }, [tabs.activeEditorHandle, tabs.refs.workspacePaneRefs]);

  const palette = usePaletteCallbacks({
    openNewTab: tabs.openNewTab,
    handleClose: tabs.handleClose,
    togglePanelAndFocus: ai.togglePanelAndFocus,
    askFromSelection: ai.askFromSelection,
    execSnippet: tabs.execSnippet,
    setActivePanel: sidebar.setActivePanel,
    sidebarRef: sidebar.sidebarRef,
    openShortcuts: () => setShortcutsOpen(true),
    openPreviewTab: tabs.openPreviewTab,
    terminalRefs: tabs.refs.terminalRefs,
    editorRefs: tabs.refs.editorRefs,
  });

  useMenuBridge({
    openNewTab: tabs.openNewTab,
    openHomeTab,
    openPreviewTab: tabs.openPreviewTab,
    openUntitledTab,
    newSshTab,
    newSftpTab,
    openFileTab,
    handleClose: tabs.handleClose,
    cycleTab: tabs.cycleTab,
    splitPane,
    closePane,
    togglePanelAndFocus: ai.togglePanelAndFocus,
    askFromSelection: ai.askFromSelection,
    toggleSidebar: sidebar.toggleSidebar,
    openShortcuts: () => setShortcutsOpen(true),
    openFind,
    activeEditorHandle: tabs.activeEditorHandle,
  });

  useShortcutHandlers({
    openNewTab: tabs.openNewTab,
    handleClose: tabs.handleClose,
    cycleTab: tabs.cycleTab,
    togglePanelAndFocus: ai.togglePanelAndFocus,
    askFromSelection: ai.askFromSelection,
    toggleSidebar: sidebar.toggleSidebar,
    openPreviewTab: tabs.openPreviewTab,
    workspacePaneRefs: tabs.refs.workspacePaneRefs,
    activeEditorHandle: tabs.activeEditorHandle,
    openShortcuts: () => setShortcutsOpen(true),
    openFind,
  });

  return (
    <AppShell
      actions={{
        openHomeTab,
        openFileTab,
        openAiDiffTab,
        setAiDiffStatus,
        newSshTab,
        newQuickSshTab,
        newSftpTab,
        updateSftpPaths,
        openRemoteEditorTab,
        openUntitledTab,
        setActiveId,
      }}
      prefs={{
        sidebarPosition,
        zenModeShowHeader,
        zenModeShowStatusbar,
        reduceMotion,
        aiEnabled,
      }}
      ctrl={{
        home,
        explorerRoot,
        hasComposer,
        keysLoaded,
        detectedPreviewUrl,
        panelOpen,
        openMini,
        shortcutsOpen,
        setShortcutsOpen,
        respondToApproval,
      }}
      tabs={tabs}
      sidebar={sidebar}
      ai={ai}
      palette={palette}
    />
  );
}
