import { MotionConfig } from "motion/react";
import { useCallback, useMemo } from "react";
import { AiOverlays, CloseDialogs, SidebarContent, WorkspaceArea } from "@/app/components";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { AiLiveBridgeReturn } from "@/modules/ai";
import { AiComposerProvider } from "@/modules/ai/lib/composer";
import type { PaletteCallbacksReturn } from "@/modules/command-palette";
import { CommandPalette, useCommandStore } from "@/modules/command-palette";
import type { ExplorerTarget } from "@/modules/explorer/lib/useExplorerTarget";
import { Header } from "@/modules/header";
import { BackgroundImageLayer } from "@/modules/settings/BackgroundImageLayer";
import { openSettingsWindow } from "@/modules/settings/openSettingsWindow";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { ShortcutsDialog } from "@/modules/shortcuts";
import { SnippetHostPickerDialog, SnippetLogDrawer } from "@/modules/snippets";
import { useSourceControlStore } from "@/modules/source-control/store/sourceControlStore";
import type { SidebarPanel, SidebarReturn } from "@/modules/statusbar";
import { StatusBar } from "@/modules/statusbar";
import {
  type AiDiffStatus,
  selectActiveTabKind,
  type TabManagementReturn,
  useTabsStore,
} from "@/modules/tabs";
import { ThemeProvider } from "@/modules/theme";
import { UpdaterDialog } from "@/modules/updater";

// ─── Stable store actions threaded down from App ─────────────────────────────
export interface AppShellStoreActions {
  openHomeTab: () => void;
  openFileTab: (path: string) => number | null;
  openAiDiffTab: (input: {
    path: string;
    originalContent: string;
    proposedContent: string;
    approvalId: string;
    isNewFile: boolean;
  }) => number | null;
  setAiDiffStatus: (approvalId: string, status: AiDiffStatus) => void;
  newSshTab: (hostId: string, title: string, cwd?: string, initialCommand?: string) => number;
  newQuickSshTab: (username: string, hostAddress: string, port: number) => number;
  newSftpTab: (hostId: string, title: string) => number;
  updateSftpPaths: (tabId: number, remotePath: string, localPath: string) => void;
  openRemoteEditorTab: (
    sftpTabId: string,
    remotePath: string,
    hostId: string,
    source: "sftp-tab" | "lazy-session",
  ) => Promise<void>;
  openRemotePreviewTab: (
    sftpTabId: string,
    remotePath: string,
    hostId: string,
    source: "sftp-tab" | "lazy-session",
  ) => Promise<void>;
  openUntitledTab: () => Promise<number>;
  setActiveId: (id: number) => void;
}

// ─── Prefs + dialog state ─────────────────────────────────────────────────────
export interface AppShellPrefs {
  sidebarPosition: "left" | "right" | "hidden";
  zenModeShowHeader: boolean;
  zenModeShowStatusbar: boolean;
  reduceMotion: boolean;
  aiEnabled: boolean;
}

export interface AppShellControlState {
  home: string | null;
  explorerRoot: string | null;
  explorerTarget: ExplorerTarget;
  hasComposer: boolean;
  keysLoaded: boolean;
  detectedPreviewUrl: string | null;
  panelOpen: boolean;
  openMini: () => void;
  shortcutsOpen: boolean;
  setShortcutsOpen: (open: boolean) => void;
  respondToApproval: (id: string, accepted: boolean) => void;
}

export interface AppShellProps {
  actions: AppShellStoreActions;
  prefs: AppShellPrefs;
  ctrl: AppShellControlState;
  tabs: TabManagementReturn;
  sidebar: SidebarReturn;
  ai: AiLiveBridgeReturn;
  palette: PaletteCallbacksReturn;
}

