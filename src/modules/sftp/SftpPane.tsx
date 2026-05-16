import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { cn } from "@/lib/utils";
import { useHostsStore } from "@/modules/hosts";
import { usePreferencesStore } from "@/modules/settings/preferences";
import {
  setSftpShowHiddenFiles,
} from "@/modules/settings/store";
import { Folder01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

function toggleHiddenFiles() {
  const next = !usePreferencesStore.getState().sftpShowHiddenFiles;
  usePreferencesStore.setState({ sftpShowHiddenFiles: next });
  setSftpShowHiddenFiles(next);
}
import { SshLoadingScreen } from "@/modules/terminal/SshLoadingScreen";
import type { SftpTab } from "@/modules/tabs";
import { useTabs } from "@/modules/tabs/lib/useTabs";
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";
import { SftpContextMenu } from "./components/SftpContextMenu";
import { SftpToolbar } from "./components/SftpToolbar";
import { VirtualizedFileList } from "./components/VirtualizedFileList";
import { useSftpStore } from "./store/sftpStore";
import type { FileNode } from "./types";

function parentPath(p: string): string {
  if (p === "/" || p === "") return "/";
  const trimmed = p.endsWith("/") ? p.slice(0, -1) : p;
  const lastSlash = trimmed.lastIndexOf("/");
  if (lastSlash <= 0) return "/";
  return trimmed.slice(0, lastSlash);
}

interface SftpPaneProps {
  tab: SftpTab;
}

export function SftpPane({ tab }: SftpPaneProps) {
  const tabId = String(tab.id);
  const {
    initTab,
    destroyTab,
    loadLocalDir,
    loadRemoteDir,
    setSelectedLocal,
    setSelectedRemote,
    tabs,
  } = useSftpStore();
  const tabState = tabs[tabId];

  const hosts = useHostsStore((s) => s.hosts);
  const host = hosts.find((h) => h.id === tab.hostId);
  const hostLabel = host?.name ?? tab.title;
  const hostAddress = host?.host_address ?? "";

  const { openRemoteEditorTab } = useTabs();
  const sftpShowHiddenFiles = usePreferencesStore((s) => s.sftpShowHiddenFiles);
  const sftpShowUpFolder = usePreferencesStore((s) => s.sftpShowUpFolder);

  const [isConnected, setIsConnected] = useState(false);
  const [hasError, setHasError] = useState(false);

  // Track drag source pane ("local" | "remote" | null)
  const dragSourceRef = useRef<"local" | "remote" | null>(null);

  // Inline rename state
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // Inline new folder state (separate for local/remote)
  const [creatingFolderSide, setCreatingFolderSide] = useState<"local" | "remote" | null>(null);
  const [newFolderName, setNewFolderName] = useState("");

  // Deep search state
  const [deepSearchResults, setDeepSearchResults] = useState<string[] | null>(null);
  const [isDeepSearching, setIsDeepSearching] = useState(false);

  useEffect(() => {
    if (!isConnected) return;
    initTab(tabId, host?.default_path_sftp ?? "/");
    loadLocalDir(tabId, "~");
    loadRemoteDir(tabId, host?.default_path_sftp ?? "/");
    return () => destroyTab(tabId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabId, isConnected]);

  function handleLocalSelect(path: string, multi: boolean) {
    const current = tabState?.selectedLocalPaths ?? new Set<string>();
    if (multi) {
      const next = new Set(current);
      next.has(path) ? next.delete(path) : next.add(path);
      setSelectedLocal(tabId, next);
    } else {
      setSelectedLocal(tabId, new Set([path]));
    }
  }

  function handleRemoteSelect(path: string, multi: boolean) {
    const current = tabState?.selectedRemotePaths ?? new Set<string>();
    if (multi) {
      const next = new Set(current);
      next.has(path) ? next.delete(path) : next.add(path);
      setSelectedRemote(tabId, next);
    } else {
      setSelectedRemote(tabId, new Set([path]));
    }
  }

  function handleLocalDoubleClick(file: FileNode) {
    if (file.name === "..") {
      loadLocalDir(tabId, parentPath(tabState?.localPath ?? "~"));
      return;
    }
    if (file.is_dir) loadLocalDir(tabId, file.path);
  }

  async function handleRemoteDoubleClick(file: FileNode) {
    if (file.name === "..") {
      loadRemoteDir(tabId, parentPath(tabState?.remotePath ?? "/"));
      return;
    }
    // Symlink: try navigating to the target if available, else fall through
    if (file.is_symlink && file.symlink_target) {
      try {
        await invoke("sftp_read_dir", { tabId, path: file.symlink_target });
        // If it didn't throw, it's a directory — navigate
        loadRemoteDir(tabId, file.symlink_target);
        return;
      } catch {
        // Target is a file; open as editor below
      }
    }
    if (file.is_dir) {
      loadRemoteDir(tabId, file.path);
      return;
    }
    openRemoteEditorTab(tabId, file.path);
  }

  function startRename(path: string) {
    const name = path.split("/").pop() ?? path;
    setRenamingPath(path);
    setRenameValue(name);
  }

  async function commitRename(side: "local" | "remote") {
    if (!renamingPath || !renameValue.trim()) { setRenamingPath(null); return; }
    const dir = renamingPath.substring(0, renamingPath.lastIndexOf("/"));
    const newPath = `${dir}/${renameValue.trim()}`;
    try {
      if (side === "remote") {
        await invoke("sftp_rename", { tabId, oldPath: renamingPath, newPath });
        loadRemoteDir(tabId, tabState?.remotePath ?? "/");
      } else {
        await invoke("fs_rename", { old_path: renamingPath, new_path: newPath });
        loadLocalDir(tabId, tabState?.localPath ?? "~");
      }
    } catch (e) {
      console.error("Rename failed:", e);
    }
    setRenamingPath(null);
  }

  async function handleLocalDrop(_targetPath: string, remotePaths: string[]) {
    if (dragSourceRef.current !== "remote") return;
    const localBase = tabState?.localPath ?? "~";
    for (const remotePath of remotePaths) {
      const fileName = remotePath.split("/").pop() ?? "file";
      const destPath = `${localBase}/${fileName}`;
      await invoke("enqueue_transfer", {
        host_id: tab.hostId,
        src_path: remotePath,
        dest_path: destPath,
        direction: "download",
      });
    }
  }

  async function handleRemoteDrop(_targetPath: string, localPaths: string[]) {
    if (dragSourceRef.current !== "local") return;
    const remoteBase = tabState?.remotePath ?? "/";
    for (const localPath of localPaths) {
      const fileName = localPath.split(/[\\/]/).pop() ?? "file";
      const sep = remoteBase.endsWith("/") ? "" : "/";
      const destPath = `${remoteBase}${sep}${fileName}`;
      await invoke("enqueue_transfer", {
        host_id: tab.hostId,
        src_path: localPath,
        dest_path: destPath,
        direction: "upload",
      });
    }
  }

  async function commitNewFolder(side: "local" | "remote") {
    if (!newFolderName.trim()) { setCreatingFolderSide(null); return; }
    const basePath = side === "remote"
      ? (tabState?.remotePath ?? "/")
      : (tabState?.localPath ?? "~");
    const sep = basePath.endsWith("/") ? "" : "/";
    const newPath = `${basePath}${sep}${newFolderName.trim()}`;
    try {
      if (side === "remote") {
        await invoke("sftp_mkdir", { tabId, path: newPath });
        loadRemoteDir(tabId, basePath);
      } else {
        await invoke("fs_create_dir", { path: newPath });
        loadLocalDir(tabId, basePath);
      }
    } catch (e) {
      console.error("New folder failed:", e);
    }
    setCreatingFolderSide(null);
    setNewFolderName("");
  }

  async function handleDeepSearch(query: string) {
    if (!query) {
      setDeepSearchResults(null);
      return;
    }
    setIsDeepSearching(true);
    try {
      const results = await invoke<string[]>("sftp_deep_search", {
        tabId,
        startPath: tabState?.remotePath ?? "/",
        query,
      });
      setDeepSearchResults(results);
    } catch (e) {
      console.error("Deep search failed:", e);
      setDeepSearchResults([]);
    } finally {
      setIsDeepSearching(false);
    }
  }

  const localPath = tabState?.localPath ?? "~";
  const remotePath = tabState?.remotePath ?? "/";

  const UP_ENTRY: FileNode = {
    name: "..",
    path: "",
    size: 0,
    modified_at: 0,
    is_dir: true,
    is_symlink: false,
    permissions: "",
  };

  function buildFileList(files: FileNode[], currentPath: string): FileNode[] {
    let result = sftpShowHiddenFiles
      ? files
      : files.filter((f) => !f.name.startsWith("."));
    if (sftpShowUpFolder && currentPath !== "/" && currentPath !== "") {
      result = [UP_ENTRY, ...result];
    }
    return result;
  }

  const displayedLocalFiles = buildFileList(tabState?.localFiles ?? [], localPath);
  const displayedRemoteFiles = buildFileList(tabState?.remoteFiles ?? [], remotePath);

  if (!isConnected && !hasError) {
    return (
      <SshLoadingScreen
        tabId={tabId}
        hostId={tab.hostId}
        hostName={tab.title}
        connectionType="sftp"
        onConnected={() => setIsConnected(true)}
        onError={() => setHasError(true)}
      />
    );
  }

  if (hasError) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
        Connection closed.
      </div>
    );
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

      <ResizablePanelGroup orientation="horizontal" className="flex-1 min-h-0">
        {/* LOCAL */}
        <ResizablePanel defaultSize={50} minSize={20}>
          <div className="flex flex-col h-full">
            <PaneLabel
              label="LOCAL"
              count={displayedLocalFiles.length}
              selected={tabState?.selectedLocalPaths.size}
            />
            <SftpToolbar
              path={localPath}
              onNavigate={(p) => loadLocalDir(tabId, p)}
              showHidden={sftpShowHiddenFiles}
              onToggleHidden={toggleHiddenFiles}
              bookmarkKey="local"
            />
            {creatingFolderSide === "local" && (
              <NewFolderInput
                value={newFolderName}
                onChange={setNewFolderName}
                onCommit={() => commitNewFolder("local")}
                onCancel={() => { setCreatingFolderSide(null); setNewFolderName(""); }}
              />
            )}
            <div className="flex-1 min-h-0">
              <SftpContextMenu
                tabId={tabId}
                hostId={tab.hostId}
                side="local"
                selectedPaths={tabState?.selectedLocalPaths ?? new Set()}
                currentPath={localPath}
                hostAddress={hostAddress}
                files={displayedLocalFiles}
                onRefresh={() => loadLocalDir(tabId, localPath)}
                onStartRename={startRename}
                onStartNewFolder={() => { setCreatingFolderSide("local"); setNewFolderName(""); }}
              >
                <div className="h-full">
                  <VirtualizedFileList
                    files={displayedLocalFiles}
                    selectedPaths={tabState?.selectedLocalPaths ?? new Set()}
                    onSelect={handleLocalSelect}
                    onDoubleClick={handleLocalDoubleClick}
                    isLoading={tabState?.isLoadingLocal}
                    draggable
                    onDragStart={() => { dragSourceRef.current = "local"; }}
                    onDrop={handleLocalDrop}
                    renamingPath={renamingPath}
                    renameValue={renameValue}
                    onRenameChange={setRenameValue}
                    onRenameCommit={() => commitRename("local")}
                    onRenameCancel={() => setRenamingPath(null)}
                  />
                </div>
              </SftpContextMenu>
            </div>
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* REMOTE */}
        <ResizablePanel defaultSize={50} minSize={20}>
          <div className="flex flex-col h-full relative">
            <PaneLabel
              label={deepSearchResults !== null ? `SEARCH RESULTS (${deepSearchResults.length})` : "REMOTE"}
              count={deepSearchResults !== null ? deepSearchResults.length : displayedRemoteFiles.length}
              selected={tabState?.selectedRemotePaths.size}
            />
            <SftpToolbar
              path={remotePath}
              onNavigate={(p) => { setDeepSearchResults(null); loadRemoteDir(tabId, p); }}
              showOpenTerminal
              onOpenTerminal={() => {/* Task 05+: open SSH terminal at path */}}
              showHidden={sftpShowHiddenFiles}
              onToggleHidden={toggleHiddenFiles}
              bookmarkKey={hostAddress || undefined}
              onDeepSearch={handleDeepSearch}
              isSearching={isDeepSearching}
            />
            {creatingFolderSide === "remote" && (
              <NewFolderInput
                value={newFolderName}
                onChange={setNewFolderName}
                onCommit={() => commitNewFolder("remote")}
                onCancel={() => { setCreatingFolderSide(null); setNewFolderName(""); }}
              />
            )}

            {/* Deep search results overlay or normal file list */}
            {deepSearchResults !== null ? (
              <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                <div className="h-7 shrink-0 px-3 flex items-center gap-2 border-b border-border bg-yellow-500/5">
                  <span className="text-[10px] text-yellow-500/80 flex-1 truncate">
                    Results for search in {remotePath} — double-click to navigate to parent
                  </span>
                  <button
                    onClick={() => setDeepSearchResults(null)}
                    className="text-xs text-muted-foreground hover:text-foreground"
                  >
                    ✕
                  </button>
                </div>
                <div className="flex-1 overflow-auto min-h-0">
                  {isDeepSearching ? (
                    <div className="flex items-center justify-center h-24 text-muted-foreground text-sm">
                      Searching…
                    </div>
                  ) : deepSearchResults.length === 0 ? (
                    <div className="flex items-center justify-center h-24 text-muted-foreground text-sm">
                      No results found
                    </div>
                  ) : (
                    deepSearchResults.map((p) => {
                      const name = p.split("/").pop() ?? p;
                      const dir = p.substring(0, p.lastIndexOf("/")) || "/";
                      return (
                        <button
                          key={p}
                          onDoubleClick={() => {
                            setDeepSearchResults(null);
                            loadRemoteDir(tabId, dir);
                          }}
                          className={cn(
                            "w-full flex flex-col px-3 py-1.5 text-left",
                            "hover:bg-accent/20 transition-colors",
                            "border-b border-border/30",
                          )}
                        >
                          <span className="text-xs font-medium text-foreground truncate">{name}</span>
                          <span className="text-[10px] font-mono text-muted-foreground/60 truncate">{p}</span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            ) : (
              <div className="flex-1 min-h-0">
                <SftpContextMenu
                  tabId={tabId}
                  hostId={tab.hostId}
                  side="remote"
                  selectedPaths={tabState?.selectedRemotePaths ?? new Set()}
                  currentPath={remotePath}
                  hostAddress={hostAddress}
                  files={displayedRemoteFiles}
                  onRefresh={() => loadRemoteDir(tabId, remotePath)}
                  onStartRename={startRename}
                  onStartNewFolder={() => { setCreatingFolderSide("remote"); setNewFolderName(""); }}
                >
                  <div className="h-full">
                    <VirtualizedFileList
                      files={displayedRemoteFiles}
                      selectedPaths={tabState?.selectedRemotePaths ?? new Set()}
                      onSelect={handleRemoteSelect}
                      onDoubleClick={handleRemoteDoubleClick}
                      isLoading={tabState?.isLoadingRemote}
                      draggable
                      onDragStart={() => { dragSourceRef.current = "remote"; }}
                      onDrop={handleRemoteDrop}
                      renamingPath={renamingPath}
                      renameValue={renameValue}
                      onRenameChange={setRenameValue}
                      onRenameCommit={() => commitRename("remote")}
                      onRenameCancel={() => setRenamingPath(null)}
                    />
                  </div>
                </SftpContextMenu>
              </div>
            )}
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>

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
        <span className="text-[10px] text-muted-foreground/60 tabular-nums select-none">
          {count} item{count !== 1 ? "s" : ""}
          {selected ? ` · ${selected} selected` : ""}
        </span>
      )}
    </div>
  );
}

interface NewFolderInputProps {
  value: string;
  onChange: (v: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}

function NewFolderInput({ value, onChange, onCommit, onCancel }: NewFolderInputProps) {
  return (
    <div className={cn("flex items-center gap-1 px-2 h-7 border-b border-border bg-muted/10 shrink-0")}>
      <HugeiconsIcon icon={Folder01Icon} size={16} className="shrink-0 text-muted-foreground" />
      <input
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onCommit();
          if (e.key === "Escape") onCancel();
        }}
        onBlur={onCancel}
        placeholder="New folder name"
        className="flex-1 h-5 text-xs bg-transparent border-none outline-none text-foreground placeholder:text-muted-foreground/40"
      />
    </div>
  );
}
