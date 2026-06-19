import type React from "react";
import type { PanelImperativeHandle } from "react-resizable-panels";
import { ResizablePanel } from "@/components/ui/resizable";
import { cn } from "@/lib/utils";
import { FileExplorer } from "@/modules/explorer";
import { SnippetsPanel } from "@/modules/snippets";
import type { CommandSnippet, SnippetExecMode } from "@/modules/snippets";
import { SourceControlPanel } from "@/modules/source-control";
import type { SidebarPanel } from "@/modules/statusbar";
import { SidebarTabList } from "@/modules/tabs";

export interface SidebarContentProps {
  side: "left" | "right";
  sidebarRef: React.RefObject<PanelImperativeHandle | null>;
  activePanel: SidebarPanel;
  setActivePanel: React.Dispatch<React.SetStateAction<SidebarPanel>>;
  onSidebarResize: (size: { asPercentage: number }) => void;
  explorerRoot: string | null;
  // Tab list callbacks
  onSelect: (id: number) => void;
  onNew: () => void;
  onNewPreview: () => void;
  onNewEditor: () => void;
  onNewSsh: (hostId: string, title: string) => void;
  onNewSftp: (hostId: string, title: string) => void;
  onOpenHostManager: () => void;
  onClose: (id: number) => void;
  onCloseOthers: (keepId: number) => void;
  onCloseAll: () => void;
  onDuplicate: (id: number) => void;
  onRename: (id: number, label: string) => void;
  // Explorer callbacks
  onOpenFile: (path: string) => void;
  onOpenPreview: (url: string) => number;
  onPathRenamed: (from: string, to: string) => void;
  onPathDeleted: (path: string) => void;
  onRevealInTerminal: (path: string) => void;
  onAttachToAgent: (path: string) => void;
  // Snippet
  onSnippetRun: (snippet: CommandSnippet, mode?: SnippetExecMode) => void;
  // Source control
  onOpenGitGraph: (repoPath: string, branch: string) => void;
  onNewGitGraph?: () => void;
  onNewAgentFleet?: () => void;
}

export function SidebarContent({
  side,
  sidebarRef,
  activePanel,
  onSidebarResize,
  explorerRoot,
  onSelect,
  onNew,
  onNewPreview,
  onNewEditor,
  onNewSsh,
  onNewSftp,
  onOpenHostManager,
  onClose,
  onCloseOthers,
  onCloseAll,
  onDuplicate,
  onRename,
  onOpenFile,
  onOpenPreview,
  onPathRenamed,
  onPathDeleted,
  onRevealInTerminal,
  onAttachToAgent,
  onSnippetRun,
  onOpenGitGraph,
  onNewGitGraph,
  onNewAgentFleet,
}: SidebarContentProps) {
  return (
    <ResizablePanel
      id="sidebar"
      panelRef={sidebarRef}
      defaultSize="225px"
      minSize="130px"
      maxSize="450px"
      collapsible
      collapsedSize={0}
      onResize={onSidebarResize}
    >
      <div
        className={cn(
          "h-full bg-card",
          side === "left" ? "border-r border-border/60" : "border-l border-border/60",
        )}
      >
        {activePanel === "tabs" ? (
          <SidebarTabList
            onSelect={onSelect}
            onNew={onNew}
            onNewPreview={onNewPreview}
            onNewEditor={onNewEditor}
            onNewSsh={onNewSsh}
            onNewSftp={onNewSftp}
            onOpenHostManager={onOpenHostManager}
            onClose={onClose}
            onCloseOthers={onCloseOthers}
            onCloseAll={onCloseAll}
            onDuplicate={onDuplicate}
            onRename={onRename}
            onNewGitGraph={onNewGitGraph}
            onNewAgentFleet={onNewAgentFleet}
          />
        ) : activePanel === "snippets" ? (
          <SnippetsPanel onRun={onSnippetRun} />
        ) : activePanel === "source-control" ? (
          <SourceControlPanel
            rootPath={explorerRoot}
            onOpenGitGraph={onOpenGitGraph}
          />
        ) : (
          <FileExplorer
            rootPath={explorerRoot}
            onOpenFile={onOpenFile}
            onOpenPreview={onOpenPreview}
            onPathRenamed={onPathRenamed}
            onPathDeleted={onPathDeleted}
            onRevealInTerminal={onRevealInTerminal}
            onAttachToAgent={onAttachToAgent}
          />
        )}
      </div>
    </ResizablePanel>
  );
}
