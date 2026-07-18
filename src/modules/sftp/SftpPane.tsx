import { Folder01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { handleApiError } from "@/lib/errors";
import { cn } from "@/lib/utils";
import { useConnectionStatusStore, useHostsStore } from "@/modules/hosts";
import { toggleSftpHiddenFiles, usePreferencesStore } from "@/modules/settings/preferences";
import { useTabsStore, type SftpTab } from "@/modules/tabs";
import { SshLoadingScreen } from "@/modules/terminal/SshLoadingScreen";
import { isLabonairError } from "@/types";
import { SftpContextMenu } from "./components/SftpContextMenu";
import { SftpToolbar } from "./components/SftpToolbar";
import { VirtualizedFileList } from "./components/VirtualizedFileList";
import { useSftpStore } from "./store/sftpStore";
import type { FileNode } from "./types";
import { blurActiveInput, parentPath } from "./utils";

interface SftpPaneProps {
  tab: SftpTab;
  onOpenSshTerminal?: (hostId: string, title: string, cwd: string) => void;
  onOpenRemoteEditor: (
    tabId: string,
    remotePath: string,
    hostId: string,
    source: "sftp-tab",
  ) => Promise<void>;
  onPathsChange?: (tabId: number, remotePath: string, localPath: string) => void;
}

export function SftpPane({ tab, onOpenSshTerminal, onOpenRemoteEditor, onPathsChange }: SftpPaneProps) {
  const tabId = String(tab.id);
  const {
    initTab,
    destroyTab,
    loadLocalDir,
    loadRemoteDir,
    loadMoreRemoteDir,
    setSelectedLocal,
    setSelectedRemote,
    clearDisconnected,
    tabs,
  } = useSftpStore();
  const tabState = tabs[tabId];
  const [isReconnecting, setIsReconnecting] = useState(false);
  // SFTP tabs stay mounted (just visually hidden) when switched away from —
  // guards the Ctrl/Cmd+A handling below against firing on a tab the user
  // can't currently see.
  const isTabActive = useTabsStore((s) => s.activeId === tab.id);
  // Which pane the user last interacted with (click on a row, empty space,
  // or the toolbar) — tracked as plain state rather than relying on real DOM
  // focus, since forcing focus onto the pane container on every click would
  // fight with clicking directly into an actual input (path field, rename,
  // new-folder) for genuine text editing.
  const [activePane, setActivePane] = useState<"local" | "remote" | null>(null);

  const hosts = useHostsStore((s) => s.hosts);
  const host = hosts.find((h) => h.id === tab.hostId);
  const hostLabel = host?.name ?? tab.title;
  const hostAddress = host?.host_address ?? "";

  const sftpFontSize = usePreferencesStore((s) => s.sftpFontSize);
  const sftpShowHiddenFiles = usePreferencesStore((s) => s.sftpShowHiddenFiles);
  const sftpShowUpFolder = usePreferencesStore((s) => s.sftpShowUpFolder);

  const [isConnected, setIsConnected] = useState(false);
  const [hasError, setHasError] = useState(false);

  // Pointer-based drag state (HTML5 DnD doesn't work reliably in WKWebView/Tauri)
  const dragSourceRef = useRef<"local" | "remote" | null>(null);
  const [activeDragSource, setActiveDragSource] = useState<"local" | "remote" | null>(null);
  const [dropHoveredPane, setDropHoveredPane] = useState<"local" | "remote" | null>(null);
  const localPaneRef = useRef<HTMLDivElement>(null);
  const remotePaneRef = useRef<HTMLDivElement>(null);
  const draggedPathsRef = useRef<string[]>([]);

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
    return () => {
      destroyTab(tabId);
      invoke("sftp_disconnect", { sessionId: tabId }).catch((e) =>
        handleApiError(e, "Failed to disconnect SFTP", "SFTP"),
      );
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabId, isConnected]);

  useEffect(() => {
    if (!tabState || !onPathsChange) return;
    onPathsChange(tab.id, tabState.remotePath, tabState.localPath);
  }, [tab.id, tabState?.remotePath, tabState?.localPath, onPathsChange]);

  // Tracks this pane's live status in the shared cross-tab connection-status
  // store — feeds the StatusBar jump-host dropdown alongside terminal panes
  // and explorer/git lazy sessions. Runs unconditionally (not gated behind
  // isConnected, unlike the init effect above) so remove() always fires on
  // unmount, even for a tab that errors out before ever connecting.
  useEffect(() => {
    const h = useHostsStore.getState().hosts.find((x) => x.id === tab.hostId);
    const jumpHostName = h?.jump_host_id
      ? (useHostsStore.getState().hosts.find((x) => x.id === h.jump_host_id)?.name ?? "unknown host")
      : null;
    useConnectionStatusStore.getState().upsert(tabId, {
      hostId: tab.hostId,
      kind: "sftp",
      status: "connecting",
      error: null,
      jumpHostName,
      hostLabel: h?.name ?? tab.title,
      sftpTabId: tab.id,
    });
    return () => useConnectionStatusStore.getState().remove(tabId);
  }, [tabId, tab.hostId, tab.id, tab.title]);

  // Mirrors useSftpStore's disconnected/disconnectReason (populated by the
  // backend's ssh_connection_lost event) into the shared connection-status
  // store, instead of adding a second raw event listener for the same session.
  useEffect(() => {
    if (tabState?.disconnected) {
      useConnectionStatusStore.getState().setStatus(tabId, "error", tabState.disconnectReason);
    }
  }, [tabId, tabState?.disconnected, tabState?.disconnectReason]);

  /** Selecting in one pane clears any selection in the other — the two
   *  panes act as a single mutually-exclusive selection for bulk actions
   *  (matches conventional dual-pane file managers), rather than letting
   *  independent local + remote selections coexist. */
  function selectLocalPaths(paths: Set<string>) {
    setSelectedLocal(tabId, paths);
    if (tabState?.selectedRemotePaths.size) setSelectedRemote(tabId, new Set());
  }

  function selectRemotePaths(paths: Set<string>) {
    setSelectedRemote(tabId, paths);
    if (tabState?.selectedLocalPaths.size) setSelectedLocal(tabId, new Set());
  }

  function handleLocalSelect(path: string, multi: boolean) {
    const current = tabState?.selectedLocalPaths ?? new Set<string>();
    if (multi) {
      const next = new Set(current);
      next.has(path) ? next.delete(path) : next.add(path);
      selectLocalPaths(next);
    } else {
      selectLocalPaths(new Set([path]));
    }
  }

  function handleRemoteSelect(path: string, multi: boolean) {
    const current = tabState?.selectedRemotePaths ?? new Set<string>();
    if (multi) {
      const next = new Set(current);
      next.has(path) ? next.delete(path) : next.add(path);
      selectRemotePaths(next);
    } else {
      selectRemotePaths(new Set([path]));
    }
  }

  /** Selects every file/folder currently shown in one pane (excluding the
   *  synthetic ".." up-navigation row) — only the currently loaded page for
   *  the remote pane, matching what's actually visible/counted in the UI. */
  function handleSelectAll(side: "local" | "remote") {
    if (side === "remote" && deepSearchResults !== null) return; // no bulk selection over search results
    const files = side === "local" ? displayedLocalFiles : displayedRemoteFiles;
    const paths = new Set(files.filter((f) => f.name !== "..").map((f) => f.path));
    if (side === "local") {
      selectLocalPaths(paths);
    } else {
      selectRemotePaths(paths);
    }
  }

  // Keeps a window-level keydown listener (registered once below) calling
  // the latest `handleSelectAll` without needing to re-subscribe it on every
  // render just because the displayed file lists changed.
  const handleSelectAllRef = useRef(handleSelectAll);
  handleSelectAllRef.current = handleSelectAll;

  // Ctrl/Cmd+A selects all files in whichever pane was last clicked, instead
  // of the browser's default select-all-text — a window-level listener
  // (rather than a per-pane onKeyDown) because it must also fire for clicks
  // on plain, non-focusable row/empty-space elements that never receive real
  // DOM focus. Bails out whenever the currently focused element is an actual
  // `<input>` (rename, new-folder-name, deep search, or the path field once
  // the user has deliberately clicked into it) so normal text editing keeps
  // its native select-all behavior; the path field itself additionally gets
  // `tabIndex={-1}` (see `SftpToolbar.tsx`) so it can only ever gain focus
  // through such a deliberate click, never by accident.
  useEffect(() => {
    function onWindowKeyDown(e: KeyboardEvent) {
      if (!isTabActive || !activePane) return;
      if (document.activeElement instanceof HTMLInputElement) return;
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "a") return;
      e.preventDefault();
      handleSelectAllRef.current(activePane);
    }
    window.addEventListener("keydown", onWindowKeyDown);
    return () => window.removeEventListener("keydown", onWindowKeyDown);
  }, [isTabActive, activePane]);

  function handleLocalDoubleClick(file: FileNode) {
    if (file.name === "..") {
      loadLocalDir(tabId, parentPath(tabState?.localPath ?? "~"));
      return;
    }
    if (file.is_dir) loadLocalDir(tabId, file.path);
  }

  function handleRemoteDoubleClick(file: FileNode) {
    if (file.name === "..") {
      loadRemoteDir(tabId, parentPath(tabState?.remotePath ?? "/"));
      return;
    }
    // is_dir is now resolved through stat() server-side for symlinks too,
    // so we can rely on it directly without an extra round-trip.
    if (file.is_dir) {
      const target = file.is_symlink && file.symlink_target ? file.symlink_target : file.path;
      loadRemoteDir(tabId, target);
      return;
    }
    onOpenRemoteEditor(tabId, file.path, tab.hostId, "sftp-tab").catch((e) =>
      handleApiError(e, "Failed to open remote file", "SFTP"),
    );
  }

  function startRename(path: string) {
    const name = path.split("/").pop() ?? path;
    setRenamingPath(path);
    setRenameValue(name);
  }

  async function commitRename(side: "local" | "remote") {
    if (!renamingPath || !renameValue.trim()) {
      setRenamingPath(null);
      return;
    }
    const dir = renamingPath.substring(0, renamingPath.lastIndexOf("/"));
    const newPath = `${dir}/${renameValue.trim()}`;
    try {
      if (side === "remote") {
        await invoke("sftp_rename", { sessionId: tabId, oldPath: renamingPath, newPath });
        loadRemoteDir(tabId, tabState?.remotePath ?? "/");
      } else {
        await invoke("fs_rename", { from: renamingPath, to: newPath });
        loadLocalDir(tabId, tabState?.localPath ?? "~");
      }
    } catch (e) {
      handleApiError(e, "Failed to rename", "SFTP");
    }
    setRenamingPath(null);
  }

  function startDrag(source: "local" | "remote", paths: string[]) {
    blurActiveInput();
    dragSourceRef.current = source;
    draggedPathsRef.current = paths;
    setActiveDragSource(source);
    setDropHoveredPane(null);

    // This is a manual pointer-based drag (not HTML5 DnD, which doesn't work
    // reliably in WKWebView/Tauri — see the comment above `dragSourceRef`),
    // so nothing stops the browser's normal text-selection behavior while the
    // pointer moves across the rest of the app during the drag. Suppress it
    // for the duration, restoring it once the drag ends however it ends
    // (pointerup, or a cancel from e.g. an OS-level interruption).
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.userSelect = "none";

    function getHoveredPane(x: number, y: number): "local" | "remote" | null {
      const lr = localPaneRef.current?.getBoundingClientRect();
      const rr = remotePaneRef.current?.getBoundingClientRect();
      if (lr && x >= lr.left && x <= lr.right && y >= lr.top && y <= lr.bottom) return "local";
      if (rr && x >= rr.left && x <= rr.right && y >= rr.top && y <= rr.bottom) return "remote";
      return null;
    }

    function onMove(e: PointerEvent) {
      const hovered = getHoveredPane(e.clientX, e.clientY);
      setDropHoveredPane(hovered !== source ? hovered : null);
    }

    function endDrag() {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onCancel);
      document.body.style.userSelect = previousUserSelect;
    }

    function onUp(e: PointerEvent) {
      const landed = getHoveredPane(e.clientX, e.clientY);
      const src = dragSourceRef.current;
      const paths = draggedPathsRef.current;

      endDrag();
      dragSourceRef.current = null;
      draggedPathsRef.current = [];
      setActiveDragSource(null);
      setDropHoveredPane(null);

      if (!src || landed === src || !landed) return;

      if (src === "remote" && landed === "local") {
        void enqueueDownloads(paths);
      } else if (src === "local" && landed === "remote") {
        void enqueueUploads(paths);
      }
    }

    function onCancel() {
      endDrag();
      dragSourceRef.current = null;
      draggedPathsRef.current = [];
      setActiveDragSource(null);
      setDropHoveredPane(null);
    }

    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onCancel);
  }

  async function enqueueDownloads(remotePaths: string[]) {
    const localBase = tabState?.localPath ?? "~";
    for (const remotePath of remotePaths) {
      const fileName = remotePath.split("/").pop() ?? "file";
      const destPath = `${localBase}/${fileName}`;
      try {
        await invoke("enqueue_transfer", {
          sessionId: String(tab.id),
          srcPath: remotePath,
          destPath,
          direction: "download",
        });
      } catch (e) {
        handleApiError(e, "Failed to enqueue download", "SFTP");
      }
    }
  }

  async function enqueueUploads(localPaths: string[]) {
    const remoteBase = tabState?.remotePath ?? "/";
    for (const localPath of localPaths) {
      const fileName = localPath.split(/[\\/]/).pop() ?? "file";
      const sep = remoteBase.endsWith("/") ? "" : "/";
      const destPath = `${remoteBase}${sep}${fileName}`;
      try {
        await invoke("enqueue_transfer", {
          sessionId: String(tab.id),
          srcPath: localPath,
          destPath,
          direction: "upload",
        });
      } catch (e) {
        handleApiError(e, "Failed to enqueue upload", "SFTP");
      }
    }
  }

  async function commitNewFolder(side: "local" | "remote") {
    if (!newFolderName.trim()) {
      setCreatingFolderSide(null);
      return;
    }
    const basePath = side === "remote" ? (tabState?.remotePath ?? "/") : (tabState?.localPath ?? "~");
    const sep = basePath.endsWith("/") ? "" : "/";
    const newPath = `${basePath}${sep}${newFolderName.trim()}`;
    try {
      if (side === "remote") {
        await invoke("sftp_mkdir", { sessionId: tabId, path: newPath });
        loadRemoteDir(tabId, basePath);
      } else {
        await invoke("fs_create_dir", { path: newPath });
        loadLocalDir(tabId, basePath);
      }
    } catch (e) {
      handleApiError(e, "Failed to create folder", "SFTP");
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
      handleApiError(e, "Deep search failed", "SFTP");
      setDeepSearchResults([]);
    } finally {
      setIsDeepSearching(false);
    }
  }

  async function handleReconnect() {
    setIsReconnecting(true);
    useConnectionStatusStore.getState().setStatus(tabId, "connecting");
    try {
      // Force-disconnect first (best-effort) so sftp_connect's idempotency
      // check never silently no-ops against a stale session record the
      // backend failed to clean up itself — same reasoning as the sidebar
      // Explorer's lazy-session reconnect (see useLazyExplorerSession.ts).
      await invoke("sftp_disconnect", { sessionId: tabId }).catch(() => {});
      await invoke("sftp_connect", { sessionId: tabId, hostId: tab.hostId });
      clearDisconnected(tabId);
      useConnectionStatusStore.getState().setStatus(tabId, "connected");
      loadLocalDir(tabId, tabState?.localPath ?? "~");
      loadRemoteDir(tabId, tabState?.remotePath ?? host?.default_path_sftp ?? "/");
    } catch (e) {
      handleApiError(e, "Reconnect failed", "SFTP");
      useConnectionStatusStore
        .getState()
        .setStatus(tabId, "error", isLabonairError(e) ? e.message : String(e));
    } finally {
      setIsReconnecting(false);
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
    let result = sftpShowHiddenFiles ? files : files.filter((f) => !f.name.startsWith("."));
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
        sessionId={tabId}
        hostId={tab.hostId}
        hostName={tab.title}
        connectionType="sftp"
        onConnected={() => {
          setIsConnected(true);
          useConnectionStatusStore.getState().setStatus(tabId, "connected");
        }}
        onError={(message) => {
          setHasError(true);
          useConnectionStatusStore.getState().setStatus(tabId, "error", message);
        }}
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
    <div
      className="flex flex-col h-full overflow-hidden bg-background"
      style={{ fontSize: `${sftpFontSize}px` }}
    >
      {/* Top host bar */}
      <div className="h-8 shrink-0 border-b border-border bg-card flex items-center px-4 gap-2">
        <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-widest select-none">
          SFTP
        </span>
        <span className="text-muted-foreground/40 text-xs select-none">—</span>
        <span className="text-xs font-medium text-foreground/80 select-none truncate">{hostLabel}</span>
      </div>

      {tabState?.disconnected && (
        <div className="h-8 shrink-0 border-b border-destructive/40 bg-destructive/10 flex items-center px-3 gap-2">
          <span className="text-[11px] text-destructive truncate flex-1">
            Connection lost{tabState.disconnectReason ? ` — ${tabState.disconnectReason}` : ""}
          </span>
          <button
            type="button"
            onClick={() => void handleReconnect()}
            disabled={isReconnecting}
            className="text-[11px] font-medium text-destructive underline decoration-dotted underline-offset-2 hover:text-destructive/80 disabled:opacity-50"
          >
            {isReconnecting ? "Reconnecting…" : "Reconnect"}
          </button>
        </div>
      )}

      <ResizablePanelGroup orientation="horizontal" className="flex-1 min-h-0">
        {/* LOCAL */}
        <ResizablePanel defaultSize={50} minSize={20}>
          <div
            ref={localPaneRef}
            className="flex flex-col h-full"
            // `onPointerDown` (not `onMouseDown`/`onClick`) so this still
            // fires even when an inner handler (e.g. the marquee-select
            // empty-space handler in VirtualizedFileList) calls
            // `preventDefault()` on its own pointerdown — that only
            // suppresses the browser's compatibility mouse events, not
            // pointerdown itself or its bubbling.
            onPointerDown={() => setActivePane("local")}
          >
            <PaneLabel
              label="LOCAL"
              count={displayedLocalFiles.length}
              selected={tabState?.selectedLocalPaths.size}
            />
            <SftpToolbar
              path={localPath}
              onNavigate={(p) => loadLocalDir(tabId, p)}
              showHidden={sftpShowHiddenFiles}
              onToggleHidden={toggleSftpHiddenFiles}
              bookmarkKey="local"
            />
            {creatingFolderSide === "local" && (
              <NewFolderInput
                value={newFolderName}
                onChange={setNewFolderName}
                onCommit={() => commitNewFolder("local")}
                onCancel={() => {
                  setCreatingFolderSide(null);
                  setNewFolderName("");
                }}
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
                onStartNewFolder={() => {
                  setCreatingFolderSide("local");
                  setNewFolderName("");
                }}
                onOpenRemoteEditor={onOpenRemoteEditor}
              >
                <div className="h-full">
                  <VirtualizedFileList
                    files={displayedLocalFiles}
                    selectedPaths={tabState?.selectedLocalPaths ?? new Set()}
                    onSelect={handleLocalSelect}
                    onDoubleClick={handleLocalDoubleClick}
                    isLoading={tabState?.isLoadingLocal}
                    onMarqueeSelect={(paths, additive) => {
                      const base = additive ? new Set(tabState?.selectedLocalPaths) : new Set<string>();
                      paths.forEach((p) => base.add(p));
                      selectLocalPaths(base);
                    }}
                    draggable
                    onDragStart={(paths) => startDrag("local", paths)}
                    dropDirection={activeDragSource === "remote" ? "download" : undefined}
                    isDropHovered={dropHoveredPane === "local"}
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
          <div
            ref={remotePaneRef}
            className="flex flex-col h-full relative"
            onPointerDown={() => setActivePane("remote")}
          >
            <PaneLabel
              label={deepSearchResults !== null ? `SEARCH RESULTS (${deepSearchResults.length})` : "REMOTE"}
              count={deepSearchResults !== null ? deepSearchResults.length : displayedRemoteFiles.length}
              selected={tabState?.selectedRemotePaths.size}
            />
            <SftpToolbar
              key={`toolbar-remote-${remotePath}`}
              path={remotePath}
              onNavigate={(p) => {
                setDeepSearchResults(null);
                loadRemoteDir(tabId, p);
              }}
              showOpenTerminal
              onOpenTerminal={() => onOpenSshTerminal?.(tab.hostId, hostLabel, remotePath)}
              showHidden={sftpShowHiddenFiles}
              onToggleHidden={toggleSftpHiddenFiles}
              bookmarkKey={hostAddress || undefined}
              onDeepSearch={handleDeepSearch}
              isSearching={isDeepSearching}
            />
            {creatingFolderSide === "remote" && (
              <NewFolderInput
                value={newFolderName}
                onChange={setNewFolderName}
                onCommit={() => commitNewFolder("remote")}
                onCancel={() => {
                  setCreatingFolderSide(null);
                  setNewFolderName("");
                }}
              />
            )}

            {/* Deep search results overlay or normal file list */}
            {deepSearchResults !== null ? (
              <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
                <div className="h-7 shrink-0 px-3 flex items-center gap-2 border-b border-border bg-warning/5">
                  <span className="text-[10px] text-warning/80 flex-1 truncate">
                    Results in {remotePath} — click to navigate to parent folder
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
                          onClick={() => {
                            setDeepSearchResults(null);
                            loadRemoteDir(tabId, dir);
                          }}
                          className={cn(
                            "w-full flex flex-col px-3 py-1.5 text-left",
                            "hover:bg-accent/50 focus:bg-accent/30 transition-colors",
                            "border-b border-border/30 focus:outline-none",
                          )}
                          tabIndex={0}
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
                  onStartNewFolder={() => {
                    setCreatingFolderSide("remote");
                    setNewFolderName("");
                  }}
                  onOpenRemoteEditor={onOpenRemoteEditor}
                >
                  <div className="h-full">
                    <VirtualizedFileList
                      files={displayedRemoteFiles}
                      selectedPaths={tabState?.selectedRemotePaths ?? new Set()}
                      onSelect={handleRemoteSelect}
                      onDoubleClick={handleRemoteDoubleClick}
                      isLoading={tabState?.isLoadingRemote}
                      onMarqueeSelect={(paths, additive) => {
                        const base = additive ? new Set(tabState?.selectedRemotePaths) : new Set<string>();
                        paths.forEach((p) => base.add(p));
                        selectRemotePaths(base);
                      }}
                      draggable
                      onDragStart={(paths) => startDrag("remote", paths)}
                      dropDirection={activeDragSource === "local" ? "upload" : undefined}
                      isDropHovered={dropHoveredPane === "remote"}
                      renamingPath={renamingPath}
                      renameValue={renameValue}
                      onRenameChange={setRenameValue}
                      onRenameCommit={() => commitRename("remote")}
                      onRenameCancel={() => setRenamingPath(null)}
                      hasMore={tabState?.remoteHasMore}
                      onLoadMore={() => loadMoreRemoteDir(tabId)}
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
