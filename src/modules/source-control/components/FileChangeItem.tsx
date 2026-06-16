import { cn } from "@/lib/utils";
import { PlusSignIcon, MinusSignIcon, Delete01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
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
  const selectedFile = useSourceControlStore((s) => s.selectedFile);
  const selectFile = useSourceControlStore((s) => s.selectFile);

  const isStaged = section === "staged";
  const statusChar = isStaged ? file.indexStatus : file.worktreeStatus;
  const { letter, className: statusClassName } = getStatusConfig(statusChar);
  const isSelected =
    selectedFile?.path === file.path && selectedFile?.staged === isStaged;

  // For renames: show "newName ← oldName"
  const displayName =
    file.originalPath
      ? `${basename(file.path)} ← ${basename(file.originalPath)}`
      : basename(file.path);

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

  async function handleDiscard(e: React.MouseEvent) {
    e.stopPropagation();
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
        "group/item flex h-[22px] cursor-pointer items-center gap-1 rounded px-1 transition-colors",
        isSelected ? "bg-accent/50" : "hover:bg-accent/30"
      )}
      onClick={() => selectFile(file.path, isStaged)}
      title={file.path}
    >
      {/* Status letter badge */}
      <span
        className={cn(
          "flex h-4 w-4 shrink-0 items-center justify-center rounded text-[9px] font-bold leading-none",
          statusClassName
        )}
      >
        {letter}
      </span>

      {/* Filename */}
      <span className="flex-1 truncate text-[11px] text-foreground/80">
        {displayName}
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
            <button
              type="button"
              className="flex h-4 w-4 items-center justify-center rounded text-muted-foreground hover:bg-red-500/20 hover:text-red-500"
              onClick={handleDiscard}
              title="Discard changes"
            >
              <HugeiconsIcon icon={Delete01Icon} size={10} strokeWidth={2} />
            </button>
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
