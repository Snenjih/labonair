import {
  Cancel01Icon,
  FileAddIcon,
  Folder01Icon,
  FolderAddIcon,
  Refresh01Icon,
  Search01Icon,
  ViewIcon,
  ViewOffSlashIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { handleApiError } from "@/lib/errors";
import { useHostsStore } from "@/modules/hosts";
import { ExplorerAuthPrompt } from "./components/ExplorerAuthPrompt";
import { VirtualizedTreeList } from "./components/VirtualizedTreeList";
import { buildTreeRows } from "./lib/buildTreeRows";
import { copyToClipboard, revealInFinder } from "./lib/contextActions";
import type { SearchHit } from "./lib/fsProvider";
import { fileIconUrl, folderIconUrl } from "./lib/iconResolver";
import { COMPACT_CONTENT, COMPACT_ITEM } from "./lib/menuItemClass";
import { createLocalFsProvider } from "./lib/providers/localFsProvider";
import { createRemoteFsProvider } from "./lib/providers/remoteFsProvider";
import type { ExplorerTarget } from "./lib/useExplorerTarget";
import { useFileTree } from "./lib/useFileTree";
import { useLazyExplorerSession } from "./lib/useLazyExplorerSession";
import { useOsFileDrop } from "./lib/useOsFileDrop";

type Props = {
  explorerTarget: ExplorerTarget;
  onOpenFile: (path: string) => void;
  /** Opens a remote path via the same prepare_remote_edit flow the SFTP dual-pane
   *  tab already uses. Required for remote browsing to do anything useful on
   *  file click — `onOpenFile` alone would try to open the (nonexistent) local
   *  path. */
  onOpenRemoteFile?: (sessionId: string, path: string) => void;
  onOpenPreview?: (path: string) => void;
  onPathRenamed?: (from: string, to: string) => void;
  onPathDeleted?: (path: string) => void;
  onRevealInTerminal?: (path: string) => void;
  onAttachToAgent?: (path: string) => void;
  /** Escape hatch from the auth-required state — opens a full SFTP tab, which
   *  has the interactive credential/2FA/host-key UI this narrow sidebar
   *  deliberately doesn't duplicate. */
  onOpenSftpTab?: (hostId: string, title: string) => void;
};

function basename(path: string): string {
  const parts = path.split("/").filter(Boolean);
  return parts.length ? parts[parts.length - 1] : path;
}

export function FileExplorer({
  explorerTarget,
  onOpenFile,
  onOpenRemoteFile,
  onOpenPreview,
  onPathRenamed,
  onPathDeleted,
  onRevealInTerminal,
  onAttachToAgent,
  onOpenSftpTab,
}: Props) {
  const hosts = useHostsStore((s) => s.hosts);

  // Only "lazy-session" targets (an SSH workspace tab with no SFTP tab open
  // for that host) need us to manage a connection's lifecycle — an "sftp-tab"
  // target already owns a live session via its own tab.
  const lazyHostId =
    explorerTarget.type === "remote" && explorerTarget.source === "lazy-session"
      ? explorerTarget.hostId
      : null;
  const lazySession = useLazyExplorerSession(lazyHostId);

  const activeSessionId =
    explorerTarget.type === "remote"
      ? explorerTarget.source === "sftp-tab"
        ? explorerTarget.sessionId
        : lazySession?.status === "connected"
          ? lazySession.sessionId
          : null
      : null;

  const localProvider = useMemo(() => createLocalFsProvider(), []);
  const provider = useMemo(() => {
    if (explorerTarget.type === "remote" && activeSessionId) {
      return createRemoteFsProvider(activeSessionId, explorerTarget.hostId);
    }
    return localProvider;
  }, [explorerTarget, activeSessionId, localProvider]);

  // Nothing is fetched until a remote session is actually ready — the tree
  // is fed a null root in the meantime (same "no root" idle state as local).
  const rootPath =
    explorerTarget.type === "local" ? explorerTarget.path : activeSessionId ? explorerTarget.path : null;

  const tree = useFileTree(provider, rootPath, { onPathRenamed, onPathDeleted });
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchHit[]>([]);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);

  // Native OS drag-drop needs a real local file handle to hand the OS — never
  // wired up for a remote target (see remoteFsProvider's supportsNativeDrag).
  const { dropTargetPath } = useOsFileDrop(
    explorerTarget.type === "local" ? rootPath : null,
    !!query.trim(),
    (destDir) => tree.refresh(destDir),
  );

  const handleOpenFile = (path: string) => {
    if (explorerTarget.type === "remote" && activeSessionId) {
      onOpenRemoteFile?.(activeSessionId, path);
    } else {
      onOpenFile(path);
    }
  };

  // These affordances assume a local path (local terminal cwd, local AI file
  // read, local preview URL) — meaningless for a remote path, so they're
  // simply not passed down for a remote target. FileTreeNode already renders
  // each of these conditionally on the callback being defined.
  const effectiveOnRevealInTerminal = explorerTarget.type === "local" ? onRevealInTerminal : undefined;
  const effectiveOnAttachToAgent = explorerTarget.type === "local" ? onAttachToAgent : undefined;
  const effectiveOnOpenPreview = explorerTarget.type === "local" ? onOpenPreview : undefined;

  // Single flattening pass feeds both the virtualized render and keyboard
  // navigation — `flat` is the entry-only subset `treeRows` already implies
  // (loading/error/pending-create rows aren't navigable targets).
  const treeRows = useMemo(
    () =>
      rootPath ? buildTreeRows(rootPath, tree.nodes, tree.expanded, tree.joinPath, tree.pendingCreate) : [],
    [rootPath, tree.nodes, tree.expanded, tree.joinPath, tree.pendingCreate],
  );
  type FlatItem = { path: string; isDir: boolean };
  const flat = useMemo<FlatItem[]>(
    () =>
      treeRows
        .filter((r) => r.kind === "entry")
        .map((r) => ({ path: r.path, isDir: r.entry.kind === "dir" })),
    [treeRows],
  );

  useEffect(() => {
    if (selectedPath && !flat.some((f) => f.path === selectedPath)) {
      setSelectedPath(null);
    }
  }, [flat, selectedPath]);

  useEffect(() => {
    if (!rootPath) return;
    const q = query.trim();
    if (!q) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    let alive = true;
    const handle = setTimeout(async () => {
      try {
        const hits = await provider.search(rootPath, q, {
          limit: 200,
          showHidden: tree.showHidden,
        });
        if (alive) setResults(hits);
      } catch (e) {
        if (alive) {
          handleApiError(e, "File search failed", "File Search");
          setResults([]);
        }
      } finally {
        if (alive) setSearching(false);
      }
    }, 120);
    return () => {
      alive = false;
      clearTimeout(handle);
    };
  }, [query, rootPath, provider]);

  // Lets the command palette (useExplorerCommands) drive this panel's
  // toolbar actions without threading callbacks through App.tsx/SidebarContent
  // — same window-event pattern as ssh.reconnect's "labonair:ssh-reconnect".
  // No-ops while a different sidebar panel is mounted instead of this one.
  useEffect(() => {
    if (!rootPath) return;
    const onRefresh = () => tree.refresh(rootPath);
    const onToggleHidden = () => {
      tree.toggleShowHidden();
      tree.refresh(rootPath);
    };
    const onNewFile = () => tree.beginCreate(rootPath, "file");
    const onNewFolder = () => tree.beginCreate(rootPath, "dir");
    window.addEventListener("labonair:explorer-refresh", onRefresh);
    window.addEventListener("labonair:explorer-toggle-hidden", onToggleHidden);
    window.addEventListener("labonair:explorer-new-file", onNewFile);
    window.addEventListener("labonair:explorer-new-folder", onNewFolder);
    return () => {
      window.removeEventListener("labonair:explorer-refresh", onRefresh);
      window.removeEventListener("labonair:explorer-toggle-hidden", onToggleHidden);
      window.removeEventListener("labonair:explorer-new-file", onNewFile);
      window.removeEventListener("labonair:explorer-new-folder", onNewFolder);
    };
  }, [rootPath, tree]);

  // A lazy remote session that isn't connected yet gets its own compact
  // state instead of the tree — deliberately not a full-screen loading
  // screen (see ExplorerAuthPrompt's doc comment).
  if (lazyHostId && (!lazySession || lazySession.status !== "connected")) {
    const host = hosts.find((h) => h.id === lazyHostId);
    return (
      <ExplorerAuthPrompt
        status={lazySession?.status ?? "connecting"}
        error={lazySession?.error ?? null}
        hostLabel={host?.name ?? lazyHostId}
        onReconnect={() => lazySession?.reconnect()}
        onOpenSftpTab={() => onOpenSftpTab?.(lazyHostId, host?.name ?? "SSH")}
      />
    );
  }

  if (!rootPath) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
        <HugeiconsIcon icon={Folder01Icon} size={24} strokeWidth={1.5} className="text-muted-foreground" />
        <div className="text-xs text-muted-foreground">No current directory</div>
      </div>
    );
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (tree.renaming || tree.pendingCreate || query.trim()) return;
    const target = e.target as HTMLElement;
    if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;
    if (flat.length === 0) return;

    const currentIdx = selectedPath ? flat.findIndex((f) => f.path === selectedPath) : -1;

    const move = (next: number) => {
      const clamped = Math.max(0, Math.min(flat.length - 1, next));
      // VirtualizedTreeList scrolls the new selection into view reactively
      // (via useVirtualizer's index-based scrollToIndex) once selectedPath
      // changes — no DOM query needed here.
      setSelectedPath(flat[clamped].path);
    };

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        move(currentIdx < 0 ? 0 : currentIdx + 1);
        break;
      case "ArrowUp":
        e.preventDefault();
        move(currentIdx < 0 ? flat.length - 1 : currentIdx - 1);
        break;
      case "ArrowRight": {
        if (currentIdx < 0) return;
        e.preventDefault();
        const item = flat[currentIdx];
        if (item.isDir) {
          if (!tree.expanded.has(item.path)) tree.toggle(item.path);
          else move(currentIdx + 1);
        }
        break;
      }
      case "ArrowLeft": {
        if (currentIdx < 0) return;
        e.preventDefault();
        const item = flat[currentIdx];
        if (item.isDir && tree.expanded.has(item.path)) {
          tree.toggle(item.path);
        } else {
          const parent = item.path.slice(0, item.path.lastIndexOf("/"));
          if (parent && parent !== rootPath) setSelectedPath(parent);
        }
        break;
      }
      case "Enter":
        if (currentIdx < 0) return;
        e.preventDefault();
        {
          const item = flat[currentIdx];
          if (item.isDir) tree.toggle(item.path);
          else handleOpenFile(item.path);
        }
        break;
    }
  };

  return (
    <div className="flex h-full flex-col outline-none" tabIndex={0} onKeyDown={handleKeyDown}>
      <div className="flex h-8 shrink-0 items-center gap-1 border-b border-border/60 px-2">
        <span className="flex-1 flex truncate text-xs font-medium text-foreground/80" title={rootPath}>
          <img
            src={folderIconUrl(basename(rootPath), false)}
            alt=""
            height={15}
            width={15}
            className="mx-1.5"
          />
          {basename(rootPath)}
        </span>

        <Button
          variant="ghost"
          size="icon"
          className="size-6 text-muted-foreground hover:text-foreground"
          onClick={() => setIsSearchOpen(!isSearchOpen)}
          title="New file"
        >
          <HugeiconsIcon icon={Search01Icon} size={13} strokeWidth={2} />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="size-6 text-muted-foreground hover:text-foreground"
          onClick={() => tree.beginCreate(rootPath, "file")}
          title="New file"
        >
          <HugeiconsIcon icon={FileAddIcon} size={13} strokeWidth={2} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-6 text-muted-foreground hover:text-foreground"
          onClick={() => tree.beginCreate(rootPath, "dir")}
          title="New folder"
        >
          <HugeiconsIcon icon={FolderAddIcon} size={13} strokeWidth={2} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-6 text-muted-foreground hover:text-foreground"
          onClick={() => tree.refresh(rootPath)}
          title="Refresh"
        >
          <HugeiconsIcon icon={Refresh01Icon} size={12} strokeWidth={2} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className={`size-6 hover:text-foreground ${tree.showHidden ? "text-foreground" : "text-muted-foreground"}`}
          onClick={() => {
            tree.toggleShowHidden();
            tree.refresh(rootPath);
          }}
          title={tree.showHidden ? "Hide hidden files" : "Show hidden files"}
        >
          <HugeiconsIcon icon={tree.showHidden ? ViewIcon : ViewOffSlashIcon} size={13} strokeWidth={2} />
        </Button>
      </div>

      {isSearchOpen && (
        <motion.div
          className="relative shrink-0 px-2 py-1.5"
          initial={{ opacity: 0, transform: "translateY(-15px)" }}
          animate={{ opacity: 1, transform: "translateY(0px)" }}
        >
          <HugeiconsIcon
            icon={Search01Icon}
            size={13}
            strokeWidth={2}
            className="absolute top-1/2 left-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search files…"
            className="h-7 pr-7 pl-6.5 text-xs"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute top-1/2 right-3.5 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label="Clear search"
            >
              <HugeiconsIcon icon={Cancel01Icon} size={11} strokeWidth={2} />
            </button>
          ) : null}
        </motion.div>
      )}

      {query.trim() ? (
        <ScrollArea className="min-h-0 flex-1">
          <div className="py-1">
            {searching && results.length === 0 ? (
              <div className="px-3 py-2 text-[11px] text-muted-foreground">Searching…</div>
            ) : results.length === 0 ? (
              <div className="px-3 py-2 text-[11px] text-muted-foreground">No matches</div>
            ) : (
              results.map((hit) => {
                const url = hit.is_dir ? null : fileIconUrl(hit.name);
                return (
                  <button
                    key={hit.path}
                    type="button"
                    onClick={() => {
                      if (!hit.is_dir) handleOpenFile(hit.path);
                    }}
                    className="flex w-full items-center gap-1.5 px-2 py-1 text-left text-xs hover:bg-accent"
                    title={hit.path}
                  >
                    {url ? (
                      <img src={url} alt="" className="size-3.5 shrink-0" />
                    ) : (
                      <HugeiconsIcon
                        icon={Folder01Icon}
                        size={13}
                        strokeWidth={1.75}
                        className="shrink-0 text-muted-foreground"
                      />
                    )}
                    <span className="truncate">{hit.name}</span>
                    <span className="ml-auto truncate text-[10px] text-muted-foreground">{hit.rel}</span>
                  </button>
                );
              })
            )}
          </div>
        </ScrollArea>
      ) : (
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <div className="relative min-h-0 flex-1">
              {dropTargetPath === rootPath && (
                <div className="pointer-events-none absolute inset-0 z-10 rounded-sm ring-2 ring-inset ring-primary/60 bg-primary/5" />
              )}
              <VirtualizedTreeList
                rows={treeRows}
                rootPath={rootPath}
                tree={tree}
                onOpenFile={handleOpenFile}
                onOpenPreview={effectiveOnOpenPreview}
                onRevealInTerminal={effectiveOnRevealInTerminal}
                onAttachToAgent={effectiveOnAttachToAgent}
                selectedPath={selectedPath}
                onSelectPath={setSelectedPath}
                dropTargetPath={dropTargetPath}
              />
            </div>
          </ContextMenuTrigger>
          <ContextMenuContent className={COMPACT_CONTENT}>
            {effectiveOnRevealInTerminal && (
              <ContextMenuItem
                className={COMPACT_ITEM}
                onSelect={() => effectiveOnRevealInTerminal(rootPath)}
              >
                Open in Terminal
              </ContextMenuItem>
            )}
            {tree.capabilities.supportsReveal && (
              <ContextMenuItem className={COMPACT_ITEM} onSelect={() => void revealInFinder(rootPath)}>
                Reveal in Finder
              </ContextMenuItem>
            )}
            <ContextMenuSeparator />
            <ContextMenuItem className={COMPACT_ITEM} onSelect={() => tree.beginCreate(rootPath, "file")}>
              New File
            </ContextMenuItem>
            <ContextMenuItem className={COMPACT_ITEM} onSelect={() => tree.beginCreate(rootPath, "dir")}>
              New Folder
            </ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem className={COMPACT_ITEM} onSelect={() => void copyToClipboard(rootPath)}>
              Copy Path
            </ContextMenuItem>
            <ContextMenuItem className={COMPACT_ITEM} onSelect={() => tree.refresh(rootPath)}>
              Refresh
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      )}
    </div>
  );
}
