import { MotionConfig } from "motion/react";
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
import { ShortcutsDialog } from "@/modules/shortcuts";
import { SnippetLogDrawer } from "@/modules/snippets";
import { useSourceControlStore } from "@/modules/source-control/store/sourceControlStore";
import type { SidebarReturn } from "@/modules/statusbar";
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
  openRemoteEditorTab: (sftpTabId: string, remotePath: string) => Promise<void>;
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

  const onNewGitGraph = () => {
    const { repoRoot, currentBranch, hostId, sessionId } = useSourceControlStore.getState();
    const path = repoRoot ?? ctrl.explorerRoot ?? "";
    tabs.openGitGraphTab(path, currentBranch, hostId ?? undefined, sessionId ?? undefined);
  };

  const sidebarPassthrough = {
    sidebarRef: sidebar.sidebarRef,
    activePanel: sidebar.activePanel,
    setActivePanel: sidebar.setActivePanel,
    onSidebarResize: sidebar.onSidebarResize,
    explorerTarget: ctrl.explorerTarget,
    onSelect: actions.setActiveId,
    onNew: tabs.openNewTab,
    onNewPreview: () => tabs.openPreviewTab(""),
    onNewEditor: () => void actions.openUntitledTab(),
    onNewSsh: actions.newSshTab,
    onNewSftp: actions.newSftpTab,
    onOpenHostManager: tabs.onOpenHostManager,
    onClose: tabs.handleClose,
    onCloseOthers: tabs.handleCloseOthers,
    onCloseAll: tabs.handleCloseAll,
    onDuplicate: tabs.handleDuplicateTab,
    onRename: tabs.handleRenameTab,
    onOpenFile: tabs.handleOpenFile,
    onOpenPreview: tabs.openPreviewTab,
    onPathRenamed: tabs.handlePathRenamed,
    onPathDeleted: tabs.handlePathDeleted,
    onRevealInTerminal: tabs.cdInNewTab,
    onAttachToAgent: ai.handleAttachFileToAgent,
    onOpenRemoteFile: (sessionId: string, path: string) => {
      void actions.openRemoteEditorTab(sessionId, path);
    },
    onOpenSftpTab: (hostId: string, title: string) => {
      actions.newSftpTab(hostId, title);
    },
    onSnippetRun: tabs.handleSnippetRun,
    onOpenGitGraph: tabs.openGitGraphTab,
    onNewGitGraph,
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
                onNewPreview={() => tabs.openPreviewTab("")}
                onNewEditor={() => void actions.openUntitledTab()}
                onNewSsh={actions.newSshTab}
                onNewSftp={actions.newSftpTab}
                onClose={tabs.handleClose}
                onCloseOthers={tabs.handleCloseOthers}
                onCloseAll={tabs.handleCloseAll}
                onDuplicate={tabs.handleDuplicateTab}
                onRename={tabs.handleRenameTab}
                onOpenShortcuts={() => ctrl.setShortcutsOpen(true)}
                onOpenSettings={() => void openSettingsWindow()}
                onOpenKeybindings={() => void openSettingsWindow("shortcuts")}
                onOpenHostManager={tabs.onOpenHostManager}
                onOpenThemes={() => useCommandStore.getState().openToPage("themes")}
                onNewGitGraph={onNewGitGraph}
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
                onPanelToggle={(panel) => {
                  if (panel === "hosts") {
                    actions.openHomeTab();
                    return;
                  }
                  sidebar.handlePanelToggle(panel);
                }}
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

  if (prefs.aiEnabled && ctrl.hasComposer) {
    return <AiComposerProvider>{shell}</AiComposerProvider>;
  }
  return shell;
}
