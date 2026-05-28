import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  AgentRunBridge,
  AiInputBar,
  AiMiniWindow,
  getAllKeys,
  hasAnyKey,
  SelectionAskAi,
  useChatStore,
} from "@/modules/ai";
import { AiInputBarConnect } from "@/modules/ai/components/AiInputBar";
import { AiComposerProvider } from "@/modules/ai/lib/composer";
import { useAgentsStore } from "@/modules/ai/store/agentsStore";
import { useDirectivesStore } from "@/modules/ai/store/directivesStore";
import {
  AiDiffStack,
  EditorStack,
  type EditorPaneHandle,
} from "@/modules/editor";
import { FileExplorer, PREVIEW_EXTENSIONS } from "@/modules/explorer";
import { HomeDashboard } from "@/modules/hosts";
import {
  SnippetLogDrawer,
  SnippetsPanel,
  useCommandSnippetsStore,
  useSnippetExec,
  type CommandSnippet,
  type SnippetExecMode,
} from "@/modules/snippets";
import { Header } from "@/modules/header";
import { PreviewStack, type PreviewPaneHandle } from "@/modules/preview";
import { openSettingsWindow, type SettingsTab } from "@/modules/settings/openSettingsWindow";
import { BackgroundImageLayer } from "@/modules/settings/BackgroundImageLayer";
import { usePreferencesStore } from "@/modules/settings/preferences";
import {
  onKeysChanged,
  DEFAULT_PREFERENCES,
  setTerminalFontSize,
  setEditorFontSize,
  setSftpFontSize,
} from "@/modules/settings/store";
import {
  ShortcutsDialog,
  useGlobalShortcuts,
  useKeybindsStore,
  type ShortcutHandlers,
} from "@/modules/shortcuts";
import { StatusBar, type SidebarPanel } from "@/modules/statusbar";
import { bootstrapTransferListeners } from "@/modules/sftp/store/transferStore";
import { useHostsStore } from "@/modules/hosts/store/hostsStore";
import {
  useWorkspaceCwd,
  SidebarTabList,
  type WorkspaceTab,
  type PreviewTab,
  type AiDiffTab,
  useTabsStore,
  selectActiveTabKind,
  selectActivePaneId,
} from "@/modules/tabs";
import { WorkspaceStack } from "@/modules/terminal/WorkspaceStack";
import { SftpStack } from "@/modules/sftp/SftpStack";
import { type WorkspacePaneHandle } from "@/modules/terminal";
import { type TerminalPaneHandle } from "@/modules/terminal";
import { ThemeProvider } from "@/modules/theme";
import { CommandPalette, useCommandStore, type RegistryCallbacks } from "@/modules/command-palette";
import { UpdaterDialog, useUpdater } from "@/modules/updater";
import { useThemeEngine } from "@/lib/useThemeEngine";
import { handleApiError } from "@/lib/errors";
import { captureAndSave, clearSnapshot, restoreIfEnabled } from "@/modules/session";
import { invoke } from "@tauri-apps/api/core";
import { homeDir } from "@tauri-apps/api/path";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { AnimatePresence, motion, MotionConfig } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PanelImperativeHandle } from "react-resizable-panels";
import { useShallow } from "zustand/react/shallow";

function sameOrigin(a: string, b: string): boolean {
  try {
    const ua = new URL(a);
    const ub = new URL(b);
    return ua.host === ub.host && ua.protocol === ub.protocol;
  } catch {
    return a === b;
  }
}

