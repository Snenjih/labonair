import { useCallback, useEffect, useState } from "react";
import type React from "react";
import { hasAnyKey, useChatStore } from "@/modules/ai";
import { useTabsStore, type WorkspaceTab } from "@/modules/tabs";
import { openSettingsWindow } from "@/modules/settings/openSettingsWindow";
import type { TerminalPaneHandle } from "@/modules/terminal";
import type { EditorPaneHandle } from "@/modules/editor";

export interface UseAiLiveBridgeOptions {
  terminalRefs: React.MutableRefObject<Map<string, TerminalPaneHandle>>;
  editorRefs: React.MutableRefObject<Map<number, EditorPaneHandle>>;
  explorerRoot: string | null;
  home: string | null;
  openPreviewTab: (url: string) => number;
}

export interface AiLiveBridgeReturn {
  askPopup: { x: number; y: number } | null;
  setAskPopup: React.Dispatch<React.SetStateAction<{ x: number; y: number } | null>>;
  onAskFromSelection: () => void;
  askFromSelection: () => void;
  togglePanelAndFocus: () => void;
  captureActiveSelection: () => string | null;
  handleAttachFileToAgent: (path: string) => void;
}

export function useAiLiveBridge({
  terminalRefs,
  editorRefs,
  explorerRoot,
  home,
  openPreviewTab,
}: UseAiLiveBridgeOptions): AiLiveBridgeReturn {
  // Reactive store subscriptions
  const apiKeys = useChatStore((s) => s.apiKeys);
  const hasComposer = hasAnyKey(apiKeys);
  const panelOpen = useChatStore((s) => s.panelOpen);

  const captureActiveSelection = useCallback((): string | null => {
    const { tabs: storeTabs, activeId: aid } = useTabsStore.getState();
    const t = storeTabs.find((x) => x.id === aid);
    if (!t) return null;
    if (t.kind === "workspace") {
      const wt = t as WorkspaceTab;
      return terminalRefs.current.get(wt.activePaneId)?.getSelection() ?? null;
    }
    if (t.kind === "editor") {
      return editorRefs.current.get(aid)?.getSelection() ?? null;
    }
    return null;
  }, [terminalRefs, editorRefs]);

  const togglePanelAndFocus = useCallback(() => {
    const { openPanel, focusInput } = useChatStore.getState();
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
  }, [hasComposer, panelOpen]);

  const handleAttachFileToAgent = useCallback((path: string) => {
    const { openPanel, focusInput } = useChatStore.getState();
    if (!hasComposer) {
      void openSettingsWindow("models");
      return;
    }
    window.dispatchEvent(new CustomEvent<string>("labonair:ai-attach-file", { detail: path }));
    openPanel();
    focusInput(null);
  }, [hasComposer]);

  const askFromSelection = useCallback(() => {
    const { focusInput, attachSelection } = useChatStore.getState();
    if (!hasComposer) {
      void openSettingsWindow("models");
      return;
    }
    const selection = captureActiveSelection();
    if (!selection || !selection.trim()) {
      focusInput(null);
      return;
    }
    const { tabs: storeTabs, activeId: aid } = useTabsStore.getState();
    const tab = storeTabs.find((x) => x.id === aid);
    const source: "terminal" | "editor" = tab?.kind === "editor" ? "editor" : "terminal";
    attachSelection(selection, source);
  }, [hasComposer, captureActiveSelection]);

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

  // ── setLive — tabs/activeId read inside via getState() ────────────────────
  useEffect(() => {
    const { setLive } = useChatStore.getState();
    setLive({
      getCwd: () => {
        const { tabs: storeTabs, activeId: aid } = useTabsStore.getState();
        const active = storeTabs.find((x) => x.id === aid);
        if (active?.kind === "workspace") {
          const wt = active as WorkspaceTab;
          const session = wt.sessions[wt.activePaneId];
          if (session?.kind === "local" && session.cwd) return session.cwd;
        }
        for (let i = storeTabs.length - 1; i >= 0; i--) {
          const t = storeTabs[i];
          if (t.kind !== "workspace") continue;
          for (const s of Object.values((t as WorkspaceTab).sessions)) {
            if (s.kind === "local" && s.cwd) return s.cwd;
          }
        }
        return explorerRoot ?? home ?? null;
      },
      getTerminalContext: () => {
        const { tabs: storeTabs, activeId: aid } = useTabsStore.getState();
        const t = storeTabs.find((x) => x.id === aid);
        if (t?.kind !== "workspace") return null;
        return terminalRefs.current.get((t as WorkspaceTab).activePaneId)?.getBuffer(300) ?? null;
      },
      injectIntoActivePty: (text) => {
        const { tabs: storeTabs, activeId: aid } = useTabsStore.getState();
        const t = storeTabs.find((x) => x.id === aid);
        if (t?.kind !== "workspace") return false;
        const term = terminalRefs.current.get((t as WorkspaceTab).activePaneId);
        if (!term) return false;
        term.write(text);
        term.focus();
        return true;
      },
      getWorkspaceRoot: () => explorerRoot ?? home ?? null,
      getActiveFile: () => {
        const { tabs: storeTabs, activeId: aid } = useTabsStore.getState();
        const t = storeTabs.find((x) => x.id === aid);
        return t?.kind === "editor" ? (t as { path: string }).path : null;
      },
      openPreview: (url: string) => { openPreviewTab(url); return true; },
      getActiveTabKind: () => {
        const { tabs: storeTabs, activeId: aid } = useTabsStore.getState();
        return storeTabs.find((x) => x.id === aid)?.kind ?? null;
      },
      getActiveSshTabId: () => {
        const { tabs: storeTabs, activeId: aid } = useTabsStore.getState();
        const t = storeTabs.find((x) => x.id === aid);
        if (t?.kind !== "workspace") return null;
        const wt = t as WorkspaceTab;
        const session = wt.sessions[wt.activePaneId];
        return session?.kind === "ssh" ? wt.activePaneId : null;
      },
      getTerminalTabs: () => {
        const { tabs: storeTabs } = useTabsStore.getState();
        return storeTabs
          .filter((t): t is WorkspaceTab => t.kind === "workspace")
          .map((t, i) => ({
            id: t.activePaneId,
            label: t.title ?? "Terminal",
            index: i + 1,
          }));
      },
      openTerminalWithCommand: (command) => {
        const { newTab: openNewTab } = useTabsStore.getState();
        const tabId = openNewTab();
        setTimeout(() => {
          const { tabs: updatedTabs } = useTabsStore.getState();
          const newTabData = updatedTabs.find((t) => t.id === tabId);
          if (!newTabData || newTabData.kind !== "workspace") return;
          const paneId = (newTabData as WorkspaceTab).activePaneId;
          const term = terminalRefs.current.get(paneId);
          if (term) {
            term.write(command);
            term.focus();
          }
        }, 100);
      },
      injectIntoTerminal: (tabId, command) => {
        const term = terminalRefs.current.get(tabId);
        if (term) {
          term.write(command);
          term.focus();
        }
      },
    });
  }, [explorerRoot, home, openPreviewTab, terminalRefs, editorRefs]);

  return {
    askPopup,
    setAskPopup,
    onAskFromSelection,
    askFromSelection,
    togglePanelAndFocus,
    captureActiveSelection,
    handleAttachFileToAgent,
  };
}
