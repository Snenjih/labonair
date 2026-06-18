import { cn } from "@/lib/utils";
import { PlusSignIcon, MinusSignIcon, Delete01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useTabsStore } from "@/modules/tabs/store/tabsStore";
import { useSourceControlStore } from "../store/sourceControlStore";
import { git } from "../lib/gitInvoke";
import type { FileStatus } from "../types";

interface FileChangeItemProps {
  file: FileStatus;
  section: "staged" | "unstaged" | "untracked";
  onRefresh: () => void;
}

function basename(path: string): string {
  const parts = path.split("/").filter(Boolean);
  return parts.length ? parts[parts.length - 1] : path;
}

const STATUS_COLORS: Record<string, string> = {
  M: "bg-yellow-500/20 text-yellow-500",
  A: "bg-green-500/20 text-green-500",
  D: "bg-red-500/20 text-red-500",
  R: "bg-blue-500/20 text-blue-400",
  C: "bg-blue-500/20 text-blue-400",
  U: "bg-orange-500/20 text-orange-400",
  "?": "bg-muted/80 text-muted-foreground/60",
};

export function FileChangeItem({ file, section, onRefresh }: FileChangeItemProps) {
  const repoRoot = useSourceControlStore((s) => s.repoRoot);
  const diffStats = useSourceControlStore((s) => s.diffStats);
  const openGitDiffTab = useTabsStore((s) => s.openGitDiffTab);

  const isStaged = section === "staged";
  const statusChar = isStaged ? file.indexStatus : file.worktreeStatus;
  const statusColor = STATUS_COLORS[statusChar] ?? "bg-muted/80 text-muted-foreground/60";

  // Find stats for this file in this section
  const stat = diffStats.find((s) => s.path === file.path && s.staged === isStaged)
    ?? diffStats.find((s) => s.path === file.path);

  // Path decomposition
  const pathParts = file.path.split("/");
  const fileName = pathParts[pathParts.length - 1] ?? file.path;
  const dirPath = pathParts.length > 1 ? "..." + pathParts.slice(-2, -1).join("") + "/" : "";

  const isRename = !!file.originalPath;

  async function handleStage(e: React.MouseEvent) {
    e.stopPropagation();
    if (!repoRoot) return;
    try {
      await git.stageFile(repoRoot, file.path);
      onRefresh();
    } catch { /* ignore */ }
  }

  async function handleUnstage(e: React.MouseEvent) {
    e.stopPropagation();
    if (!repoRoot) return;
    try {
      await git.unstageFile(repoRoot, file.path);
      onRefresh();
    } catch { /* ignore */ }
  }

  async function handleDiscard() {
    if (!repoRoot) return;
    try {
      await git.discardFile(repoRoot, file.path);
      onRefresh();
    } catch { /* ignore */ }
  }

  function handleClick() {
    if (!repoRoot) return;
    openGitDiffTab(repoRoot, file.path, isStaged, section);
  }

  return (
    <div
      className="group/item flex h-7 cursor-pointer items-center gap-2 rounded px-2 transition-colors hover:bg-accent/30"
      onClick={handleClick}
      title={file.path}
    >
      {/* Status badge */}
      <span
        className={cn(
          "flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded text-[9px] font-bold leading-none",
          statusColor,
        )}
      >
        {statusChar}
      </span>

      {/* Filename */}
      <span className="min-w-0 shrink-0 text-[11.5px] font-medium text-foreground/90 truncate max-w-[120px]">
        {isRename ? `${basename(file.path)} ← ${basename(file.originalPath!)}` : fileName}
      </span>

      {/* Truncated directory path */}
      {!isRename && dirPath && (
        <span className="min-w-0 flex-1 truncate text-[10px] text-muted-foreground/35">
          {dirPath}
        </span>
      )}
      {(isRename || !dirPath) && <span className="flex-1" />}

      {/* Diff stats */}
      {stat && (stat.added > 0 || stat.removed > 0) && (
        <span className="flex shrink-0 items-center gap-1 text-[10px] tabular-nums opacity-0 transition-opacity group-hover/item:opacity-100">
          {stat.added > 0 && <span className="font-medium text-green-500">+{stat.added}</span>}
          {stat.removed > 0 && <span className="font-medium text-red-500">−{stat.removed}</span>}
        </span>
      )}

      {/* Action buttons — always reserve space, show on hover */}
      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover/item:opacity-100">
        {section === "staged" && (
          <button
            type="button"
            className="flex h-4 w-4 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={handleUnstage}
            title="Unstage"
          >
            <HugeiconsIcon icon={MinusSignIcon} size={10} strokeWidth={2} />
          </button>
        )}
        {(section === "unstaged" || section === "untracked") && (
          <>
            <button
              type="button"
              className="flex h-4 w-4 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={handleStage}
              title="Stage"
            >
              <HugeiconsIcon icon={PlusSignIcon} size={10} strokeWidth={2} />
            </button>
            {section === "unstaged" && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <button
                    type="button"
                    className="flex h-4 w-4 items-center justify-center rounded text-muted-foreground hover:bg-red-500/20 hover:text-red-500"
                    onClick={(e) => e.stopPropagation()}
                    title="Discard changes"
                  >
                    <HugeiconsIcon icon={Delete01Icon} size={10} strokeWidth={2} />
                  </button>
                </AlertDialogTrigger>
                <AlertDialogContent size="sm">
                  <AlertDialogHeader>
                    <AlertDialogTitle>Discard changes?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently discard all changes to{" "}
                      <span className="font-mono text-foreground">{basename(file.path)}</span>. This
                      cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => void handleDiscard()}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Discard
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </>
        )}
      </div>
    </div>
  );
}
