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
import { useTabs } from "@/modules/tabs";
import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";

interface SftpContextMenuProps {
  tabId: string;
  side: "local" | "remote";
  selectedPaths: Set<string>;
  currentPath?: string;
  onRefresh: () => void;
  onStartRename?: (path: string) => void;
  onStartNewFolder?: () => void;
  children: React.ReactNode;
}

export function SftpContextMenu({
  tabId,
  side,
  selectedPaths,
  onRefresh,
  onStartRename,
  onStartNewFolder,
  children,
}: SftpContextMenuProps) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [chmodOpen, setChmodOpen] = useState(false);
  const [chmodValue, setChmodValue] = useState("755");
  const { openRemoteEditorTab } = useTabs();

  const count = selectedPaths.size;
  const singlePath = count === 1 ? [...selectedPaths][0] : null;

  async function handleDelete() {
    if (count === 0) return;
    try {
      if (side === "remote") {
        await invoke("sftp_delete", { tab_id: tabId, paths: [...selectedPaths] });
      } else {
        // Local deletion: use Tauri fs commands (not implemented here — placeholder)
        console.warn("Local delete not yet implemented");
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
      await invoke("sftp_chmod", { tab_id: tabId, path: singlePath, permissions: octal });
      onRefresh();
    } catch (e) {
      console.error("Chmod failed:", e);
    }
  }

  function handleCopyPath() {
    const text = [...selectedPaths].join("\n");
    navigator.clipboard.writeText(text).catch(console.error);
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
                Permissions…
              </ContextMenuItem>
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

      {/* Chmod dialog */}
      {chmodOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={(e) => { if (e.target === e.currentTarget) setChmodOpen(false); }}
        >
          <div className="bg-card border border-border rounded-lg p-5 w-72 shadow-xl">
            <p className="text-sm font-semibold text-foreground mb-1">
              Set Permissions
            </p>
            <p className="text-xs text-muted-foreground mb-3 truncate">
              {singlePath}
            </p>
            <input
              value={chmodValue}
              onChange={(e) => setChmodValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { handleChmod(); setChmodOpen(false); }
                if (e.key === "Escape") setChmodOpen(false);
              }}
              placeholder="755"
              maxLength={4}
              className="w-full h-8 px-2 text-sm font-mono rounded bg-muted/30 border border-border text-foreground focus:outline-none focus:border-primary mb-4"
              autoFocus
            />
            <div className="flex gap-2 justify-end">
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
            </div>
          </div>
        </div>
      )}
    </>
  );
}