export function AppShell({ actions, prefs, ctrl, tabs, sidebar, ai, palette }: AppShellProps) {
  const activeId = useTabsStore((s) => s.activeId);
  const activeTabKind = useTabsStore(selectActiveTabKind);
  // The command composer (AiInputBar in Command mode) needs the same
  // <AiComposerProvider> context as AI mode even when no AI key is
  // configured — useComposer() is called unconditionally at the top of
  // AiInputBar, so the provider must be mounted whenever the bar can be,
  // not only when `aiEnabled && hasComposer` (see WorkspaceArea's matching
  // bar-mount condition).
  const terminalComposerEnabled = usePreferencesStore((s) => s.terminalComposerEnabled);

  // Shared between `sidebarPassthrough` and the direct <Header> props below
  // — memoized once rather than as separate inline closures in each spot.
  const onNewPreview = useCallback(() => tabs.openPreviewTab(""), [tabs.openPreviewTab]);
  const onNewEditor = useCallback(() => void actions.openUntitledTab(), [actions.openUntitledTab]);
  const onOpenShortcuts = useCallback(() => ctrl.setShortcutsOpen(true), [ctrl.setShortcutsOpen]);
  const onOpenSettings = useCallback(() => void openSettingsWindow(), []);
  const onOpenKeybindings = useCallback(() => void openSettingsWindow("shortcuts"), []);
  const onOpenThemes = useCallback(() => useCommandStore.getState().openToPage("themes"), []);

  const onNewGitGraph = useCallback(() => {
    const { repoRoot, currentBranch } = useSourceControlStore.getState();
    // hostId/sessionId come from the always-live explorerTarget (derived
    // from the active tab) rather than the Source Control store, which only
    // gets populated once that panel has mounted and polled at least once —
    // otherwise opening Git Graph on a fresh SSH tab silently falls back to
    // a local executor against a remote path string.
    const target = ctrl.explorerTarget;
    const path = repoRoot ?? target.path ?? ctrl.explorerRoot ?? "";
    const hostId = target.type === "remote" ? target.hostId : undefined;
    const sessionId = target.type === "remote" ? target.sessionId : undefined;
    tabs.openGitGraphTab(path, currentBranch, hostId, sessionId);
  }, [ctrl.explorerTarget, ctrl.explorerRoot, tabs.openGitGraphTab]);

  // Memoized so SidebarContent (React.memo) and Header (React.memo) don't
  // re-render on every AppShell render (e.g. every tab switch, which changes
  // `activeId`/`activeTabKind` above) purely because this object/its inline
  // closures got new identities — see review-fix-plan.md Workstream G.
  const sidebarPassthrough = useMemo(
    () => ({
      sidebarRef: sidebar.sidebarRef,
      activePanel: sidebar.activePanel,
      setActivePanel: sidebar.setActivePanel,
      onSidebarResize: sidebar.onSidebarResize,
      explorerTarget: ctrl.explorerTarget,
      onSelect: actions.setActiveId,
      onNew: tabs.openNewTab,
      onNewPreview,
      onNewEditor,
      onNewSsh: actions.newSshTab,
      onNewSftp: actions.newSftpTab,
      onOpenHostManager: tabs.onOpenHostManager,
      onClose: tabs.handleClose,
      onCloseOthers: tabs.handleCloseOthers,
      onCloseAll: tabs.handleCloseAll,
      onCloseByKind: tabs.handleCloseByKind,
      onDuplicate: tabs.handleDuplicateTab,
      onRename: tabs.handleRenameTab,
      onOpenFile: tabs.handleOpenFile,
      onOpenPreview: tabs.openPreviewTab,
      onPathRenamed: tabs.handlePathRenamed,
      onPathDeleted: tabs.handlePathDeleted,
      onRevealInTerminal: tabs.cdInNewTab,
      onAttachToAgent: ai.handleAttachFileToAgent,
      onOpenRemoteFile: (
        sessionId: string,
        path: string,
        hostId: string,
        source: "sftp-tab" | "lazy-session",
      ) => {
        void actions.openRemoteEditorTab(sessionId, path, hostId, source);
      },
      onOpenRemotePreview: (
        sessionId: string,
        path: string,
        hostId: string,
        source: "sftp-tab" | "lazy-session",
      ) => {
        void actions.openRemotePreviewTab(sessionId, path, hostId, source);
      },
      onOpenSftpTab: (hostId: string, title: string) => {
        actions.newSftpTab(hostId, title);
      },
      onSnippetRun: tabs.handleSnippetRun,
      onOpenGitGraph: tabs.openGitGraphTab,
      onNewGitGraph,
    }),
    [
      sidebar.sidebarRef,
      sidebar.activePanel,
      sidebar.setActivePanel,
      sidebar.onSidebarResize,
      ctrl.explorerTarget,
      actions.setActiveId,
      tabs.openNewTab,
      onNewPreview,
      onNewEditor,
      tabs.openPreviewTab,
      actions.newSshTab,
      actions.newSftpTab,
      tabs.onOpenHostManager,
      tabs.handleClose,
      tabs.handleCloseOthers,
      tabs.handleCloseAll,
      tabs.handleCloseByKind,
      tabs.handleDuplicateTab,
      tabs.handleRenameTab,
      tabs.handleOpenFile,
      tabs.handlePathRenamed,
      tabs.handlePathDeleted,
      tabs.cdInNewTab,
      ai.handleAttachFileToAgent,
      actions.openRemoteEditorTab,
      actions.openRemotePreviewTab,
      tabs.handleSnippetRun,
      onNewGitGraph,
    ],
  );

  // Shared by both Header (JumpHostDropdown's Explorer pill fallback) and
  // StatusBar (panel switcher buttons) so the "hosts" special-case only
  // lives in one place.
  const handlePanelToggle = (panel: SidebarPanel) => {
    if (panel === "hosts") {
      actions.openHomeTab();
      return;
    }
    sidebar.handlePanelToggle(panel);
  };

  const shell = (
    <MotionConfig reducedMotion={prefs.reduceMotion ? "always" : "user"}>
      <ThemeProvider>
        <TooltipProvider>
          <div className="relative z-[1] flex h-screen flex-col overflow-hidden bg-background text-foreground">
            <BackgroundImageLayer />

            {prefs.zenModeShowHeader && (
              <Header
                onSelect={actions.setActiveId}
                onNew={tabs.openNewTab}
                onNewPreview={onNewPreview}
                onNewEditor={onNewEditor}
                onNewSsh={actions.newSshTab}
                onNewSftp={actions.newSftpTab}
                onClose={tabs.handleClose}
                onCloseOthers={tabs.handleCloseOthers}
                onCloseAll={tabs.handleCloseAll}
                onCloseByKind={tabs.handleCloseByKind}
                onDuplicate={tabs.handleDuplicateTab}
                onRename={tabs.handleRenameTab}
                onOpenShortcuts={onOpenShortcuts}
                onOpenSettings={onOpenSettings}
                onOpenKeybindings={onOpenKeybindings}
                onOpenHostManager={tabs.onOpenHostManager}
                onOpenThemes={onOpenThemes}
                onNewGitGraph={onNewGitGraph}
                onPanelToggle={handlePanelToggle}
              />
            )}

            <main className="flex min-h-0 flex-1 flex-col">
              <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
                {prefs.sidebarPosition !== "right" && (
                  <>
                    <SidebarContent side="left" {...sidebarPassthrough} />
                    <ResizableHandle withHandle />
                  </>
                )}
                <ResizablePanel id="workspace" defaultSize="78%" minSize="30%">
                  <WorkspaceArea
                    workspacePaneRefs={tabs.refs.workspacePaneRefs}
                    terminalRefs={tabs.refs.terminalRefs}
                    onDetectedLocalUrl={tabs.handleDetectedLocalUrl}
                    registerEditorHandle={tabs.registerEditorHandle}
                    onEditorDirtyChange={tabs.handleEditorDirty}
                    onCloseEditorTab={tabs.disposeTab}
                    onEditorSaveAs={tabs.handleEditorSaveAs}
                    registerPreviewHandle={tabs.registerPreviewHandle}
                    onPreviewUrlChange={tabs.handlePreviewUrl}
                    onAcceptDiff={(id) => ctrl.respondToApproval(id, true)}
                    onRejectDiff={(id) => ctrl.respondToApproval(id, false)}
                    newSshTab={actions.newSshTab}
                    newQuickSshTab={actions.newQuickSshTab}
                    newSftpTab={actions.newSftpTab}
                    onOpenSshTerminal={actions.newSshTab}
                    onOpenRemoteEditor={actions.openRemoteEditorTab}
                    onSftpPathsChange={actions.updateSftpPaths}
                    keysLoaded={ctrl.keysLoaded}
                    panelOpen={ctrl.panelOpen}
                    aiEnabled={prefs.aiEnabled}
                    hasComposer={ctrl.hasComposer}
                    onOpenGitGraphFile={tabs.handleOpenFile}
                  />
                </ResizablePanel>
                {prefs.sidebarPosition === "right" && (
                  <>
                    <ResizableHandle withHandle />
                    <SidebarContent side="right" {...sidebarPassthrough} />
                  </>
                )}
              </ResizablePanelGroup>
            </main>

            <SnippetLogDrawer
              open={tabs.snippetLogDrawerOpen}
              onClose={() => tabs.setSnippetLogDrawerOpen(false)}
              onCancelRun={tabs.cancelSnippetRun}
            />

            <SnippetHostPickerDialog
              open={tabs.snippetHostPicker.open}
              snippetName={tabs.snippetHostPicker.snippetName}
              onSelect={tabs.snippetHostPicker.onSelect}
              onCancel={tabs.snippetHostPicker.onCancel}
            />

            {prefs.zenModeShowStatusbar && (
              <StatusBar
                home={ctrl.home}
                onCd={tabs.sendCd}
                onCdInNewTab={tabs.cdInNewTab}
                onOpenMini={ctrl.openMini}
                hasComposer={prefs.aiEnabled && ctrl.hasComposer}
                detectedPreviewUrl={ctrl.detectedPreviewUrl}
                onOpenPreview={() => {
                  if (ctrl.detectedPreviewUrl) tabs.openPreviewTab(ctrl.detectedPreviewUrl);
                }}
                activePanel={sidebar.activePanel}
                onPanelToggle={handlePanelToggle}
              />
            )}

            <AiOverlays
              aiEnabled={prefs.aiEnabled}
              hasComposer={ctrl.hasComposer}
              askPopup={ai.askPopup}
              onAskFromSelection={ai.onAskFromSelection}
              onDismissAskPopup={() => ai.setAskPopup(null)}
              openAiDiffTab={actions.openAiDiffTab}
              setAiDiffStatus={actions.setAiDiffStatus}
            />

            <ShortcutsDialog open={ctrl.shortcutsOpen} onOpenChange={ctrl.setShortcutsOpen} />

            <CommandPalette
              callbacks={palette.paletteCallbacks}
              activeTabKind={activeTabKind ?? undefined}
              activeContext={palette.activeContext}
              activeTabId={activeId}
              restoreFocus={tabs.restoreFocus}
            />

            <UpdaterDialog />

            <CloseDialogs
              pendingSaveTab={tabs.pendingSaveTab}
              setPendingSaveTab={tabs.setPendingSaveTab}
              pendingDirtyTab={tabs.pendingDirtyTab}
              setPendingDirtyTab={tabs.setPendingDirtyTab}
              pendingCloseTabId={tabs.pendingCloseTabId}
              setPendingCloseTabId={tabs.setPendingCloseTabId}
              disposeTab={tabs.disposeTab}
              editorRefs={tabs.refs.editorRefs}
            />
          </div>
        </TooltipProvider>
      </ThemeProvider>
    </MotionConfig>
  );

  if ((prefs.aiEnabled && ctrl.hasComposer) || terminalComposerEnabled) {
    return <AiComposerProvider>{shell}</AiComposerProvider>;
  }
  return shell;
}
