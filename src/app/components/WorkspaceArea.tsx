import React from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { AiInputBar } from "@/modules/ai";
import { AiInputBarConnect } from "@/modules/ai/components/AiInputBar";
import { AiDiffStack, EditorStack } from "@/modules/editor";
import type { EditorPaneHandle } from "@/modules/editor";
import { HomeDashboard } from "@/modules/hosts";
import { PreviewStack } from "@/modules/preview";
import type { PreviewPaneHandle } from "@/modules/preview";
import { openSettingsWindow } from "@/modules/settings/openSettingsWindow";
import { SftpStack } from "@/modules/sftp/SftpStack";
import { GitGraphStack } from "@/modules/git-graph";
import { useTabsStore, selectActiveTabKind } from "@/modules/tabs";
import { WorkspaceStack } from "@/modules/terminal/WorkspaceStack";
import type { WorkspacePaneHandle, TerminalPaneHandle } from "@/modules/terminal";

export interface WorkspaceAreaProps {
  workspacePaneRefs: React.MutableRefObject<Map<number, WorkspacePaneHandle>>;
  terminalRefs: React.MutableRefObject<Map<string, TerminalPaneHandle>>;
  onDetectedLocalUrl: (sessionId: string, url: string) => void;
  registerEditorHandle: (id: number, h: EditorPaneHandle | null) => void;
  onEditorDirtyChange: (id: number, dirty: boolean) => void;
  onCloseEditorTab: (id: number) => void;
  onEditorSaveAs: (id: number, newPath: string) => void;
  registerPreviewHandle: (id: number, h: PreviewPaneHandle | null) => void;
  onPreviewUrlChange: (id: number, url: string) => void;
  onAcceptDiff: (id: string) => void;
  onRejectDiff: (id: string) => void;
  newSshTab: (hostId: string, title: string, cwd?: string) => number;
  newQuickSshTab: (username: string, hostAddress: string, port: number) => number;
  newSftpTab: (hostId: string, title: string) => number;
  onOpenSshTerminal: (hostId: string, title: string) => number;
  onOpenRemoteEditor: (sftpTabId: string, remotePath: string) => Promise<void>;
  onSftpPathsChange: (tabId: number, remotePath: string, localPath: string) => void;
  keysLoaded: boolean;
  panelOpen: boolean;
  aiEnabled: boolean;
  hasComposer: boolean;
  onOpenGitGraphFile?: (path: string) => void;
}

export const WorkspaceArea = React.memo(function WorkspaceArea({
  workspacePaneRefs,
  terminalRefs,
  onDetectedLocalUrl,
  registerEditorHandle,
  onEditorDirtyChange,
  onCloseEditorTab,
  onEditorSaveAs,
  registerPreviewHandle,
  onPreviewUrlChange,
  onAcceptDiff,
  onRejectDiff,
  newSshTab,
  newQuickSshTab,
  newSftpTab,
  onOpenSshTerminal,
  onOpenRemoteEditor,
  onSftpPathsChange,
  keysLoaded,
  panelOpen,
  aiEnabled,
  hasComposer,
  onOpenGitGraphFile,
}: WorkspaceAreaProps) {
  const activeTabKind = useTabsStore(selectActiveTabKind);
  const isEditorTab = activeTabKind === "editor";
  const isPreviewTab = activeTabKind === "preview";
  const isAiDiffTab = activeTabKind === "ai-diff";
  const isHomeTab = activeTabKind === "home";
  const isGitGraphTab = activeTabKind === "git-graph";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="relative min-h-0 flex-1">
        <WorkspaceStack
          workspacePaneRefs={workspacePaneRefs}
          terminalRefs={terminalRefs}
          onDetectedLocalUrl={onDetectedLocalUrl}
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
            onDirtyChange={onEditorDirtyChange}
            onCloseTab={onCloseEditorTab}
            onSaveAs={onEditorSaveAs}
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
            onUrlChange={onPreviewUrlChange}
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
            onAccept={onAcceptDiff}
            onReject={onRejectDiff}
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
          onOpenSshTerminal={onOpenSshTerminal}
          onOpenRemoteEditor={onOpenRemoteEditor}
          onPathsChange={onSftpPathsChange}
        />
        <div
          className={cn(
            "absolute inset-0",
            isGitGraphTab ? "z-10" : "z-0 opacity-0 pointer-events-none",
          )}
          aria-hidden={!isGitGraphTab}
        >
          <GitGraphStack onOpenFile={onOpenGitGraphFile} />
        </div>
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
  );
});
