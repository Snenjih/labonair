import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { cn } from "@/lib/utils";
import { useHostsStore } from "@/modules/hosts";
import type { SftpTab } from "@/modules/tabs";
import { useEffect } from "react";
import { SftpToolbar } from "./components/SftpToolbar";
import { VirtualizedFileList } from "./components/VirtualizedFileList";
import { useSftpStore } from "./store/sftpStore";
import type { FileNode } from "./types";

interface SftpPaneProps {
  tab: SftpTab;
}

export function SftpPane({ tab }: SftpPaneProps) {
  const tabId = String(tab.id);
  const { initTab, destroyTab, loadLocalDir, loadRemoteDir, setSelectedLocal, setSelectedRemote, tabs } =
    useSftpStore();
  const tabState = tabs[tabId];

  const hosts = useHostsStore((s) => s.hosts);
  const host = hosts.find((h) => h.id === tab.hostId);
  const hostLabel = host?.name ?? tab.title;

  useEffect(() => {
    initTab(tabId, host?.default_path_sftp ?? "/");
    loadLocalDir(tabId, "~");
    loadRemoteDir(tabId, host?.default_path_sftp ?? "/");
    return () => destroyTab(tabId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabId]);

  function handleLocalSelect(path: string, multi: boolean) {
    const current = tabState?.selectedLocalPaths ?? new Set<string>();
    if (multi) {
      const next = new Set(current);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      setSelectedLocal(tabId, next);
    } else {
      setSelectedLocal(tabId, new Set([path]));
    }
  }

  function handleRemoteSelect(path: string, multi: boolean) {
    const current = tabState?.selectedRemotePaths ?? new Set<string>();
    if (multi) {
      const next = new Set(current);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      setSelectedRemote(tabId, next);
    } else {
      setSelectedRemote(tabId, new Set([path]));
    }
  }

  function handleLocalDoubleClick(file: FileNode) {
    if (file.is_dir) loadLocalDir(tabId, file.path);
  }

  function handleRemoteDoubleClick(file: FileNode) {
    if (file.is_dir) loadRemoteDir(tabId, file.path);
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-background">
      {/* Top host bar */}
      <div className="h-8 shrink-0 border-b border-border bg-card flex items-center px-4 gap-2">
        <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-widest select-none">
          SFTP
        </span>
        <span className="text-muted-foreground/40 text-xs select-none">—</span>
        <span className="text-xs font-medium text-foreground/80 select-none truncate">
          {hostLabel}
        </span>
      </div>

      {/* Split panes */}
      <ResizablePanelGroup orientation="horizontal" className="flex-1 min-h-0">
        {/* LOCAL */}
        <ResizablePanel defaultSize={50} minSize={20}>
          <div className="flex flex-col h-full">
            <PaneLabel
              label="LOCAL"
              count={tabState?.localFiles.length}
              selected={tabState?.selectedLocalPaths.size}
            />
            <SftpToolbar
              path={tabState?.localPath ?? "~"}
              onNavigate={(p) => loadLocalDir(tabId, p)}
            />
            <div className="flex-1 min-h-0">
              <VirtualizedFileList
                files={tabState?.localFiles ?? []}
                selectedPaths={tabState?.selectedLocalPaths ?? new Set()}
                onSelect={handleLocalSelect}
                onDoubleClick={handleLocalDoubleClick}
                isLoading={tabState?.isLoadingLocal}
              />
            </div>
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* REMOTE */}
        <ResizablePanel defaultSize={50} minSize={20}>
          <div className="flex flex-col h-full">
            <PaneLabel
              label="REMOTE"
              count={tabState?.remoteFiles.length}
              selected={tabState?.selectedRemotePaths.size}
            />
            <SftpToolbar
              path={tabState?.remotePath ?? "/"}
              onNavigate={(p) => loadRemoteDir(tabId, p)}
              showOpenTerminal
              onOpenTerminal={() => {/* Task 04.2: open SSH terminal at path */}}
            />
            <div className="flex-1 min-h-0">
              <VirtualizedFileList
                files={tabState?.remoteFiles ?? []}
                selectedPaths={tabState?.selectedRemotePaths ?? new Set()}
                onSelect={handleRemoteSelect}
                onDoubleClick={handleRemoteDoubleClick}
                isLoading={tabState?.isLoadingRemote}
              />
            </div>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>

      {/* Status bar */}
      {tabState?.error && (
        <div className="h-6 shrink-0 border-t border-destructive/40 bg-destructive/10 flex items-center px-3">
          <span className="text-[11px] text-destructive truncate">{tabState.error}</span>
        </div>
      )}
    </div>
  );
}

interface PaneLabelProps {
  label: string;
  count?: number;
  selected?: number;
}

function PaneLabel({ label, count, selected }: PaneLabelProps) {
  return (
    <div className="h-7 shrink-0 px-3 flex items-center gap-2 bg-muted/20 border-b border-border">
      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest select-none">
        {label}
      </span>
      {count !== undefined && (
        <span
          className={cn(
            "text-[10px] text-muted-foreground/60 tabular-nums select-none",
          )}
        >
          {count} item{count !== 1 ? "s" : ""}
          {selected ? ` · ${selected} selected` : ""}
        </span>
      )}
    </div>
  );
}
