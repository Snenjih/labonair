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
import { useSnippetsStore } from "@/modules/ai/store/snippetsStore";
import {
  AiDiffStack,
  EditorStack,
  type EditorPaneHandle,
} from "@/modules/editor";
import { FileExplorer } from "@/modules/explorer";
import { HomeDashboard } from "@/modules/hosts";
import {
  Header,
  type SearchInlineHandle,
  type SearchTarget,
} from "@/modules/header";
import { PreviewStack, type PreviewPaneHandle } from "@/modules/preview";
import { openSettingsWindow } from "@/modules/settings/openSettingsWindow";
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
  type ShortcutHandlers,
} from "@/modules/shortcuts";
import { StatusBar } from "@/modules/statusbar";
import { SftpPane } from "@/modules/sftp";
import { bootstrapTransferListeners } from "@/modules/sftp/store/transferStore";
import {
  useTabs,
  useWorkspaceCwd,
  type SftpTab,
  type WorkspaceTab,
} from "@/modules/tabs";
import { WorkspacePane, type TerminalPaneHandle } from "@/modules/terminal";
import { ThemeProvider } from "@/modules/theme";
import { useThemeEngine } from "@/lib/useThemeEngine";
import { homeDir } from "@tauri-apps/api/path";
import type { SearchAddon } from "@xterm/addon-search";
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
    openUntitledTab,
    setActivePaneId,
    updatePaneSessionCwd,
    splitPane,
    closePane,
  } = useTabs();

  const searchAddons = useRef<Map<string, SearchAddon>>(new Map());
  const [activeSearchAddon, setActiveSearchAddon] =
    useState<SearchAddon | null>(null);
  const searchInlineRef = useRef<SearchInlineHandle | null>(null);
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
  const toggleSidebar = useCallback(() => {
    const p = sidebarRef.current;
    if (!p) return;
    if (p.getSize().asPercentage <= 0) p.expand();
    else p.collapse();
  }, []);

  const [home, setHome] = useState<string | null>(null);
  useEffect(() => {
    homeDir()
      .then(setHome)
      .catch(() => setHome(null));
  }, []);

  const [shortcutsOpen, setShortcutsOpen] = useState(false);
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
  useEffect(() => {
    void initPrefs();
  }, [initPrefs]);
  useThemeEngine();
  useEffect(() => {
    if (!prefsHydrated) return;
    setSelectedModelId(prefDefaultModel);
  }, [prefsHydrated, prefDefaultModel, setSelectedModelId]);

  const hydrateSessions = useChatStore((s) => s.hydrateSessions);
  useEffect(() => {
    void hydrateSessions();
    void useAgentsStore.getState().hydrate();
    void useSnippetsStore.getState().hydrate();
  }, [hydrateSessions]);

  useEffect(() => {
    void bootstrapTransferListeners();
  }, []);

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
    const currentSearchAddon = activePaneId
      ? (searchAddons.current.get(activePaneId) ?? null)
      : null;
    setActiveSearchAddon(currentSearchAddon);
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

  const handleSearchReady = useCallback(
    (sessionId: string, addon: SearchAddon) => {
      searchAddons.current.set(sessionId, addon);
      if (sessionId === activePaneId) setActiveSearchAddon(addon);
    },
    [activePaneId],
  );

  const disposeTab = useCallback(
    (id: number) => {
      // Clean up session refs for workspace tabs
      const tab = tabs.find((t) => t.id === id);
      if (tab?.kind === "workspace") {
        for (const sessionId of Object.keys(tab.sessions)) {
          terminalRefs.current.delete(sessionId);
          searchAddons.current.delete(sessionId);
          detectedUrls.current.delete(sessionId);
        }
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

  const activeFilePath = activeTab?.kind === "editor" ? activeTab.path : null;

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

  const shortcutHandlers = useMemo<ShortcutHandlers>(
    () => ({
      "tab.new": openNewTab,
      "tab.newPreview": () => openPreviewTab(""),
      "tab.newEditor": () => void openUntitledTab(),
      "tab.close": () => handleClose(activeId),
      "tab.next": () => cycleTab(1),
      "tab.prev": () => cycleTab(-1),
      "tab.selectByIndex": (e) => selectByIndex(parseInt(e.key, 10) - 1),
      "search.focus": () => searchInlineRef.current?.focus(),
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
    ],
  );

  useGlobalShortcuts(shortcutHandlers);

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

  const searchTarget = useMemo<SearchTarget>(() => {
    if (isWorkspaceTab && activeSearchAddon)
      return { kind: "terminal", addon: activeSearchAddon };
    if (isEditorTab && activeEditorHandle)
      return { kind: "editor", handle: activeEditorHandle };
    return null;
  }, [isWorkspaceTab, isEditorTab, activeSearchAddon, activeEditorHandle]);

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
            onClose={handleClose}
            onToggleSidebar={toggleSidebar}
            onOpenShortcuts={() => setShortcutsOpen(true)}
            onOpenSettings={() => void openSettingsWindow()}
            onOpenHostManager={onOpenHostManager}
            searchTarget={searchTarget}
            searchRef={searchInlineRef}
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
                      <FileExplorer
                        rootPath={explorerRoot}
                        onOpenFile={handleOpenFile}
                        onPathRenamed={handlePathRenamed}
                        onPathDeleted={handlePathDeleted}
                        onRevealInTerminal={cdInNewTab}
                        onAttachToAgent={handleAttachFileToAgent}
                      />
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
                            tab={wt}
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
                            onSearchReady={(sessionId, addon) =>
                              handleSearchReady(sessionId, addon)
                            }
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
                        <SftpPane tab={t as SftpTab} onOpenSshTerminal={newSshTab} />
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
                      {hasComposer ? (
                        <AiInputBar />
                      ) : (
                        <AiInputBarConnect
                          onAdd={() => void openSettingsWindow("models")}
                        />
                      )}
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
                      <FileExplorer
                        rootPath={explorerRoot}
                        onOpenFile={handleOpenFile}
                        onPathRenamed={handlePathRenamed}
                        onPathDeleted={handlePathDeleted}
                        onRevealInTerminal={cdInNewTab}
                        onAttachToAgent={handleAttachFileToAgent}
                      />
                    </div>
                  </ResizablePanel>
                </>
              )}
            </ResizablePanelGroup>
          </main>

          <StatusBar
            cwd={activeCwd}
            filePath={activeFilePath}
            home={home}
            onCd={sendCd}
            onOpenMini={openMini}
            hasComposer={hasComposer}
            detectedPreviewUrl={detectedPreviewUrl}
            onOpenPreview={() => {
              if (detectedPreviewUrl) openPreviewTab(detectedPreviewUrl);
            }}
          />

          {hasComposer ? (
            <AgentRunBridge
              openAiDiffTab={openAiDiffTab}
              setAiDiffStatus={setAiDiffStatus}
            />
          ) : null}

          <AnimatePresence>
            {miniOpen && hasComposer ? <AiMiniWindow key="ai-mini" /> : null}
            {askPopup ? (
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

        </div>
      </TooltipProvider>
    </ThemeProvider>
  );

  if (hasComposer) {
    return <AiComposerProvider>{shell}</AiComposerProvider>;
  }
  return shell;
}