export default function App() {
  // ── Stable store actions (never change — safe to destructure once) ────────
  const {
    newTab,
    openDefaultTab,
    openHomeTab,
    openFileTab,
    newPreviewTab,
    openAiDiffTab,
    setAiDiffStatus,
    closeTab,
    updateTab,
    selectByIndex,
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

  // ── Reactive subscriptions — only what's needed for render ───────────────
  const activeId = useTabsStore((s) => s.activeId);
  const activeTabKind = useTabsStore(selectActiveTabKind);
  const activePaneId = useTabsStore(selectActivePaneId);
  const workspaceTabs = useTabsStore(
    useShallow((s) => s.tabs.filter((t): t is WorkspaceTab => t.kind === "workspace")),
  );
  const previewTabUrls = useTabsStore(
    useShallow((s) => s.tabs.filter((t): t is PreviewTab => t.kind === "preview").map((t) => t.url)),
  );

  const isWorkspaceTab = activeTabKind === "workspace";
  const isEditorTab = activeTabKind === "editor";
  const isPreviewTab = activeTabKind === "preview";
  const isAiDiffTab = activeTabKind === "ai-diff";
  const isHomeTab = activeTabKind === "home";

  // ── Refs ──────────────────────────────────────────────────────────────────
  const workspacePaneRefs = useRef<Map<number, WorkspacePaneHandle>>(new Map());
  const terminalRefs = useRef<Map<string, TerminalPaneHandle>>(new Map());
  const editorRefs = useRef<Map<number, EditorPaneHandle>>(new Map());
  const previewRefs = useRef<Map<number, PreviewPaneHandle>>(new Map());
  const detectedUrls = useRef<Map<string, string>>(new Map());
  const [activeDetectedUrl, setActiveDetectedUrl] = useState<string | null>(null);
  const [activeEditorHandle, setActiveEditorHandle] = useState<EditorPaneHandle | null>(null);
  const sidebarRef = useRef<PanelImperativeHandle | null>(null);
  const [activePanel, setActivePanel] = useState<SidebarPanel>("explorer");
  const lastActivePanelRef = useRef<SidebarPanel>("explorer");

  const toggleSidebar = useCallback(() => {
    const p = sidebarRef.current;
    if (!p) return;
    if (p.getSize().asPercentage <= 0) p.expand();
    else p.collapse();
  }, []);

  const handlePanelToggle = useCallback((panel: SidebarPanel) => {
    const p = sidebarRef.current;
    if (!p) return;
    if (activePanel === panel) {
      if (p.getSize().asPercentage <= 0) {
        p.expand();
      } else {
        p.collapse();
        setActivePanel(null);
      }
    } else {
      if (panel) lastActivePanelRef.current = panel;
      setActivePanel(panel);
      if (p.getSize().asPercentage <= 0) p.expand();
    }
  }, [activePanel]);

  const [home, setHome] = useState<string | null>(null);
  useEffect(() => {
    homeDir().then(setHome).catch(() => setHome(null));
  }, []);

  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const toggleCommandPalette = useCommandStore((s) => s.toggle);
  const miniOpen = useChatStore((s) => s.mini.open);
  const openMini = useChatStore((s) => s.openMini);
  const focusInput = useChatStore((s) => s.focusInput);
  const openPanel = useChatStore((s) => s.openPanel);
  const panelOpen = useChatStore((s) => s.panelOpen);
  const apiKeys = useChatStore((s) => s.apiKeys);
  const setApiKeys = useChatStore((s) => s.setApiKeys);
  const setSelectedModelId = useChatStore((s) => s.setSelectedModelId);
  const setLive = useChatStore((s) => s.setLive);
  const respondToApproval = useChatStore((s) => s.respondToApproval);
  const hasComposer = hasAnyKey(apiKeys);

  const [keysLoaded, setKeysLoaded] = useState(false);
  useEffect(() => {
    let alive = true;
    const reload = () => {
      void getAllKeys().then((keys) => {
        if (!alive) return;
        setApiKeys(keys);
        setKeysLoaded(true);
      });
    };
    reload();
    const unlistenP = onKeysChanged(reload);
    return () => {
      alive = false;
      void unlistenP.then((fn) => fn());
    };
  }, [setApiKeys]);

  const initPrefs = usePreferencesStore((s) => s.init);
  const prefDefaultModel = usePreferencesStore((s) => s.defaultModelId);
  const prefsHydrated = usePreferencesStore((s) => s.hydrated);
  const sidebarPosition = usePreferencesStore((s) => s.sidebarPosition);
  const tabsLocation = usePreferencesStore((s) => s.tabsLocation);
  const aiEnabled = usePreferencesStore((s) => s.aiEnabled);
  const sessionRestore = usePreferencesStore((s) => s.sessionRestore);
  const checkForUpdates = usePreferencesStore((s) => s.checkForUpdates);
  const reduceMotion = usePreferencesStore((s) => s.reduceMotion);
  const newTabInheritsCwd = usePreferencesStore((s) => s.newTabInheritsCwd);
  const confirmCloseTerminalTab = usePreferencesStore((s) => s.confirmCloseTerminalTab);
  const confirmQuitWithSsh = usePreferencesStore((s) => s.confirmQuitWithSsh);
  useUpdater({ autoCheck: checkForUpdates });

  useEffect(() => {
    if (tabsLocation === "titlebar" && activePanel === "tabs") {
      handlePanelToggle("explorer");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabsLocation]);

  const [sessionRestored, setSessionRestored] = useState(false);
  const [pendingCloseTabId, setPendingCloseTabId] = useState<number | null>(null);
  useEffect(() => { void initPrefs(); }, [initPrefs]);

  const initKeybinds = useKeybindsStore((s) => s.init);
  useEffect(() => { void initKeybinds(); }, [initKeybinds]);
  useThemeEngine();
  useEffect(() => {
    if (!prefsHydrated) return;
    setSelectedModelId(prefDefaultModel);
  }, [prefsHydrated, prefDefaultModel, setSelectedModelId]);

  const hydrateSessions = useChatStore((s) => s.hydrateSessions);
  useEffect(() => {
    void hydrateSessions();
    void useAgentsStore.getState().hydrate();
    void useDirectivesStore.getState().hydrate();
    void useCommandSnippetsStore.getState().hydrate();
  }, [hydrateSessions]);

  useEffect(() => {
    if (!prefsHydrated || !keysLoaded || !sessionRestored) return;
    void invoke("show_main_window");
  }, [prefsHydrated, keysLoaded, sessionRestored]);

  useEffect(() => { void bootstrapTransferListeners(); }, []);

  useEffect(() => {
    function onUnhandledRejection(e: PromiseRejectionEvent) {
      e.preventDefault();
      handleApiError(e.reason, "Unhandled Error", "System");
    }
    function onError(e: ErrorEvent) {
      handleApiError(e.error ?? e.message, "Runtime Error", "System");
    }
    window.addEventListener("unhandledrejection", onUnhandledRejection);
    window.addEventListener("error", onError);
    return () => {
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
      window.removeEventListener("error", onError);
    };
  }, []);

  // ── Session restore ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!prefsHydrated) return;
    if (!sessionRestore) {
      setSessionRestored(true);
      return;
    }
    let alive = true;
    const actions = useTabsStore.getState();
    void restoreIfEnabled({
      setActiveId: actions.setActiveId,
      newTab: actions.newTab,
      newSshTab: actions.newSshTab,
      newQuickSshTab: actions.newQuickSshTab,
      openFileTab: actions.openFileTab,
      newPreviewTab: actions.newPreviewTab,
      openHomeTab: actions.openHomeTab,
      newSftpTab: actions.newSftpTab,
      splitPane: actions.splitPane,
      setActivePaneId: actions.setActivePaneId,
    }).then((result) => {
      if (!alive) return;
      if (!result || result.restoredCount === 0) openDefaultTab();
      setSessionRestored(true);
    });
    return () => { alive = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefsHydrated, sessionRestore]);

  useEffect(() => {
    if (prefsHydrated && !sessionRestore) void clearSnapshot();
  }, [prefsHydrated, sessionRestore]);

  // Debounced save via subscribe — no tabs/activeId in deps
  useEffect(() => {
    if (!sessionRestore || !prefsHydrated) return;
    let debounce: ReturnType<typeof setTimeout>;
    const periodic = setInterval(() => void captureAndSave(), 30_000);
    const unsub = useTabsStore.subscribe(() => {
      clearTimeout(debounce);
      debounce = setTimeout(() => void captureAndSave(), 3_000);
    });
    return () => { unsub(); clearTimeout(debounce); clearInterval(periodic); };
  }, [sessionRestore, prefsHydrated]);

  // Keep a ref to latest tabs/activeId for the close handler (no rerender)
  const sessionSaveRef = useRef<{ tabs: ReturnType<typeof useTabsStore.getState>["tabs"]; activeId: number }>({
    tabs: [],
    activeId: -1,
  });
  useEffect(() => {
    return useTabsStore.subscribe((s) => {
      sessionSaveRef.current = { tabs: s.tabs, activeId: s.activeId };
    });
  }, []);

  const confirmQuitRef = useRef(confirmQuitWithSsh);
  useEffect(() => { confirmQuitRef.current = confirmQuitWithSsh; }, [confirmQuitWithSsh]);

  useEffect(() => {
    if (!sessionRestore && !confirmQuitWithSsh) return;
    let cleanup: (() => void) | undefined;
    void getCurrentWindow().onCloseRequested(async (event) => {
      event.preventDefault();
      if (confirmQuitRef.current) {
        const { tabs: currentTabs } = sessionSaveRef.current;
        const sshCount = currentTabs.filter(
          (t) => t.kind === "workspace" && Object.values((t as WorkspaceTab).sessions).some((s) => s.kind === "ssh"),
        ).length;
        if (sshCount > 0) {
          const ok = window.confirm(
            `You have ${sshCount} active SSH connection${sshCount > 1 ? "s" : ""}. Quit anyway?`,
          );
          if (!ok) return;
        }
      }
      try {
        if (sessionRestore) await captureAndSave();
      } finally {
        await invoke("quit_app");
      }
    }).then((unlisten) => { cleanup = unlisten; });
    return () => cleanup?.();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionRestore, confirmQuitWithSsh]);

  // ── AI diff apply — subscribe, no rerender ─────────────────────────────────
  const appliedDiffsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    return useTabsStore.subscribe((state) => {
      const approvedDiffs = state.tabs.filter(
        (t): t is AiDiffTab => t.kind === "ai-diff" && t.status === "approved",
      );
      for (const t of approvedDiffs) {
        if (appliedDiffsRef.current.has(t.approvalId)) continue;
        appliedDiffsRef.current.add(t.approvalId);
        for (const e of state.tabs) {
          if (e.kind !== "editor" || (e as { path: string }).path !== t.path) continue;
          editorRefs.current.get(e.id)?.reload();
        }
      }
    });
  }, []);

  const { explorerRoot, inheritedCwdForNewTab } = useWorkspaceCwd(home);

  useEffect(() => {
    setActiveEditorHandle(editorRefs.current.get(activeId) ?? null);
    const url = activePaneId ? (detectedUrls.current.get(activePaneId) ?? null) : null;
    setActiveDetectedUrl(url);
  }, [activeId, activePaneId]);

  const handleDetectedLocalUrl = useCallback((sessionId: string, url: string) => {
    detectedUrls.current.set(sessionId, url);
    if (sessionId === selectActivePaneId(useTabsStore.getState())) {
      setActiveDetectedUrl(url);
    }
  }, []);

  const detectedPreviewUrl = useMemo(() => {
    if (!isWorkspaceTab || !activeDetectedUrl) return null;
    const alreadyOpen = previewTabUrls.some((url) => sameOrigin(url, activeDetectedUrl));
    return alreadyOpen ? null : activeDetectedUrl;
  }, [isWorkspaceTab, activeDetectedUrl, previewTabUrls]);

  const disposeTab = useCallback((id: number) => {
    const { tabs } = useTabsStore.getState();
    const tab = tabs.find((t) => t.id === id);
    if (tab?.kind === "workspace") {
      for (const sessionId of Object.keys((tab as WorkspaceTab).sessions)) {
        terminalRefs.current.delete(sessionId);
        detectedUrls.current.delete(sessionId);
      }
      workspacePaneRefs.current.delete(id);
    }
    editorRefs.current.delete(id);
    previewRefs.current.delete(id);
    closeTab(id);
  }, []);

  const handleClose = useCallback((id: number) => {
    const { tabs } = useTabsStore.getState();
    const t = tabs.find((x) => x.id === id);
    if (t?.kind === "workspace") {
      if (confirmCloseTerminalTab) {
        setPendingCloseTabId(id);
        return;
      }
      disposeTab(id);
      return;
    }
    if (t?.kind === "editor" && (t as { isUntitled: boolean }).isUntitled) {
      const choice = window.confirm(`"${t.title}" has not been saved. Save before closing?`);
      if (choice) {
        const handle = editorRefs.current.get(id);
        if (handle) {
          void handle.save().then(() => disposeTab(id));
          return;
        }
      }
      disposeTab(id);
      return;
    }
    if (t?.kind === "editor" && (t as { dirty: boolean }).dirty) {
      const ok = window.confirm(`"${t.title}" has unsaved changes. Close anyway?`);
      if (!ok) return;
    }
    disposeTab(id);
  }, [disposeTab, confirmCloseTerminalTab]);

  const handleCloseOthers = useCallback((keepId: number) => {
    const { tabs } = useTabsStore.getState();
    tabs.filter((t) => t.id !== keepId).forEach((t) => handleClose(t.id));
    setActiveId(keepId);
  }, [handleClose]);

  const handleCloseAll = useCallback(() => {
    const { tabs } = useTabsStore.getState();
    tabs.forEach((t) => handleClose(t.id));
  }, [handleClose]);

  const cycleTab = useCallback((delta: 1 | -1) => {
    const { tabs, activeId: aid } = useTabsStore.getState();
    if (tabs.length < 2) return;
    const idx = tabs.findIndex((t) => t.id === aid);
    const nextIdx = (idx + delta + tabs.length) % tabs.length;
    setActiveId(tabs[nextIdx].id);
  }, []);

  const captureActiveSelection = useCallback((): string | null => {
    const { tabs, activeId: aid } = useTabsStore.getState();
    const t = tabs.find((x) => x.id === aid);
    if (!t) return null;
    if (t.kind === "workspace" && (t as WorkspaceTab).activePaneId) {
      return terminalRefs.current.get((t as WorkspaceTab).activePaneId)?.getSelection() ?? null;
    }
    if (t.kind === "editor") {
      return editorRefs.current.get(aid)?.getSelection() ?? null;
    }
    return null;
  }, []);

  const togglePanelAndFocus = useCallback(() => {
    if (!hasComposer) {
      void openSettingsWindow("models");
      return;
    }
    if (panelOpen) {
      useChatStore.getState().closePanel();
    } else {
      openPanel();
      focusInput(null);
    }
  }, [hasComposer, panelOpen, openPanel, focusInput]);

  const attachSelection = useChatStore((s) => s.attachSelection);

  const handleAttachFileToAgent = useCallback((path: string) => {
    if (!hasComposer) {
      void openSettingsWindow("models");
      return;
    }
    window.dispatchEvent(new CustomEvent<string>("nexum:ai-attach-file", { detail: path }));
    openPanel();
    focusInput(null);
  }, [hasComposer, openPanel, focusInput]);

  const askFromSelection = useCallback(() => {
    if (!hasComposer) {
      void openSettingsWindow("models");
      return;
    }
    const selection = captureActiveSelection();
    if (!selection || !selection.trim()) {
      focusInput(null);
      return;
    }
    const { tabs, activeId: aid } = useTabsStore.getState();
    const tab = tabs.find((x) => x.id === aid);
    const source: "terminal" | "editor" = tab?.kind === "editor" ? "editor" : "terminal";
    attachSelection(selection, source);
  }, [hasComposer, captureActiveSelection, focusInput, attachSelection]);

  const [askPopup, setAskPopup] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const isInsideAi = (t: EventTarget | null) => {
      const el = t as HTMLElement | null;
      if (!el) return false;
      return !!(
        el.closest("[data-selection-ask-ai]") ||
        el.closest("[data-ai-input-bar]") ||
        el.closest("[data-ai-mini-window]")
      );
    };
    const onDown = (e: MouseEvent) => { if (isInsideAi(e.target)) return; setAskPopup(null); };
    const onUp = (e: MouseEvent) => {
      if (isInsideAi(e.target)) return;
      setTimeout(() => {
        const text = captureActiveSelection();
        if (text && text.trim().length > 0) setAskPopup({ x: e.clientX, y: e.clientY });
        else setAskPopup(null);
      }, 0);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("mouseup", onUp);
    };
  }, [captureActiveSelection]);

  const onAskFromSelection = useCallback(() => {
    askFromSelection();
    setAskPopup(null);
  }, [askFromSelection]);

  const openNewTab = useCallback(() => {
    newTab(newTabInheritsCwd ? inheritedCwdForNewTab() : undefined);
  }, [newTabInheritsCwd, inheritedCwdForNewTab]);

  const onOpenHostManager = useCallback(() => { openHomeTab(); }, []);

  const sendCd = useCallback((path: string) => {
    const paneId = selectActivePaneId(useTabsStore.getState());
    if (!paneId) return;
    const term = terminalRefs.current.get(paneId);
    if (!term) return;
    const quoted = path.includes(" ") ? `'${path.replace(/'/g, `'\\''`)}'` : path;
    term.write(`cd ${quoted}\n`);
    term.focus();
  }, []);

  const cdInNewTab = useCallback((path: string) => {
    const id = newTab(path);
    setTimeout(() => {
      const { tabs } = useTabsStore.getState();
      const newTabData = tabs.find((t) => t.id === id);
      if (!newTabData || newTabData.kind !== "workspace") return;
      const paneId = (newTabData as WorkspaceTab).activePaneId;
      const t = terminalRefs.current.get(paneId);
      if (!t) return;
      const quoted = path.includes(" ") ? `'${path.replace(/'/g, `'\\''`)}'` : path;
      t.write(`cd ${quoted}\n`);
      t.focus();
    }, 80);
  }, []);

  const handlePathRenamed = useCallback((from: string, to: string) => {
    const { tabs } = useTabsStore.getState();
    for (const t of tabs) {
      if (t.kind !== "editor") continue;
      const et = t as { path: string; id: number };
      if (et.path === from) {
        const i = to.lastIndexOf("/");
        updateTab(t.id, { path: to, title: i === -1 ? to : to.slice(i + 1) });
      } else if (et.path.startsWith(`${from}/`)) {
        const suffix = et.path.slice(from.length);
        const newPath = `${to}${suffix}`;
        const i = newPath.lastIndexOf("/");
        updateTab(t.id, { path: newPath, title: i === -1 ? newPath : newPath.slice(i + 1) });
      }
    }
  }, []);

  const handlePathDeleted = useCallback((path: string) => {
    const { tabs } = useTabsStore.getState();
    for (const t of tabs) {
      if (t.kind !== "editor") continue;
      const et = t as { path: string };
      if (et.path === path || et.path.startsWith(`${path}/`)) disposeTab(t.id);
    }
  }, [disposeTab]);

  const openPreviewTab = useCallback((url: string) => {
    const id = newPreviewTab(url);
    if (!url) setTimeout(() => previewRefs.current.get(id)?.focusAddressBar(), 0);
    return id;
  }, []);

  const handleOpenFile = useCallback((path: string) => {
    const ext = path.split(".").pop()?.toLowerCase() ?? "";
    if (PREVIEW_EXTENSIONS.has(ext)) openPreviewTab(path);
    else openFileTab(path);
  }, [openPreviewTab]);

  const restoreFocus = useCallback(() => {
    const kind = selectActiveTabKind(useTabsStore.getState());
    const { activeId: aid } = useTabsStore.getState();
    const paneId = selectActivePaneId(useTabsStore.getState());
    if (kind === "workspace" && paneId) terminalRefs.current.get(paneId)?.focus();
    else if (kind === "editor") editorRefs.current.get(aid)?.focus();
  }, []);

  const [snippetLogDrawerOpen, setSnippetLogDrawerOpen] = useState(false);
  const { execSnippet } = useSnippetExec({
    tabs: workspaceTabs,
    activeTerminalRef: () => activePaneId ? (terminalRefs.current.get(activePaneId) ?? null) : null,
    onNewLocalTab: (cwd, command) => newTab(cwd ?? inheritedCwdForNewTab(), command),
    onNewSshTab: (hostId, title, cwd, command) => newSshTab(hostId, title, cwd, command),
    onOpenLogDrawer: () => setSnippetLogDrawerOpen(true),
  });

  const setSelectedHost = useHostsStore((s) => s.setSelectedHost);

  const paletteCallbacks = useMemo<RegistryCallbacks>(() => ({
    openSettings: (section) => void openSettingsWindow(section as SettingsTab | undefined),
    openShortcuts: () => setShortcutsOpen(true),
    newSshTab,
    newSftpTab,
    newTab: openNewTab,
    openUntitledTab: () => void openUntitledTab(),
    openHomeTab,
    splitRight: () => {
      const { tabs, activeId: aid } = useTabsStore.getState();
      if (tabs.find((t) => t.id === aid)?.kind === "workspace") splitPane(aid, "horizontal");
    },
    splitDown: () => {
      const { tabs, activeId: aid } = useTabsStore.getState();
      if (tabs.find((t) => t.id === aid)?.kind === "workspace") splitPane(aid, "vertical");
    },
    closePane: () => {
      const { tabs, activeId: aid } = useTabsStore.getState();
      const tab = tabs.find((t) => t.id === aid);
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
      const { tabs, activeId: aid } = useTabsStore.getState();
      const tab = tabs.find((t) => t.id === aid);
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
      const { tabs, activeId: aid } = useTabsStore.getState();
      tabs.forEach((t) => { if (t.id !== aid) handleClose(t.id); });
    },
    disconnectCurrentSsh: () => {
      const { tabs, activeId: aid } = useTabsStore.getState();
      const tab = tabs.find((t) => t.id === aid) as WorkspaceTab | undefined;
      if (tab?.kind !== "workspace") return;
      const session = tab.sessions[tab.activePaneId];
      if (session?.kind === "ssh" && session.id) void invoke("ssh_disconnect", { sessionId: session.id });
    },
    reconnectCurrentSsh: () => {
      const paneId = selectActivePaneId(useTabsStore.getState());
      if (paneId) window.dispatchEvent(new CustomEvent("nexum:ssh-reconnect", { detail: { paneId } }));
    },
    openNewHostForm: () => {
      openHomeTab();
      setTimeout(() => setSelectedHost("__new__"), 150);
    },
  }), [
    openNewTab,
    openUntitledTab,
    togglePanelAndFocus,
    askFromSelection,
    handleClose,
    execSnippet,
    setActivePanel,
    setSelectedHost,
  ]);

  const activeContext = useMemo(() => {
    const { tabs, activeId: aid } = useTabsStore.getState();
    const tab = tabs.find((t) => t.id === aid);
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

  const shortcutHandlers = useMemo<ShortcutHandlers>(() => ({
    "command.palette": () => toggleCommandPalette(),
    "tab.new": openNewTab,
    "tab.newPreview": () => openPreviewTab(""),
    "tab.newEditor": () => void openUntitledTab(),
    "tab.close": () => handleClose(useTabsStore.getState().activeId),
    "tab.next": () => cycleTab(1),
    "tab.prev": () => cycleTab(-1),
    "tab.selectByIndex": (e) => selectByIndex(parseInt(e.key, 10) - 1),
    "search.focus": () => {
      const kind = selectActiveTabKind(useTabsStore.getState());
      const { activeId: aid } = useTabsStore.getState();
      if (kind === "workspace") workspacePaneRefs.current.get(aid)?.openFind();
      else if (kind === "editor") activeEditorHandle?.openFind();
    },
    "ai.toggle": togglePanelAndFocus,
    "ai.askSelection": askFromSelection,
    "shortcuts.open": () => setShortcutsOpen((v) => !v),
    "sidebar.toggle": toggleSidebar,
    "pane.splitRight": () => {
      const { tabs, activeId: aid } = useTabsStore.getState();
      if (tabs.find((t) => t.id === aid)?.kind === "workspace") splitPane(aid, "horizontal");
    },
    "pane.splitDown": () => {
      const { tabs, activeId: aid } = useTabsStore.getState();
      if (tabs.find((t) => t.id === aid)?.kind === "workspace") splitPane(aid, "vertical");
    },
    "pane.close": () => {
      const { tabs, activeId: aid } = useTabsStore.getState();
      const tab = tabs.find((t) => t.id === aid);
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
    togglePanelAndFocus,
    askFromSelection,
    toggleSidebar,
    toggleCommandPalette,
  ]);

  useGlobalShortcuts(shortcutHandlers);

  // ── Menu bar bridge — registered ONCE, handlers updated via ref ────────────
  const menuHandlersRef = useRef<Record<string, () => void>>({});
  menuHandlersRef.current = {
    "menu:new_terminal_tab": () => openNewTab(),
    "menu:new_ssh_tab": () => openHomeTab(),
    "menu:new_sftp_tab": () => openHomeTab(),
    "menu:new_preview_tab": () => openPreviewTab(""),
    "menu:new_editor_tab": () => void openUntitledTab(),
    "menu:close_tab": () => handleClose(useTabsStore.getState().activeId),
    "menu:close_pane": () => {
      const { tabs, activeId: aid } = useTabsStore.getState();
      const tab = tabs.find((t) => t.id === aid);
      if (tab?.kind === "workspace") closePane(aid, (tab as WorkspaceTab).activePaneId);
    },
    "menu:toggle_sidebar": () => toggleSidebar(),
    "menu:toggle_ai": () => togglePanelAndFocus(),
    "menu:toggle_ai_2": () => togglePanelAndFocus(),
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
      const { tabs, activeId: aid } = useTabsStore.getState();
      if (tabs.find((t) => t.id === aid)?.kind === "workspace") splitPane(aid, "horizontal");
    },
    "menu:split_pane_down": () => {
      const { tabs, activeId: aid } = useTabsStore.getState();
      if (tabs.find((t) => t.id === aid)?.kind === "workspace") splitPane(aid, "vertical");
    },
    "menu:find": () => {
      const kind = selectActiveTabKind(useTabsStore.getState());
      const { activeId: aid } = useTabsStore.getState();
      if (kind === "workspace") workspacePaneRefs.current.get(aid)?.openFind();
      else if (kind === "editor") activeEditorHandle?.openFind();
    },
    "menu:open_shortcuts": () => setShortcutsOpen(true),
    "menu:next_tab": () => cycleTab(1),
    "menu:prev_tab": () => cycleTab(-1),
    "menu:open_host_manager": () => openHomeTab(),
    "menu:new_ssh_connection": () => openHomeTab(),
    "menu:new_quick_ssh": () => openHomeTab(),
    "menu:ask_selection": () => askFromSelection(),
    "menu:new_ai_session": () => {
      useChatStore.getState().newSession();
      togglePanelAndFocus();
    },
    "menu:clear_chat": () => {
      const { activeSessionId, deleteSession, newSession } = useChatStore.getState();
      if (activeSessionId) deleteSession(activeSessionId);
      newSession();
    },
  };

  useEffect(() => {
    const cleanups: Array<() => void> = [];
    const on = (event: string) => {
      listen(event, () => menuHandlersRef.current[event]?.()).then((u) => cleanups.push(u));
    };
    for (const event of Object.keys(menuHandlersRef.current)) on(event);
    return () => cleanups.forEach((fn) => fn());
  }, []); // registered once — handlers always current via ref

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<{ path: string }>("nexum:open-file", (event) => {
      openFileTab(event.payload.path);
    }).then((fn) => { unlisten = fn; });
    return () => unlisten?.();
  }, []);

  // ── setLive — tabs/activeId read inside via getState() ────────────────────
  useEffect(() => {
    setLive({
      getCwd: () => {
        const { tabs, activeId: aid } = useTabsStore.getState();
        const active = tabs.find((x) => x.id === aid);
        if (active?.kind === "workspace") {
          const wt = active as WorkspaceTab;
          const session = wt.sessions[wt.activePaneId];
          if (session?.kind === "local" && session.cwd) return session.cwd;
        }
        for (let i = tabs.length - 1; i >= 0; i--) {
          const t = tabs[i];
          if (t.kind !== "workspace") continue;
          for (const s of Object.values((t as WorkspaceTab).sessions)) {
            if (s.kind === "local" && s.cwd) return s.cwd;
          }
        }
        return explorerRoot ?? home ?? null;
      },
      getTerminalContext: () => {
        const { tabs, activeId: aid } = useTabsStore.getState();
        const t = tabs.find((x) => x.id === aid);
        if (t?.kind !== "workspace") return null;
        return terminalRefs.current.get((t as WorkspaceTab).activePaneId)?.getBuffer(300) ?? null;
      },
      injectIntoActivePty: (text) => {
        const { tabs, activeId: aid } = useTabsStore.getState();
        const t = tabs.find((x) => x.id === aid);
        if (t?.kind !== "workspace") return false;
        const term = terminalRefs.current.get((t as WorkspaceTab).activePaneId);
        if (!term) return false;
        term.write(text);
        term.focus();
        return true;
      },
      getWorkspaceRoot: () => explorerRoot ?? home ?? null,
      getActiveFile: () => {
        const { tabs, activeId: aid } = useTabsStore.getState();
        const t = tabs.find((x) => x.id === aid);
        return t?.kind === "editor" ? (t as { path: string }).path : null;
      },
      openPreview: (url: string) => { openPreviewTab(url); return true; },
      getActiveTabKind: () => {
        const { tabs, activeId: aid } = useTabsStore.getState();
        return tabs.find((x) => x.id === aid)?.kind ?? null;
      },
      getActiveSshTabId: () => {
        const { tabs, activeId: aid } = useTabsStore.getState();
        const t = tabs.find((x) => x.id === aid);
        if (t?.kind !== "workspace") return null;
        const wt = t as WorkspaceTab;
        const session = wt.sessions[wt.activePaneId];
        return session?.kind === "ssh" ? wt.activePaneId : null;
      },
    });
  }, [setLive, explorerRoot, home, openPreviewTab]);

  const registerEditorHandle = useCallback((id: number, h: EditorPaneHandle | null) => {
    if (h) editorRefs.current.set(id, h);
    else editorRefs.current.delete(id);
    if (id === activeId) setActiveEditorHandle(h);
  }, [activeId]);

  const registerPreviewHandle = useCallback((id: number, h: PreviewPaneHandle | null) => {
    if (h) previewRefs.current.set(id, h);
    else previewRefs.current.delete(id);
  }, []);

  const handlePreviewUrl = useCallback((id: number, url: string) => updateTab(id, { url }), []);
  const handleEditorDirty = useCallback((id: number, dirty: boolean) => updateTab(id, { dirty }), []);
  const handleEditorSaveAs = useCallback((id: number, newPath: string) => {
    const name = newPath.split("/").pop() ?? newPath;
    updateTab(id, { path: newPath, title: name });
  }, []);

  const handleSnippetRun = useCallback((snippet: CommandSnippet, mode?: SnippetExecMode) => {
    void execSnippet(snippet, mode);
  }, [execSnippet]);

  const sidebarPanel = (side: "left" | "right") => (
    <ResizablePanel
      id="sidebar"
      panelRef={sidebarRef}
      defaultSize="225px"
      minSize="130px"
      maxSize="450px"
      collapsible
      collapsedSize={0}
      onResize={(size) => {
        if (size.asPercentage <= 0) {
          setActivePanel(null);
        } else if (size.asPercentage > 0) {
          setActivePanel((prev) => {
            const next = prev ?? lastActivePanelRef.current ?? "explorer";
            lastActivePanelRef.current = next;
            return next;
          });
        }
      }}
    >
      <div className={cn("h-full bg-card", side === "left" ? "border-r border-border/60" : "border-l border-border/60")}>
        {activePanel === "tabs" ? (
          <SidebarTabList
            onSelect={setActiveId}
            onNew={openNewTab}
            onNewPreview={() => openPreviewTab("")}
            onNewEditor={() => void openUntitledTab()}
            onNewSsh={newSshTab}
            onNewSftp={newSftpTab}
            onOpenHostManager={onOpenHostManager}
            onClose={handleClose}
            onCloseOthers={handleCloseOthers}
            onCloseAll={handleCloseAll}
          />
        ) : activePanel === "snippets" ? (
          <SnippetsPanel onRun={handleSnippetRun} />
        ) : (
          <FileExplorer
            rootPath={explorerRoot}
            onOpenFile={handleOpenFile}
            onOpenPreview={openPreviewTab}
            onPathRenamed={handlePathRenamed}
            onPathDeleted={handlePathDeleted}
            onRevealInTerminal={cdInNewTab}
            onAttachToAgent={handleAttachFileToAgent}
          />
        )}
      </div>
    </ResizablePanel>
  );

  const shell = (
    <MotionConfig reducedMotion={reduceMotion ? "always" : "user"}>
    <ThemeProvider>
      <TooltipProvider>
        <div className="relative z-[1] flex h-screen flex-col overflow-hidden bg-background text-foreground">
          <BackgroundImageLayer />
          <Header
            onSelect={setActiveId}
            onNew={openNewTab}
            onNewPreview={() => openPreviewTab("")}
            onNewEditor={() => void openUntitledTab()}
            onNewSsh={newSshTab}
            onNewSftp={newSftpTab}
            onClose={handleClose}
            onCloseOthers={handleCloseOthers}
            onCloseAll={handleCloseAll}
            onOpenShortcuts={() => setShortcutsOpen(true)}
            onOpenSettings={() => void openSettingsWindow()}
            onOpenHostManager={onOpenHostManager}
            onOpenThemes={() => useCommandStore.getState().openToPage("themes")}
          />

          <main className="flex min-h-0 flex-1 flex-col">
            <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
              {sidebarPosition !== "right" && (
                <>
                  {sidebarPanel("left")}
                  <ResizableHandle withHandle />
                </>
              )}
              <ResizablePanel id="workspace" defaultSize="78%" minSize="30%">
                <div className="flex h-full min-h-0 flex-col">
                  <div className="relative min-h-0 flex-1">
                    <WorkspaceStack
                      workspacePaneRefs={workspacePaneRefs}
                      terminalRefs={terminalRefs}
                      onDetectedLocalUrl={handleDetectedLocalUrl}
                    />
                    <div
                      className={cn(
                        "absolute inset-0 px-3 pt-2 pb-2",
                        isEditorTab ? "z-10" : "z-0 opacity-0 pointer-events-none",
                      )}
                      aria-hidden={!isEditorTab}
                    >
                      <EditorStack
                        registerHandle={registerEditorHandle}
                        onDirtyChange={handleEditorDirty}
                        onCloseTab={disposeTab}
                        onSaveAs={handleEditorSaveAs}
                      />
                    </div>
                    <div
                      className={cn(
                        "absolute inset-0 px-3 pt-2 pb-2",
                        isPreviewTab ? "z-10" : "z-0 opacity-0 pointer-events-none",
                      )}
                      aria-hidden={!isPreviewTab}
                    >
                      <PreviewStack
                        registerHandle={registerPreviewHandle}
                        onUrlChange={handlePreviewUrl}
                      />
                    </div>
                    <div
                      className={cn(
                        "absolute inset-0 px-3 pt-2 pb-2",
                        isAiDiffTab ? "z-10" : "z-0 opacity-0 pointer-events-none",
                      )}
                      aria-hidden={!isAiDiffTab}
                    >
                      <AiDiffStack
                        onAccept={(id) => respondToApproval(id, true)}
                        onReject={(id) => respondToApproval(id, false)}
                      />
                    </div>
                    <div
                      className={cn(
                        "absolute inset-0",
                        isHomeTab ? "z-10" : "z-0 opacity-0 pointer-events-none",
                      )}
                      aria-hidden={!isHomeTab}
                    >
                      <HomeDashboard
                        newSshTab={newSshTab}
                        newQuickSshTab={newQuickSshTab}
                        newSftpTab={newSftpTab}
                      />
                    </div>
                    <SftpStack
                      onOpenSshTerminal={newSshTab}
                      onOpenRemoteEditor={openRemoteEditorTab}
                      onPathsChange={updateSftpPaths}
                    />
                  </div>

                  {keysLoaded ? (
                    <motion.div
                      data-ai-input-bar
                      initial={false}
                      animate={{ height: panelOpen ? "auto" : 0, opacity: panelOpen ? 1 : 0 }}
                      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                      className="overflow-hidden"
                      aria-hidden={!panelOpen}
                    >
                      {aiEnabled && (hasComposer ? (
                        <AiInputBar />
                      ) : (
                        <AiInputBarConnect onAdd={() => void openSettingsWindow("ai")} />
                      ))}
                    </motion.div>
                  ) : null}
                </div>
              </ResizablePanel>
              {sidebarPosition === "right" && (
                <>
                  <ResizableHandle withHandle />
                  {sidebarPanel("right")}
                </>
              )}
            </ResizablePanelGroup>
          </main>

          <SnippetLogDrawer
            open={snippetLogDrawerOpen}
            onClose={() => setSnippetLogDrawerOpen(false)}
          />

          <StatusBar
            home={home}
            onCd={sendCd}
            onOpenMini={openMini}
            hasComposer={aiEnabled && hasComposer}
            detectedPreviewUrl={detectedPreviewUrl}
            onOpenPreview={() => {
              if (detectedPreviewUrl) openPreviewTab(detectedPreviewUrl);
            }}
            activePanel={activePanel}
            onPanelToggle={(panel) => {
              if (panel === "hosts") { openHomeTab(); return; }
              handlePanelToggle(panel);
            }}
          />

          {aiEnabled && hasComposer ? (
            <AgentRunBridge openAiDiffTab={openAiDiffTab} setAiDiffStatus={setAiDiffStatus} />
          ) : null}

          <AnimatePresence>
            {aiEnabled && miniOpen && hasComposer ? <AiMiniWindow key="ai-mini" /> : null}
            {aiEnabled && askPopup ? (
              <SelectionAskAi
                key="ask-ai-popup"
                x={askPopup.x}
                y={askPopup.y}
                onAsk={onAskFromSelection}
                onDismiss={() => setAskPopup(null)}
              />
            ) : null}
          </AnimatePresence>

          <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />

          <CommandPalette
            callbacks={paletteCallbacks}
            activeTabKind={activeTabKind ?? undefined}
            activeContext={activeContext}
            activeTabId={activeId}
            restoreFocus={restoreFocus}
          />

          <UpdaterDialog />

          <AlertDialog
            open={pendingCloseTabId !== null}
            onOpenChange={(open) => { if (!open) setPendingCloseTabId(null); }}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Close terminal tab?</AlertDialogTitle>
                <AlertDialogDescription>
                  The running shell process will be terminated.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    if (pendingCloseTabId !== null) disposeTab(pendingCloseTabId);
                    setPendingCloseTabId(null);
                  }}
                >
                  Close
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

        </div>
      </TooltipProvider>
    </ThemeProvider>
    </MotionConfig>
  );

  if (aiEnabled && hasComposer) {
    return <AiComposerProvider>{shell}</AiComposerProvider>;
  }
  return shell;
}
