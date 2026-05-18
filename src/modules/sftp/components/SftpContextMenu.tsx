import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTabs } from "@/modules/tabs";
import { invoke } from "@tauri-apps/api/core";
import { open as dialogOpen } from "@tauri-apps/plugin-dialog";
import { useState } from "react";
import { useBookmarksStore } from "../store/bookmarksStore";
import type { FileNode } from "../types";
import { PropertiesDialog } from "./PropertiesDialog";

interface SftpContextMenuProps {
  tabId: string;
  hostId?: string;
  side: "local" | "remote";
  selectedPaths: Set<string>;
  currentPath?: string;
  hostAddress?: string;
  files?: FileNode[];
  onRefresh: () => void;
  onStartRename?: (path: string) => void;
  onStartNewFolder?: () => void;
  children: React.ReactNode;
}

export function SftpContextMenu({
  tabId,
  hostId: _hostId,
  side,
  selectedPaths,
  currentPath,
  hostAddress,
  files,
  onRefresh,
  onStartRename,
  onStartNewFolder,
  children,
}: SftpContextMenuProps) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [chmodOpen, setChmodOpen] = useState(false);
  const [chmodValue, setChmodValue] = useState("755");
  const [propertiesFile, setPropertiesFile] = useState<FileNode | null>(null);
  const { openRemoteEditorTab } = useTabs();
  const addBookmark = useBookmarksStore((s) => s.addBookmark);

  const count = selectedPaths.size;
  const singlePath = count === 1 ? [...selectedPaths][0] : null;
  const singleFile = singlePath ? files?.find((f) => f.path === singlePath) ?? null : null;

  async function handleDelete() {
    if (count === 0) return;
    try {
      if (side === "remote") {
        await invoke("sftp_delete", { sessionId: tabId, paths: [...selectedPaths] });
      } else {
        await Promise.all([...selectedPaths].map((p) => invoke("fs_delete", { path: p })));
      }
      onRefresh();
    } catch (e) {
      console.error("Delete failed:", e);
    }
  }

  async function handleChmod() {
    if (!singlePath) return;
    const octal = parseInt(chmodValue, 8);
    if (isNaN(octal)) return;
    try {
      await invoke("sftp_chmod", { sessionId: tabId, path: singlePath, permissions: octal });
      onRefresh();
    } catch (e) {
      console.error("Chmod failed:", e);
    }
  }

  function handleCopyPath() {
    const text = [...selectedPaths].join("\n");
    navigator.clipboard.writeText(text).catch(console.error);
  }

  async function handleDownloadTo() {
    if (count === 0 || !tabId) return;
    const dest = await dialogOpen({ directory: true, multiple: false, title: "Choose download folder" });
    if (!dest || typeof dest !== "string") return;
    for (const remotePath of selectedPaths) {
      const fileName = remotePath.split("/").pop() ?? "file";
      const destPath = `${dest}/${fileName}`;
      try {
        await invoke("enqueue_transfer", {
          sessionId: tabId,
          srcPath: remotePath,
          destPath,
          direction: "download",
        });
      } catch (e) {
        console.error("Download to enqueue failed:", e);
      }
    }
  }

  async function handleUploadHere() {
    if (!tabId || !currentPath) return;
    const selected = await dialogOpen({ multiple: true, directory: false, title: "Choose files to upload" });
    if (!selected) return;
    const paths = Array.isArray(selected) ? selected : [selected];
    for (const localPath of paths) {
      const fileName = localPath.split(/[\\/]/).pop() ?? "file";
      const sep = currentPath.endsWith("/") ? "" : "/";
      const destPath = `${currentPath}${sep}${fileName}`;
      try {
        await invoke("enqueue_transfer", {
          sessionId: tabId,
          srcPath: localPath,
          destPath,
          direction: "upload",
        });
      } catch (e) {
        console.error("Upload here enqueue failed:", e);
      }
    }
  }

  function handleBookmark() {
    const path = singlePath ?? currentPath;
    if (!path) return;
    // Use || so an empty string also falls back to "remote" (not just null/undefined).
    const key = side === "remote" ? (hostAddress || "remote") : "local";
    void addBookmark(key, path);
  }

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
        <ContextMenuContent className="w-52">
          <ContextMenuItem onClick={() => onStartNewFolder?.()}>
            New Folder
          </ContextMenuItem>

          {count === 1 && (
            <ContextMenuItem onClick={() => onStartRename?.(singlePath!)}>
              Rename
            </ContextMenuItem>
          )}

          <ContextMenuSeparator />

          {/* OS-native download (remote → local) */}
          {side === "remote" && count > 0 && (
            <ContextMenuItem onClick={handleDownloadTo}>
              Download to…
            </ContextMenuItem>
          )}

          {/* OS-native upload (local files → remote) */}
          {side === "remote" && (
            <ContextMenuItem onClick={handleUploadHere}>
              Upload files here…
            </ContextMenuItem>
          )}

          {(side === "remote" && count >= 0) && <ContextMenuSeparator />}

          {/* Bookmark current path or selected item */}
          <ContextMenuItem onClick={handleBookmark}>
            Bookmark this path
          </ContextMenuItem>

          <ContextMenuSeparator />

          {count > 0 && (
            <ContextMenuItem
              onClick={() => setDeleteOpen(true)}
              className="text-destructive focus:text-destructive"
            >
              Delete{count > 1 ? ` ${count} items` : ""}…
            </ContextMenuItem>
          )}

          {count > 0 && (
            <ContextMenuItem onClick={handleCopyPath}>
              Copy Path{count > 1 ? "s" : ""}
            </ContextMenuItem>
          )}

          {side === "remote" && count === 1 && (
            <>
              <ContextMenuSeparator />
              <ContextMenuItem onClick={() => { setChmodValue("755"); setChmodOpen(true); }}>
                Quick Permissions…
              </ContextMenuItem>
              {singleFile && (
                <ContextMenuItem onClick={() => setPropertiesFile(singleFile)}>
                  Properties…
                </ContextMenuItem>
              )}
              <ContextMenuItem
                onClick={async () => {
                  if (!singlePath) return;
                  try {
                    await openRemoteEditorTab(tabId, singlePath);
                  } catch (e) {
                    alert(String(e));
                  }
                }}
              >
                Edit Remote File
              </ContextMenuItem>
            </>
          )}
        </ContextMenuContent>
      </ContextMenu>

      {/* Delete confirmation */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {count} item{count !== 1 ? "s" : ""}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The{" "}
              {count === 1 ? "file" : "files"} will be permanently deleted
              from the {side === "remote" ? "remote server" : "local disk"}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Quick chmod dialog — only mounted when open to avoid Radix portal side-effects */}
      {chmodOpen && (
        <Dialog open onOpenChange={(v) => { if (!v) setChmodOpen(false); }}>
          <DialogContent className="w-72">
            <DialogHeader>
              <DialogTitle className="text-sm">Set Permissions</DialogTitle>
              <p className="text-xs text-muted-foreground truncate">{singlePath}</p>
            </DialogHeader>
            <input
              value={chmodValue}
              onChange={(e) => setChmodValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { handleChmod(); setChmodOpen(false); }
              }}
              placeholder="755"
              maxLength={4}
              className="w-full h-8 px-2 text-sm font-mono rounded bg-muted/30 border border-border text-foreground focus:outline-none focus:border-primary"
              autoFocus
            />
            <DialogFooter>
              <button
                onClick={() => setChmodOpen(false)}
                className="h-7 px-3 text-xs rounded bg-muted/30 text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
              <button
                onClick={() => { handleChmod(); setChmodOpen(false); }}
                className="h-7 px-3 text-xs rounded bg-primary text-primary-foreground hover:bg-primary/90"
              >
                Apply
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Full Properties dialog */}
      {propertiesFile && (
        <PropertiesDialog
          open={!!propertiesFile}
          onClose={() => setPropertiesFile(null)}
          file={propertiesFile}
          tabId={tabId}
        />
      )}
    </>
  );
}
