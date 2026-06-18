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

type StatusConfig = {
  letter: string;
  className: string;
};

const STATUS_LABELS: Record<string, string> = {
  M: "Modified",
  A: "Added",
  D: "Deleted",
  R: "Renamed",
  C: "Copied",
  U: "Conflict",
  "?": "Untracked",
};

function getStatusConfig(statusChar: string): StatusConfig {
  switch (statusChar) {
    case "M":
      return { letter: "M", className: "bg-yellow-500/20 text-yellow-500" };
    case "A":
      return { letter: "A", className: "bg-green-500/20 text-green-500" };
    case "D":
      return { letter: "D", className: "bg-red-500/20 text-red-500" };
    case "R":
      return { letter: "R", className: "bg-blue-500/20 text-blue-400" };
    case "C":
      return { letter: "C", className: "bg-blue-500/20 text-blue-400" };
    case "U":
      return { letter: "U", className: "bg-orange-500/20 text-orange-400" };
    case "?":
      return { letter: "?", className: "bg-muted text-muted-foreground" };
    default:
      return { letter: statusChar || "?", className: "bg-muted text-muted-foreground" };
  }
}

export function FileChangeItem({ file, section, onRefresh }: FileChangeItemProps) {
  const repoRoot = useSourceControlStore((s) => s.repoRoot);
  const selectionMode = useSourceControlStore((s) => s.selectionMode);
  const selectFile = useSourceControlStore((s) => s.selectFile);

  const isStaged = section === "staged";
  const statusChar = isStaged ? file.indexStatus : file.worktreeStatus;
  const { letter, className: statusClassName } = getStatusConfig(statusChar);
  const isSelected =
    selectionMode?.type === 'file' &&
    selectionMode.path === file.path &&
    selectionMode.staged === isStaged;

  // Split path into directory + filename for display
  const pathParts = file.path.split("/");
  const fileName = pathParts[pathParts.length - 1] ?? file.path;
  const dirPath = pathParts.length > 1 ? pathParts.slice(0, -1).join("/") + "/" : "";

  // For renames we keep simple display
  const isRename = !!file.originalPath;

  async function handleStage(e: React.MouseEvent) {
    e.stopPropagation();
    if (!repoRoot) return;
    try {
      await git.stageFile(repoRoot, file.path);
      onRefresh();
    } catch {
      // ignore
    }
  }

  async function handleUnstage(e: React.MouseEvent) {
    e.stopPropagation();
    if (!repoRoot) return;
    try {
      await git.unstageFile(repoRoot, file.path);
      onRefresh();
    } catch {
      // ignore
    }
  }

  async function handleDiscard() {
    if (!repoRoot) return;
    try {
      await git.discardFile(repoRoot, file.path);
      onRefresh();
    } catch {
      // ignore
    }
  }

  return (
    <div
      className={cn(
        "group/item flex h-6 cursor-pointer items-center gap-1.5 rounded px-2 transition-colors",
        isSelected ? "bg-accent/50" : "hover:bg-accent/30"
      )}
      onClick={() => selectFile(file.path, isStaged)}
      title={file.path}
    >
      {/* Status letter badge */}
      <span
        className={cn(
          "flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded text-[9px] font-bold leading-none",
          statusClassName
        )}
        title={STATUS_LABELS[letter] ?? letter}
      >
        {letter}
      </span>

      {/* Path: dim directory + bold filename, or rename display */}
      <span className="flex min-w-0 flex-1 items-baseline gap-0 truncate">
        {isRename ? (
          <span className="truncate text-[11px] text-foreground/75">
            {basename(file.path)}
            <span className="mx-1 text-muted-foreground/40">←</span>
            {basename(file.originalPath!)}
          </span>
        ) : (
          <>
            {dirPath && (
              <span className="shrink truncate text-[10px] text-muted-foreground/40">
                {dirPath}
              </span>
            )}
            <span className="shrink-0 text-[11px] font-medium text-foreground/85">
              {fileName}
            </span>
          </>
        )}
      </span>

      {/* Action buttons — visible on hover */}
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
        {section === "unstaged" && (
          <>
            <button
              type="button"
              className="flex h-4 w-4 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={handleStage}
              title="Stage"
            >
              <HugeiconsIcon icon={PlusSignIcon} size={10} strokeWidth={2} />
            </button>
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
          </>
        )}
        {section === "untracked" && (
          <button
            type="button"
            className="flex h-4 w-4 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={handleStage}
            title="Stage"
          >
            <HugeiconsIcon icon={PlusSignIcon} size={10} strokeWidth={2} />
          </button>
        )}
      </div>
    </div>
  );
}
