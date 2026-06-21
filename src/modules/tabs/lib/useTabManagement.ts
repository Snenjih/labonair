import { useCallback, useEffect, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  useTabsStore,
  selectActiveTabKind,
  selectActivePaneId,
} from "../store/tabsStore";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { PREVIEW_EXTENSIONS } from "@/modules/explorer";
import {
  useSnippetExec,
  type CommandSnippet,
  type SnippetExecMode,
} from "@/modules/snippets";
import type { EditorPaneHandle } from "@/modules/editor";
import type { PreviewPaneHandle } from "@/modules/preview";
import type { WorkspacePaneHandle, TerminalPaneHandle } from "@/modules/terminal";
import type { WorkspaceTab, AiDiffTab } from "../types";
import type React from "react";

export interface UseTabManagementOptions {
  home: string | null;
  inheritedCwdForNewTab: () => string | undefined;
}

export interface TabManagementReturn {
  refs: {
    workspacePaneRefs: React.MutableRefObject<Map<number, WorkspacePaneHandle>>;
    terminalRefs: React.MutableRefObject<Map<string, TerminalPaneHandle>>;
    editorRefs: React.MutableRefObject<Map<number, EditorPaneHandle>>;
    previewRefs: React.MutableRefObject<Map<number, PreviewPaneHandle>>;
  };
  activeEditorHandle: EditorPaneHandle | null;
  activeDetectedUrl: string | null;

  // Pending dialogs
  pendingCloseTabId: number | null;
  setPendingCloseTabId: React.Dispatch<React.SetStateAction<number | null>>;
  pendingSaveTab: { id: number; title: string } | null;
  setPendingSaveTab: React.Dispatch<React.SetStateAction<{ id: number; title: string } | null>>;
  pendingDirtyTab: { id: number; title: string } | null;
  setPendingDirtyTab: React.Dispatch<React.SetStateAction<{ id: number; title: string } | null>>;

  // Snippet drawer
  snippetLogDrawerOpen: boolean;
  setSnippetLogDrawerOpen: React.Dispatch<React.SetStateAction<boolean>>;

  // Actions
  disposeTab: (id: number) => void;
  handleClose: (id: number) => void;
  handleCloseOthers: (keepId: number) => void;
  handleCloseAll: () => void;
  handleDuplicateTab: (id: number) => void;
  handleRenameTab: (id: number, label: string) => void;
  cycleTab: (delta: 1 | -1) => void;
  openNewTab: () => void;
  openPreviewTab: (url: string) => number;
  cdInNewTab: (path: string) => void;
  sendCd: (path: string) => void;
  restoreFocus: () => void;
  onOpenHostManager: () => void;
  handleOpenFile: (path: string) => void;
  handlePathRenamed: (from: string, to: string) => void;
  handlePathDeleted: (path: string) => void;
  registerEditorHandle: (id: number, h: EditorPaneHandle | null) => void;
  registerPreviewHandle: (id: number, h: PreviewPaneHandle | null) => void;
  handlePreviewUrl: (id: number, url: string) => void;
  handleEditorDirty: (id: number, dirty: boolean) => void;
  handleEditorSaveAs: (id: number, newPath: string) => void;
  handleDetectedLocalUrl: (sessionId: string, url: string) => void;
  handleSnippetRun: (snippet: CommandSnippet, mode?: SnippetExecMode) => void;
  execSnippet: ReturnType<typeof useSnippetExec>["execSnippet"];
  captureActiveSelection: () => string | null;
  openGitGraphTab: (repositoryPath: string, initialBranch: string) => number;
}

