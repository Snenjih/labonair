import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
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
import { FileExplorer } from "@/modules/explorer";
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
import { SftpPane } from "@/modules/sftp";
import { bootstrapTransferListeners } from "@/modules/sftp/store/transferStore";
import {
  useTabs,
  useWorkspaceCwd,
  type SftpTab,
  type WorkspaceTab,
} from "@/modules/tabs";
import { WorkspacePane, type TerminalPaneHandle, type WorkspacePaneHandle } from "@/modules/terminal";
import { ThemeProvider } from "@/modules/theme";
import { CommandPalette, useCommandStore, type RegistryCallbacks } from "@/modules/command-palette";
import { useThemeEngine } from "@/lib/useThemeEngine";
import { captureAndSave, clearSnapshot, restoreIfEnabled } from "@/modules/session";
import { invoke } from "@tauri-apps/api/core";
import { homeDir } from "@tauri-apps/api/path";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PanelImperativeHandle } from "react-resizable-panels";

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
  const {
    tabs,
    activeId,
    setActiveId,
    newTab,
    openFileTab,
    newPreviewTab,
    openAiDiffTab,
    setAiDiffStatus,
    closeTab,
    updateTab,
    selectByIndex,
    openHomeTab,
    newSshTab,
    newQuickSshTab,
    newSftpTab,
    updateSftpPaths,
    openRemoteEditorTab,
    openUntitledTab,
    setActivePaneId,
    updatePaneSessionCwd,
    splitPane,
    closePane,
    openDefaultTab,
  } = useTabs();

  const workspacePaneRefs = useRef<Map<number, WorkspacePaneHandle>>(new Map());
  // Keyed by session_id (pane UUID) for workspace tabs
  const terminalRefs = useRef<Map<string, TerminalPaneHandle>>(new Map());
  const editorRefs = useRef<Map<number, EditorPaneHandle>>(new Map());
  const previewRefs = useRef<Map<number, PreviewPaneHandle>>(new Map());
  const detectedUrls = useRef<Map<string, string>>(new Map());
  const [activeDetectedUrl, setActiveDetectedUrl] = useState<string | null>(
    null,
  );
  const [activeEditorHandle, setActiveEditorHandle] =
    useState<EditorPaneHandle | null>(null);
  const sidebarRef = useRef<PanelImperativeHandle | null>(null);
  const [activePanel, setActivePanel] = useState<SidebarPanel>("explorer");

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
      // Same panel clicked → toggle sidebar open/close
      if (p.getSize().asPercentage <= 0) p.expand();
      else p.collapse();
    } else {
      // Different panel → switch panel and make sure sidebar is open
      setActivePanel(panel);
      if (p.getSize().asPercentage <= 0) p.expand();
    }
  }, [activePanel]);

  const [home, setHome] = useState<string | null>(null);
  useEffect(() => {
    homeDir()
      .then(setHome)
      .catch(() => setHome(null));
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
  const terminalShowPaneFooter = usePreferencesStore((s) => s.terminalShowPaneFooter);
  const aiEnabled = usePreferencesStore((s) => s.aiEnabled);
  const sessionRestore = usePreferencesStore((s) => s.sessionRestore);

  const [sessionRestored, setSessionRestored] = useState(false);
  useEffect(() => {
    void initPrefs();
  }, [initPrefs]);

  const initKeybinds = useKeybindsStore((s) => s.init);
  useEffect(() => {
    void initKeybinds();
  }, [initKeybinds]);
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

  // Show the main window once core stores are ready to avoid a white-flash on startup.
  // tauri.conf.json starts the window hidden; this reveals it after hydration.
  // sessionRestored gates this so restore completes before the window appears.
  useEffect(() => {
    if (!prefsHydrated || !keysLoaded || !sessionRestored) return;
    void invoke("show_main_window");
  }, [prefsHydrated, keysLoaded, sessionRestored]);

  useEffect(() => {
    void bootstrapTransferListeners();
  }, []);

  // ── Session restore ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!prefsHydrated) return;
    if (!sessionRestore) {
      setSessionRestored(true);
      return;
    }
    let alive = true;
    void restoreIfEnabled({
      tabs,
      setActiveId,
      newTab,
      newSshTab,
      newQuickSshTab,
      openFileTab,
      newPreviewTab,
      openHomeTab,
      newSftpTab,
      splitPane,
      setActivePaneId,
    }).then((result) => {
      if (!alive) return;
      if (!result || result.restoredCount === 0) {
        openDefaultTab();
      }
      setSessionRestored(true);
    });
    return () => { alive = false; };
  // Only run once on startup — intentionally omit tabs/callbacks from deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefsHydrated, sessionRestore]);

  // Clear snapshot when session restore is toggled off
  useEffect(() => {
    if (prefsHydrated && !sessionRestore) {
      void clearSnapshot();
    }
  }, [prefsHydrated, sessionRestore]);

  // Debounced save on tab state change (3 s after last change) + periodic fallback (30 s)
  useEffect(() => {
    if (!sessionRestore || !prefsHydrated) return;
    const debounce = setTimeout(() => {
      void captureAndSave(tabs, activeId);
    }, 3_000);
    const periodic = setInterval(() => {
      void captureAndSave(tabs, activeId);
    }, 30_000);
    return () => {
      clearTimeout(debounce);
      clearInterval(periodic);
    };
  }, [sessionRestore, prefsHydrated, tabs, activeId]);

  // Keep a ref to latest tabs/activeId for the close handler (avoids re-registering)
  const sessionSaveRef = useRef<{ tabs: typeof tabs; activeId: number }>({ tabs, activeId });
  useEffect(() => {
    sessionSaveRef.current = { tabs, activeId };
  }, [tabs, activeId]);

  // Save on clean app close (registered once, reads latest state via ref)
  useEffect(() => {
    if (!sessionRestore) return;
    let cleanup: (() => void) | undefined;
    void getCurrentWindow().onCloseRequested(async (event) => {
      event.preventDefault();
      try {
        const { tabs: t, activeId: aid } = sessionSaveRef.current;
        await captureAndSave(t, aid);
      } finally {
        await invoke("quit_app");
      }
    }).then((unlisten) => {
      cleanup = unlisten;
    });
    return () => cleanup?.();
  }, [sessionRestore]);

  const activeTab = tabs.find((t) => t.id === activeId);
  const isWorkspaceTab = activeTab?.kind === "workspace";
  const isEditorTab = activeTab?.kind === "editor";
  const isPreviewTab = activeTab?.kind === "preview";
  const isAiDiffTab = activeTab?.kind === "ai-diff";
  const isHomeTab = activeTab?.kind === "home";

  // Active pane session id (only for workspace tabs)
  const activePaneId =
    activeTab?.kind === "workspace" ? activeTab.activePaneId : null;

  const appliedDiffsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const t of tabs) {
      if (t.kind !== "ai-diff") continue;
      if (t.status !== "approved") continue;
      if (appliedDiffsRef.current.has(t.approvalId)) continue;
      appliedDiffsRef.current.add(t.approvalId);
      for (const e of tabs) {
        if (e.kind !== "editor") continue;
        if (e.path !== t.path) continue;
        editorRefs.current.get(e.id)?.reload();
      }
    }
  }, [tabs]);

  const { explorerRoot, inheritedCwdForNewTab } = useWorkspaceCwd(
    activeTab,
    tabs,
    home,
  );

  useEffect(() => {
    setActiveEditorHandle(editorRefs.current.get(activeId) ?? null);
    const url = activePaneId ? (detectedUrls.current.get(activePaneId) ?? null) : null;
    setActiveDetectedUrl(url);
  }, [activeId, activePaneId]);

  const handleDetectedLocalUrl = useCallback(
    (sessionId: string, url: string) => {
      detectedUrls.current.set(sessionId, url);
      if (sessionId === activePaneId) setActiveDetectedUrl(url);
    },
    [activePaneId],
  );

  const detectedPreviewUrl = useMemo(() => {
    if (!isWorkspaceTab || !activeDetectedUrl) return null;
    const alreadyOpen = tabs.some(
      (t) => t.kind === "preview" && sameOrigin(t.url, activeDetectedUrl),
    );
    return alreadyOpen ? null : activeDetectedUrl;
  }, [isWorkspaceTab, activeDetectedUrl, tabs]);

  const disposeTab = useCallback(
    (id: number) => {
      // Clean up session refs for workspace tabs
      const tab = tabs.find((t) => t.id === id);
      if (tab?.kind === "workspace") {
        for (const sessionId of Object.keys(tab.sessions)) {
          terminalRefs.current.delete(sessionId);
          detectedUrls.current.delete(sessionId);
        }
        workspacePaneRefs.current.delete(id);
      }
      editorRefs.current.delete(id);
      previewRefs.current.delete(id);
      closeTab(id);
    },
    [closeTab, tabs],
  );

  const handleClose = useCallback(
    (id: number) => {
      const t = tabs.find((x) => x.id === id);

      // For workspace tabs: always close the entire tab from the tab bar.
      // Individual pane X buttons call closePane directly via onClosePane.
      if (t?.kind === "workspace") {
        disposeTab(id);
        return;
      }

      if (t?.kind === "editor" && t.isUntitled) {
        const choice = window.confirm(
          `"${t.title}" has not been saved. Save before closing?`,
        );
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
      if (t?.kind === "editor" && t.dirty) {
        const ok = window.confirm(
          `"${t.title}" has unsaved changes. Close anyway?`,
        );
        if (!ok) return;
      }
      disposeTab(id);
    },
    [tabs, disposeTab, closePane],
  );

  const handleCloseOthers = useCallback(
    (keepId: number) => {
      tabs.filter((t) => t.id !== keepId).forEach((t) => handleClose(t.id));
      setActiveId(keepId);
    },
    [tabs, handleClose, setActiveId],
  );

  const handleCloseAll = useCallback(() => {
    tabs.forEach((t) => handleClose(t.id));
  }, [tabs, handleClose]);

  const cycleTab = useCallback(
    (delta: 1 | -1) => {
      if (tabs.length < 2) return;
      const idx = tabs.findIndex((t) => t.id === activeId);
      const nextIdx = (idx + delta + tabs.length) % tabs.length;
      setActiveId(tabs[nextIdx].id);
    },
    [tabs, activeId, setActiveId],
  );

  const captureActiveSelection = useCallback((): string | null => {
    const t = tabs.find((x) => x.id === activeId);
    if (!t) return null;
    if (t.kind === "workspace" && t.activePaneId) {
      return terminalRefs.current.get(t.activePaneId)?.getSelection() ?? null;
    }
    if (t.kind === "editor") {
      return editorRefs.current.get(activeId)?.getSelection() ?? null;
    }
    return null;
  }, [tabs, activeId]);

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

  const handleAttachFileToAgent = useCallback(
    (path: string) => {
      if (!hasComposer) {
        void openSettingsWindow("models");
        return;
      }
      window.dispatchEvent(
        new CustomEvent<string>("nexum:ai-attach-file", { detail: path }),
      );
      openPanel();
      focusInput(null);
    },
    [hasComposer, openPanel, focusInput],
  );

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
    const source: "terminal" | "editor" =
      activeTab?.kind === "editor" ? "editor" : "terminal";
    attachSelection(selection, source);
  }, [
    hasComposer,
    captureActiveSelection,
    focusInput,
    attachSelection,
    activeTab,
  ]);

  const [askPopup, setAskPopup] = useState<{ x: number; y: number } | null>(
    null,
  );

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

    const onDown = (e: MouseEvent) => {
      if (isInsideAi(e.target)) return;
      setAskPopup(null);
    };
    const onUp = (e: MouseEvent) => {
      if (isInsideAi(e.target)) return;
      setTimeout(() => {
        const text = captureActiveSelection();
        if (text && text.trim().length > 0) {
          setAskPopup({ x: e.clientX, y: e.clientY });
        } else {
          setAskPopup(null);
        }
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
    newTab(inheritedCwdForNewTab());
  }, [newTab, inheritedCwdForNewTab]);

  const onOpenHostManager = useCallback(() => {
    openHomeTab();
  }, [openHomeTab]);

  const sendCd = useCallback(
    (path: string) => {
      if (!activePaneId) return;
      const term = terminalRefs.current.get(activePaneId);
      if (!term) return;
      const quoted = path.includes(" ")
        ? `'${path.replace(/'/g, `'\\''`)}'`
        : path;
      term.write(`cd ${quoted}\n`);
      term.focus();
    },
    [activePaneId],
  );

  const cdInNewTab = useCallback(
    (path: string) => {
      const id = newTab(path);
      setTimeout(() => {
        // The new tab will have a single pane; find it from the tab.
        const newTabData = tabs.find((t) => t.id === id);
        if (!newTabData || newTabData.kind !== "workspace") return;
        const paneId = newTabData.activePaneId;
        const t = terminalRefs.current.get(paneId);
        if (!t) return;
        const quoted = path.includes(" ")
          ? `'${path.replace(/'/g, `'\\''`)}'`
          : path;
        t.write(`cd ${quoted}\n`);
        t.focus();
      }, 80);
    },
    [newTab, tabs],
  );

  const handleOpenFile = useCallback(
    (path: string) => {
      openFileTab(path);
    },
    [openFileTab],
  );

  const handlePathRenamed = useCallback(
    (from: string, to: string) => {
      for (const t of tabs) {
        if (t.kind !== "editor") continue;
        if (t.path === from) {
          const i = to.lastIndexOf("/");
          updateTab(t.id, { path: to, title: i === -1 ? to : to.slice(i + 1) });
        } else if (t.path.startsWith(`${from}/`)) {
          const suffix = t.path.slice(from.length);
          const newPath = `${to}${suffix}`;
          const i = newPath.lastIndexOf("/");
          updateTab(t.id, {
            path: newPath,
            title: i === -1 ? newPath : newPath.slice(i + 1),
          });
        }
      }
    },
    [tabs, updateTab],
  );

  const handlePathDeleted = useCallback(
    (path: string) => {
      for (const t of tabs) {
        if (t.kind !== "editor") continue;
        if (t.path === path || t.path.startsWith(`${path}/`)) {
          disposeTab(t.id);
        }
      }
    },
    [tabs, disposeTab],
  );

  const activeFilePath =
    activeTab?.kind === "editor"
      ? activeTab.isUntitled
        ? activeTab.path.split("/").pop() ?? "untitled.txt" // show just filename, not the system temp path
        : activeTab.path
      : null;

  const openPreviewTab = useCallback(
    (url: string) => {
      const id = newPreviewTab(url);
      if (!url) {
        setTimeout(() => previewRefs.current.get(id)?.focusAddressBar(), 0);
      }
      return id;
    },
    [newPreviewTab],
  );

  const restoreFocus = useCallback(() => {
    if (activeTab?.kind === "workspace" && activePaneId) {
      terminalRefs.current.get(activePaneId)?.focus();
    }
  }, [activeTab, activePaneId]);

  const [snippetLogDrawerOpen, setSnippetLogDrawerOpen] = useState(false);
  const workspaceTabs = tabs.filter((t): t is WorkspaceTab => t.kind === "workspace");
  const { execSnippet } = useSnippetExec({
    tabs: workspaceTabs,
    activeTerminalRef: () =>
      activePaneId ? (terminalRefs.current.get(activePaneId) ?? null) : null,
    onNewLocalTab: (cwd, command) => newTab(cwd ?? inheritedCwdForNewTab(), command),
    onNewSshTab: (hostId, title, cwd, command) => newSshTab(hostId, title, cwd, command),
    onOpenLogDrawer: () => setSnippetLogDrawerOpen(true),
  });

  const paletteCallbacks = useMemo<RegistryCallbacks>(
    () => ({
      openSettings: (section) => void openSettingsWindow(section as SettingsTab | undefined),
      openShortcuts: () => setShortcutsOpen(true),
      newSshTab,
      newSftpTab,
      newTab: openNewTab,
      openUntitledTab: () => void openUntitledTab(),
      openHomeTab,
      splitRight: () => {
        if (activeTab?.kind === "workspace") splitPane(activeId, "horizontal");
      },
      splitDown: () => {
        if (activeTab?.kind === "workspace") splitPane(activeId, "vertical");
      },
      closePane: () => {
        if (activeTab?.kind === "workspace")
          closePane(activeId, activeTab.activePaneId);
      },
      closeCurrentTab: () => handleClose(activeId),
      toggleAi: togglePanelAndFocus,
      askSelection: askFromSelection,
      // Tab switcher
      tabs: tabs.map((t) => ({ id: t.id, kind: t.kind, title: t.title })),
      activeTabId: activeId,
      switchTab: setActiveId,
      // Snippets
      injectIntoTerminal: (text) => {
        if (!activePaneId) return;
        terminalRefs.current.get(activePaneId)?.write(text);
        terminalRefs.current.get(activePaneId)?.focus();
      },
      runSnippet: (snippet, mode) => void execSnippet(snippet, mode),
      openSnippetsPanel: () => {
        setActivePanel("snippets");
        sidebarRef.current?.expand();
      },
      // AI sessions
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
    }),
    [
      activeId,
      activeTab,
      activePaneId,
      tabs,
      newSshTab,
      newSftpTab,
      openNewTab,
      openUntitledTab,
      openHomeTab,
      splitPane,
      closePane,
      handleClose,
      setActiveId,
      togglePanelAndFocus,
      askFromSelection,
      execSnippet,
      setActivePanel,
    ],
  );

  const activeContext = useMemo(() => {
    if (!activeTab) return null;
    if (activeTab.kind === "workspace") return "terminal" as const;
    if (activeTab.kind === "editor") return "editor" as const;
    if (activeTab.kind === "sftp") return "sftp" as const;
    if (activeTab.kind === "home") return "home" as const;
    return null;
  }, [activeTab]);

  const shortcutHandlers = useMemo<ShortcutHandlers>(
    () => ({
      "command.palette": () => toggleCommandPalette(),
      "tab.new": openNewTab,
      "tab.newPreview": () => openPreviewTab(""),
      "tab.newEditor": () => void openUntitledTab(),
      "tab.close": () => handleClose(activeId),
      "tab.next": () => cycleTab(1),
      "tab.prev": () => cycleTab(-1),
      "tab.selectByIndex": (e) => selectByIndex(parseInt(e.key, 10) - 1),
      "search.focus": () => {
        if (isWorkspaceTab) workspacePaneRefs.current.get(activeId)?.openFind();
        else if (isEditorTab) activeEditorHandle?.openFind();
      },
      "ai.toggle": togglePanelAndFocus,
      "ai.askSelection": askFromSelection,
      "shortcuts.open": () => setShortcutsOpen((v) => !v),
      "sidebar.toggle": toggleSidebar,
      "pane.splitRight": () => {
        if (activeTab?.kind === "workspace") splitPane(activeId, "horizontal");
      },
      "pane.splitDown": () => {
        if (activeTab?.kind === "workspace") splitPane(activeId, "vertical");
      },
      "pane.close": () => {
        if (activeTab?.kind === "workspace") closePane(activeId, activeTab.activePaneId);
      },
      "view.zoomIn": () => {
        const kind = activeTab?.kind;
        if (kind === "workspace") {
          const cur = usePreferencesStore.getState().terminalFontSize;
          void setTerminalFontSize(Math.min(cur + 1, 32));
        } else if (kind === "editor") {
          const cur = usePreferencesStore.getState().editorFontSize;
          void setEditorFontSize(Math.min(cur + 1, 32));
        } else if (kind === "sftp") {
          const cur = usePreferencesStore.getState().sftpFontSize;
          void setSftpFontSize(Math.min(cur + 1, 20));
        }
      },
      "view.zoomOut": () => {
        const kind = activeTab?.kind;
        if (kind === "workspace") {
          const cur = usePreferencesStore.getState().terminalFontSize;
          void setTerminalFontSize(Math.max(cur - 1, 8));
        } else if (kind === "editor") {
          const cur = usePreferencesStore.getState().editorFontSize;
          void setEditorFontSize(Math.max(cur - 1, 8));
        } else if (kind === "sftp") {
          const cur = usePreferencesStore.getState().sftpFontSize;
          void setSftpFontSize(Math.max(cur - 1, 10));
        }
      },
      "view.zoomReset": () => {
        const kind = activeTab?.kind;
        if (kind === "workspace") {
          void setTerminalFontSize(DEFAULT_PREFERENCES.terminalFontSize);
        } else if (kind === "editor") {
          void setEditorFontSize(DEFAULT_PREFERENCES.editorFontSize);
        } else if (kind === "sftp") {
          void setSftpFontSize(DEFAULT_PREFERENCES.sftpFontSize);
        }
      },
    }),
    [
      activeId,
      activeTab,
      cycleTab,
      handleClose,
      openNewTab,
      openPreviewTab,
      selectByIndex,
      togglePanelAndFocus,
      askFromSelection,
      toggleSidebar,
      splitPane,
      toggleCommandPalette,
    ],
  );

  useGlobalShortcuts(shortcutHandlers);

  // Native menu bar event bridge — Rust emits "menu:<id>" for every menu click
  // that isn't handled directly in the backend (settings window, quit, etc.).
  useEffect(() => {
    const cleanups: Array<() => void> = [];
    const on = (event: string, handler: () => void) => {
      listen(event, handler).then((unlisten) => cleanups.push(unlisten));
    };

    on("menu:new_terminal_tab",   () => openNewTab());
    on("menu:new_ssh_tab",        () => openHomeTab());
    on("menu:new_sftp_tab",       () => openHomeTab());
    on("menu:new_preview_tab",    () => openPreviewTab(""));
    on("menu:new_editor_tab",     () => void openUntitledTab());
    on("menu:close_tab",          () => handleClose(activeId));
    on("menu:close_pane",         () => {
      if (activeTab?.kind === "workspace") closePane(activeId, activeTab.activePaneId);
    });
    on("menu:toggle_sidebar",     () => toggleSidebar());
    on("menu:toggle_ai",          () => togglePanelAndFocus());
    on("menu:toggle_ai_2",        () => togglePanelAndFocus());
    on("menu:zoom_in", () => {
      const kind = activeTab?.kind;
      if (kind === "workspace") void setTerminalFontSize(Math.min(usePreferencesStore.getState().terminalFontSize + 1, 32));
      else if (kind === "editor") void setEditorFontSize(Math.min(usePreferencesStore.getState().editorFontSize + 1, 32));
      else if (kind === "sftp")   void setSftpFontSize(Math.min(usePreferencesStore.getState().sftpFontSize + 1, 20));
    });
    on("menu:zoom_out", () => {
      const kind = activeTab?.kind;
      if (kind === "workspace") void setTerminalFontSize(Math.max(usePreferencesStore.getState().terminalFontSize - 1, 8));
      else if (kind === "editor") void setEditorFontSize(Math.max(usePreferencesStore.getState().editorFontSize - 1, 8));
      else if (kind === "sftp")   void setSftpFontSize(Math.max(usePreferencesStore.getState().sftpFontSize - 1, 10));
    });
    on("menu:zoom_reset", () => {
      const kind = activeTab?.kind;
      if (kind === "workspace") void setTerminalFontSize(DEFAULT_PREFERENCES.terminalFontSize);
      else if (kind === "editor") void setEditorFontSize(DEFAULT_PREFERENCES.editorFontSize);
      else if (kind === "sftp")   void setSftpFontSize(DEFAULT_PREFERENCES.sftpFontSize);
    });
    on("menu:split_pane_right",   () => {
      if (activeTab?.kind === "workspace") splitPane(activeId, "horizontal");
    });
    on("menu:split_pane_down",    () => {
      if (activeTab?.kind === "workspace") splitPane(activeId, "vertical");
    });
    on("menu:find", () => {
      if (isWorkspaceTab) workspacePaneRefs.current.get(activeId)?.openFind();
      else if (isEditorTab) activeEditorHandle?.openFind();
    });
    on("menu:open_shortcuts",     () => setShortcutsOpen(true));
    on("menu:next_tab",           () => cycleTab(1));
    on("menu:prev_tab",           () => cycleTab(-1));
    on("menu:open_host_manager",  () => openHomeTab());
    on("menu:new_ssh_connection", () => openHomeTab());
    on("menu:new_quick_ssh",      () => openHomeTab());
    on("menu:ask_selection",      () => askFromSelection());
    on("menu:new_ai_session",     () => {
      useChatStore.getState().newSession();
      togglePanelAndFocus();
    });
    on("menu:clear_chat",         () => {
      const { activeSessionId, deleteSession, newSession } = useChatStore.getState();
      if (activeSessionId) deleteSession(activeSessionId);
      newSession();
    });

    return () => cleanups.forEach((fn) => fn());
  }, [
    activeId,
    activeTab,
    openNewTab,
    openHomeTab,
    openPreviewTab,
    openUntitledTab,
    handleClose,
    closePane,
    toggleSidebar,
    togglePanelAndFocus,
    splitPane,
    cycleTab,
    askFromSelection,
    isWorkspaceTab,
    isEditorTab,
    activeId,
    activeEditorHandle,
  ]);

  const registerEditorHandle = useCallback(
    (id: number, h: EditorPaneHandle | null) => {
      if (h) editorRefs.current.set(id, h);
      else editorRefs.current.delete(id);
      if (id === activeId) setActiveEditorHandle(h);
    },
    [activeId],
  );

  const registerPreviewHandle = useCallback(
    (id: number, h: PreviewPaneHandle | null) => {
      if (h) previewRefs.current.set(id, h);
      else previewRefs.current.delete(id);
    },
    [],
  );

  const handlePreviewUrl = useCallback(
    (id: number, url: string) => updateTab(id, { url }),
    [updateTab],
  );

  const handleEditorDirty = useCallback(
    (id: number, dirty: boolean) => updateTab(id, { dirty }),
    [updateTab],
  );

  const handleEditorSaveAs = useCallback(
    (id: number, newPath: string) => {
      const name = newPath.split("/").pop() ?? newPath;
      updateTab(id, { path: newPath, title: name });
    },
    [updateTab],
  );

  const activeCwd = useMemo<string | null>(() => {
    if (activeTab?.kind !== "workspace") return null;
    const session = activeTab.sessions[activeTab.activePaneId];
    if (session?.kind === "local") return session.cwd ?? null;
    return null;
  }, [activeTab]);

  useEffect(() => {
    const findCwd = () => {
      const active = tabs.find((x) => x.id === activeId);
      if (active?.kind === "workspace") {
        const session = active.sessions[active.activePaneId];
        if (session?.kind === "local" && session.cwd) return session.cwd;
      }
      for (let i = tabs.length - 1; i >= 0; i--) {
        const t = tabs[i];
        if (t.kind !== "workspace") continue;
        for (const s of Object.values(t.sessions)) {
          if (s.kind === "local" && s.cwd) return s.cwd;
        }
      }
      return explorerRoot ?? home ?? null;
    };

    setLive({
      getCwd: findCwd,
      getTerminalContext: () => {
        const t = tabs.find((x) => x.id === activeId);
        if (t?.kind !== "workspace") return null;
        return terminalRefs.current.get(t.activePaneId)?.getBuffer(300) ?? null;
      },
      injectIntoActivePty: (text) => {
        const t = tabs.find((x) => x.id === activeId);
        if (t?.kind !== "workspace") return false;
        const term = terminalRefs.current.get(t.activePaneId);
        if (!term) return false;
        term.write(text);
        term.focus();
        return true;
      },
      getWorkspaceRoot: () => explorerRoot ?? home ?? null,
      getActiveFile: () => {
        const t = tabs.find((x) => x.id === activeId);
        return t?.kind === "editor" ? t.path : null;
      },
      openPreview: (url: string) => {
        openPreviewTab(url);
        return true;
      },
      getActiveTabKind: () => {
        const t = tabs.find((x) => x.id === activeId);
        return t?.kind ?? null;
      },
      getActiveSshTabId: () => {
        const t = tabs.find((x) => x.id === activeId);
        if (t?.kind !== "workspace") return null;
        const session = t.sessions[t.activePaneId];
        return session?.kind === "ssh" ? t.activePaneId : null;
      },
    });
  }, [setLive, activeId, tabs, explorerRoot, home, openPreviewTab]);

  const handleWorkspaceCwd = useCallback(
    (tabId: number, sessionId: string, cwd: string) => {
      updatePaneSessionCwd(tabId, sessionId, cwd);
    },
    [updatePaneSessionCwd],
  );

  const handleSnippetRun = useCallback(
    (snippet: CommandSnippet, mode?: SnippetExecMode) => {
      void execSnippet(snippet, mode);
    },
    [execSnippet],
  );

  const shell = (
    <ThemeProvider>
      <TooltipProvider>
        <div className="relative flex h-screen flex-col overflow-hidden bg-background text-foreground">
          <Header
            tabs={tabs}
            activeId={activeId}
            onSelect={setActiveId}
            onNew={openNewTab}
            onNewPreview={() => openPreviewTab("")}
            onNewEditor={() => void openUntitledTab()}
            onNewSsh={newSshTab}
            onNewSftp={newSftpTab}
            onClose={handleClose}
            onCloseOthers={handleCloseOthers}
            onCloseAll={handleCloseAll}
            onToggleSidebar={toggleSidebar}
            onOpenShortcuts={() => setShortcutsOpen(true)}
            onOpenSettings={() => void openSettingsWindow()}
            onOpenHostManager={onOpenHostManager}
            onOpenThemes={() => useCommandStore.getState().openToPage("themes")}
          />

          <main className="flex min-h-0 flex-1 flex-col">
            <ResizablePanelGroup
              orientation="horizontal"
              className="min-h-0 flex-1"
            >
              {sidebarPosition !== "right" && (
                <>
                  <ResizablePanel
                    id="sidebar"
                    panelRef={sidebarRef}
                    defaultSize="225px"
                    minSize="130px"
                    maxSize="450px"
                    collapsible
                    collapsedSize={0}
                  >
                    <div className="h-full border-r border-border/60 bg-card">
                      {activePanel === "snippets" ? (
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
                  <ResizableHandle withHandle />
                </>
              )}
              <ResizablePanel id="workspace" defaultSize="78%" minSize="30%">
                <div className="flex h-full min-h-0 flex-col">
                  <div className="relative min-h-0 flex-1">
                    {/* Workspace (terminal) tabs — keep all mounted, hide inactive */}
                    {tabs.filter((t) => t.kind === "workspace").map((t) => {
                      const wt = t as WorkspaceTab;
                      const isActive = t.id === activeId;
                      return (
                        <div
                          key={t.id}
                          className={cn(
                            "absolute inset-0 px-3 pt-2",
                            terminalShowPaneFooter && "pb-2",
                            !isActive && "invisible pointer-events-none",
                          )}
                          aria-hidden={!isActive}
                        >
                          <WorkspacePane
                            ref={(h) => {
                              if (h) workspacePaneRefs.current.set(t.id, h);
                              else workspacePaneRefs.current.delete(t.id);
                            }}
                            tab={wt}
                            tabVisible={isActive}
                            onSetActivePane={(paneId) =>
                              setActivePaneId(t.id, paneId)
                            }
                            onRegisterHandle={(sessionId, handle) => {
                              if (handle)
                                terminalRefs.current.set(sessionId, handle);
                              else terminalRefs.current.delete(sessionId);
                            }}
                            onCwd={(sessionId, cwd) =>
                              handleWorkspaceCwd(t.id, sessionId, cwd)
                            }
                            onClosePane={(paneId) => closePane(t.id, paneId)}
                            onDetectedLocalUrl={(sessionId, url) =>
                              handleDetectedLocalUrl(sessionId, url)
                            }
                          />
                        </div>
                      );
                    })}
                    <div
                      className={cn(
                        "absolute inset-0 px-3 pt-2 pb-2",
                        !isEditorTab && "invisible pointer-events-none",
                      )}
                      aria-hidden={!isEditorTab}
                    >
                      <EditorStack
                        tabs={tabs}
                        activeId={activeId}
                        registerHandle={registerEditorHandle}
                        onDirtyChange={handleEditorDirty}
                        onCloseTab={disposeTab}
                        onSaveAs={handleEditorSaveAs}
                      />
                    </div>
                    <div
                      className={cn(
                        "absolute inset-0 px-3 pt-2 pb-2",
                        !isPreviewTab && "invisible pointer-events-none",
                      )}
                      aria-hidden={!isPreviewTab}
                    >
                      <PreviewStack
                        tabs={tabs}
                        activeId={activeId}
                        registerHandle={registerPreviewHandle}
                        onUrlChange={handlePreviewUrl}
                      />
                    </div>
                    <div
                      className={cn(
                        "absolute inset-0 px-3 pt-2 pb-2",
                        !isAiDiffTab && "invisible pointer-events-none",
                      )}
                      aria-hidden={!isAiDiffTab}
                    >
                      <AiDiffStack
                        tabs={tabs}
                        activeId={activeId}
                        onAccept={(id) => respondToApproval(id, true)}
                        onReject={(id) => respondToApproval(id, false)}
                      />
                    </div>
                    <div
                      className={cn(
                        "absolute inset-0",
                        !isHomeTab && "invisible pointer-events-none",
                      )}
                      aria-hidden={!isHomeTab}
                    >
                      <HomeDashboard
                        newSshTab={newSshTab}
                        newQuickSshTab={newQuickSshTab}
                        newSftpTab={newSftpTab}
                        tabs={tabs}
                      />
                    </div>
                    {tabs.filter((t) => t.kind === "sftp").map((t) => (
                      <div
                        key={t.id}
                        className={cn(
                          "absolute inset-0",
                          activeId !== t.id && "invisible pointer-events-none",
                        )}
                        aria-hidden={activeId !== t.id}
                      >
                        <SftpPane tab={t as SftpTab} onOpenSshTerminal={newSshTab} onOpenRemoteEditor={openRemoteEditorTab} onPathsChange={updateSftpPaths} />
                      </div>
                    ))}
                  </div>

                  {keysLoaded ? (
                    <motion.div
                      data-ai-input-bar
                      initial={false}
                      animate={{
                        height: panelOpen ? "auto" : 0,
                        opacity: panelOpen ? 1 : 0,
                      }}
                      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                      className="overflow-hidden"
                      aria-hidden={!panelOpen}
                    >
                      {aiEnabled && (hasComposer ? (
                        <AiInputBar />
                      ) : (
                        <AiInputBarConnect
                          onAdd={() => void openSettingsWindow("ai")}
                        />
                      ))}
                    </motion.div>
                  ) : null}
                </div>
              </ResizablePanel>
              {sidebarPosition === "right" && (
                <>
                  <ResizableHandle withHandle />
                  <ResizablePanel
                    id="sidebar"
                    panelRef={sidebarRef}
                    defaultSize="225px"
                    minSize="130px"
                    maxSize="450px"
                    collapsible
                    collapsedSize={0}
                  >
                    <div className="h-full border-l border-border/60 bg-card">
                      {activePanel === "snippets" ? (
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
                </>
              )}
            </ResizablePanelGroup>
          </main>

          <SnippetLogDrawer
            open={snippetLogDrawerOpen}
            onClose={() => setSnippetLogDrawerOpen(false)}
          />

          <StatusBar
            cwd={activeCwd}
            filePath={activeFilePath}
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
              if (panel === "hosts") {
                openHomeTab();
                return;
              }
              handlePanelToggle(panel);
            }}
          />

          {aiEnabled && hasComposer ? (
            <AgentRunBridge
              openAiDiffTab={openAiDiffTab}
              setAiDiffStatus={setAiDiffStatus}
            />
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

          <ShortcutsDialog
            open={shortcutsOpen}
            onOpenChange={setShortcutsOpen}
          />

          <CommandPalette
            callbacks={paletteCallbacks}
            activeTabKind={activeTab?.kind}
            activeContext={activeContext}
            restoreFocus={restoreFocus}
          />

        </div>
      </TooltipProvider>
    </ThemeProvider>
  );

  if (aiEnabled && hasComposer) {
    return <AiComposerProvider>{shell}</AiComposerProvider>;
  }
  return shell;
}