export function useTabManagement({
  home: _home,
  inheritedCwdForNewTab,
}: UseTabManagementOptions): TabManagementReturn {
  // ── Stable store actions (never change — safe to destructure once) ─────────
  const {
    newTab,
    openHomeTab,
    openFileTab,
    newPreviewTab,
    closeTab,
    updateTab,
    setActiveId,
    newSshTab,
    openGitGraphTab,
  } = useTabsStore.getState();

  // ── Reactive subscriptions ────────────────────────────────────────────────
  const activeId = useTabsStore((s) => s.activeId);
  const activePaneId = useTabsStore(selectActivePaneId);

  const workspaceTabs = useTabsStore(
    useShallow((s) => s.tabs.filter((t): t is WorkspaceTab => t.kind === "workspace")),
  );

  // ── Refs ──────────────────────────────────────────────────────────────────
  const workspacePaneRefs = useRef<Map<number, WorkspacePaneHandle>>(new Map());
  const terminalRefs = useRef<Map<string, TerminalPaneHandle>>(new Map());
  const editorRefs = useRef<Map<number, EditorPaneHandle>>(new Map());
  const previewRefs = useRef<Map<number, PreviewPaneHandle>>(new Map());
  const detectedUrls = useRef<Map<string, string>>(new Map());

  // ── State ─────────────────────────────────────────────────────────────────
  const [activeDetectedUrl, setActiveDetectedUrl] = useState<string | null>(null);
  const [activeEditorHandle, setActiveEditorHandle] = useState<EditorPaneHandle | null>(null);
  const [pendingCloseTabId, setPendingCloseTabId] = useState<number | null>(null);
  const [pendingSaveTab, setPendingSaveTab] = useState<{ id: number; title: string } | null>(null);
  const [pendingDirtyTab, setPendingDirtyTab] = useState<{ id: number; title: string } | null>(null);
  const [snippetLogDrawerOpen, setSnippetLogDrawerOpen] = useState(false);

  // ── Reactive preference (needed as a dep in handleClose) ──────────────────
  const confirmCloseTerminalTab = usePreferencesStore((s) => s.confirmCloseTerminalTab);

  // ── Active editor handle + detected URL sync ──────────────────────────────
  useEffect(() => {
    setActiveEditorHandle(editorRefs.current.get(activeId) ?? null);
    const url = activePaneId ? (detectedUrls.current.get(activePaneId) ?? null) : null;
    setActiveDetectedUrl(url);
  }, [activeId, activePaneId]);

  // ── AI diff subscription ───────────────────────────────────────────────────
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

  // ── Callbacks ─────────────────────────────────────────────────────────────

  const handleDetectedLocalUrl = useCallback((sessionId: string, url: string) => {
    detectedUrls.current.set(sessionId, url);
    if (sessionId === selectActivePaneId(useTabsStore.getState())) {
      setActiveDetectedUrl(url);
    }
  }, []);

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
  }, [closeTab]);

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
      setPendingSaveTab({ id, title: t.title });
      return;
    }
    if (t?.kind === "editor" && (t as { dirty: boolean }).dirty) {
      setPendingDirtyTab({ id, title: t.title });
      return;
    }
    disposeTab(id);
  }, [disposeTab, confirmCloseTerminalTab]);

  const handleCloseOthers = useCallback((keepId: number) => {
    const { tabs } = useTabsStore.getState();
    tabs.filter((t) => t.id !== keepId).forEach((t) => handleClose(t.id));
    setActiveId(keepId);
  }, [handleClose, setActiveId]);

  const handleCloseAll = useCallback(() => {
    const { tabs } = useTabsStore.getState();
    tabs.forEach((t) => handleClose(t.id));
  }, [handleClose]);

  const handleRenameTab = useCallback((id: number, label: string) => {
    useTabsStore.getState().renameTab(id, label);
  }, []);

  const handleDuplicateTab = useCallback((id: number) => {
    const { tabs } = useTabsStore.getState();
    const tab = tabs.find((t) => t.id === id);
    if (!tab) return;
    if (tab.kind === "workspace") {
      const wt = tab as WorkspaceTab;
      const session = wt.sessions[wt.activePaneId] ?? null;
      if (session?.kind === "ssh" && session.hostId) newSshTab(session.hostId, tab.title);
      else newTab(session?.cwd);
    } else if (tab.kind === "editor") {
      openFileTab((tab as { path: string }).path);
    }
  }, [newTab, newSshTab, openFileTab]);

  const cycleTab = useCallback((delta: 1 | -1) => {
    const { tabs, activeId: aid } = useTabsStore.getState();
    if (tabs.length < 2) return;
    const idx = tabs.findIndex((t) => t.id === aid);
    const nextIdx = (idx + delta + tabs.length) % tabs.length;
    setActiveId(tabs[nextIdx].id);
  }, [setActiveId]);

  const openNewTab = useCallback(() => {
    const { newTabInheritsCwd, terminalDefaultPath } = usePreferencesStore.getState();
    const cwd = newTabInheritsCwd
      ? inheritedCwdForNewTab()
      : (terminalDefaultPath.trim() || undefined);
    newTab(cwd);
  }, [inheritedCwdForNewTab, newTab]);

  const onOpenHostManager = useCallback(() => { openHomeTab(); }, [openHomeTab]);

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
  }, [newTab]);

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
  }, [updateTab]);

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
  }, [newPreviewTab]);

  const handleOpenFile = useCallback((path: string) => {
    const ext = path.split(".").pop()?.toLowerCase() ?? "";
    if (PREVIEW_EXTENSIONS.has(ext)) openPreviewTab(path);
    else openFileTab(path);
  }, [openPreviewTab, openFileTab]);

  const restoreFocus = useCallback(() => {
    const kind = selectActiveTabKind(useTabsStore.getState());
    const { activeId: aid } = useTabsStore.getState();
    const paneId = selectActivePaneId(useTabsStore.getState());
    if (kind === "workspace" && paneId) terminalRefs.current.get(paneId)?.focus();
    else if (kind === "editor") editorRefs.current.get(aid)?.focus();
  }, []);

  const registerEditorHandle = useCallback((id: number, h: EditorPaneHandle | null) => {
    if (h) editorRefs.current.set(id, h);
    else editorRefs.current.delete(id);
    if (id === activeId) setActiveEditorHandle(h);
  }, [activeId]);

  const registerPreviewHandle = useCallback((id: number, h: PreviewPaneHandle | null) => {
    if (h) previewRefs.current.set(id, h);
    else previewRefs.current.delete(id);
  }, []);

  const handlePreviewUrl = useCallback((id: number, url: string) => updateTab(id, { url }), [updateTab]);
  const handleEditorDirty = useCallback((id: number, dirty: boolean) => updateTab(id, { dirty }), [updateTab]);
  const handleEditorSaveAs = useCallback((id: number, newPath: string) => {
    const name = newPath.split("/").pop() ?? newPath;
    updateTab(id, { path: newPath, title: name });
  }, [updateTab]);

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

  // ── Snippet exec ───────────────────────────────────────────────────────────
  const { execSnippet } = useSnippetExec({
    tabs: workspaceTabs,
    activeTerminalRef: () => activePaneId ? (terminalRefs.current.get(activePaneId) ?? null) : null,
    onNewLocalTab: (cwd, command) => newTab(cwd ?? inheritedCwdForNewTab(), command),
    onNewSshTab: (hostId, title, cwd, command) => newSshTab(hostId, title, cwd, command),
    onOpenLogDrawer: () => setSnippetLogDrawerOpen(true),
  });

  const handleSnippetRun = useCallback((snippet: CommandSnippet, mode?: SnippetExecMode) => {
    void execSnippet(snippet, mode);
  }, [execSnippet]);

  return {
    refs: {
      workspacePaneRefs,
      terminalRefs,
      editorRefs,
      previewRefs,
    },
    activeEditorHandle,
    activeDetectedUrl,
    pendingCloseTabId,
    setPendingCloseTabId,
    pendingSaveTab,
    setPendingSaveTab,
    pendingDirtyTab,
    setPendingDirtyTab,
    snippetLogDrawerOpen,
    setSnippetLogDrawerOpen,
    disposeTab,
    handleClose,
    handleCloseOthers,
    handleCloseAll,
    handleDuplicateTab,
    handleRenameTab,
    cycleTab,
    openNewTab,
    openPreviewTab,
    cdInNewTab,
    sendCd,
    restoreFocus,
    onOpenHostManager,
    handleOpenFile,
    handlePathRenamed,
    handlePathDeleted,
    registerEditorHandle,
    registerPreviewHandle,
    handlePreviewUrl,
    handleEditorDirty,
    handleEditorSaveAs,
    handleDetectedLocalUrl,
    handleSnippetRun,
    execSnippet,
    captureActiveSelection,
    openGitGraphTab,
  };
}
