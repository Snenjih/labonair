import { useState } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { cn } from "@/lib/utils";
import { useNotificationStore } from "@/modules/notifications/store/useNotificationStore";
import { useTabsStore } from "@/modules/tabs/store/tabsStore";
import { git } from "../lib/gitInvoke";
import { useSourceControlStore } from "../store/sourceControlStore";
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
  M: "bg-warning/20 text-warning",
  A: "bg-success/20 text-success",
  D: "bg-error/20 text-error",
  R: "bg-info/20 text-info",
  C: "bg-info/20 text-info",
  U: "bg-warning/20 text-warning",
  "?": "bg-muted/80 text-muted-foreground",
};

export function FileChangeItem({ file, section, onRefresh }: FileChangeItemProps) {
  const repoRoot = useSourceControlStore((s) => s.repoRoot);
  const sessionId = useSourceControlStore((s) => s.sessionId);
  const hostId = useSourceControlStore((s) => s.hostId);
  const diffStats = useSourceControlStore((s) => s.diffStats);
  const openGitDiffTab = useTabsStore((s) => s.openGitDiffTab);
  const setDiffViewMode = useSourceControlStore((s) => s.setDiffViewMode);

  const [showDiscard, setShowDiscard] = useState(false);

  const isStaged = section === "staged";
  const rawStatusChar = isStaged ? file.indexStatus : file.worktreeStatus;
  // A submodule gitlink entry still carries a normal M/A/D-style status char
  // (from the superproject's point of view), but that alone can't tell a
  // "submodule commit pointer changed" from a "submodule's own worktree is
  // dirty" — both need to render distinguishably, not as a generic "M". The
  // dedicated "S" badge below always wins over the raw status char when
  // `file.submodule` is present (recognize + label only, per this feature's
  // scope — no recursive submodule diff/stage/commit UI).
  const submoduleLabel = file.submodule
    ? file.submodule.commitChanged
      ? "Submodule: checked-out commit differs from the recorded pointer"
      : file.submodule.modified
        ? "Submodule: has uncommitted changes in its own working tree"
        : file.submodule.untracked
          ? "Submodule: has untracked files in its own working tree"
          : "Submodule"
    : null;
  // Distinct badge per submodule condition, not just distinct tooltip text —
  // commit-pointer-changed (info/blue, matches the "moved" R/C convention),
  // dirty-worktree (warning/amber, matches the "modified" M convention), and
  // untracked-inside (muted, matches the plain "?" convention) must be
  // visually distinguishable at a glance, not collapse into one gray "S".
  const statusChar = file.submodule ? "S" : rawStatusChar;
  const statusColor = file.submodule
    ? file.submodule.commitChanged
      ? "bg-info/20 text-info"
      : file.submodule.modified
        ? "bg-warning/20 text-warning"
        : "bg-muted/80 text-muted-foreground"
    : (STATUS_COLORS[rawStatusChar] ?? "bg-muted/80 text-muted-foreground/60");

  const stat =
    diffStats.find((s) => s.path === file.path && s.staged === isStaged) ??
    diffStats.find((s) => s.path === file.path);

  const isRename = !!file.originalPath;
  const fileName = basename(file.path);
  const displayName = isRename ? `${basename(file.path)} ← ${basename(file.originalPath!)}` : fileName;

  async function handleStage(e?: React.MouseEvent) {
    e?.stopPropagation();
    if (!repoRoot) return;
    try {
      await git.stageFile(repoRoot, file.path, sessionId ?? undefined);
      onRefresh();
    } catch (e) {
      useNotificationStore
        .getState()
        .addNotification({ type: "error", title: "Git Operation Failed", message: String(e) });
    }
  }

  async function handleUnstage(e?: React.MouseEvent) {
    e?.stopPropagation();
    if (!repoRoot) return;
    try {
      await git.unstageFile(repoRoot, file.path, sessionId ?? undefined);
      onRefresh();
    } catch (e) {
      useNotificationStore
        .getState()
        .addNotification({ type: "error", title: "Git Operation Failed", message: String(e) });
    }
  }

  async function handleDiscard() {
    if (!repoRoot) return;
    try {
      await git.discardFile(repoRoot, file.path, sessionId ?? undefined);
      onRefresh();
    } catch (e) {
      useNotificationStore
        .getState()
        .addNotification({ type: "error", title: "Git Operation Failed", message: String(e) });
    }
  }

  async function handleAddToGitignore() {
    if (!repoRoot) return;
    try {
      await git.addToGitignore(repoRoot, file.path, sessionId ?? undefined);
      onRefresh();
    } catch (e) {
      useNotificationStore
        .getState()
        .addNotification({ type: "error", title: "Git Operation Failed", message: String(e) });
    }
  }

  async function handleAddToExclude() {
    if (!repoRoot) return;
    try {
      await git.addToExclude(repoRoot, file.path, sessionId ?? undefined);
    } catch (e) {
      useNotificationStore
        .getState()
        .addNotification({ type: "error", title: "Git Operation Failed", message: String(e) });
    }
  }

  function handleOpenDiff() {
    if (!repoRoot) return;
    openGitDiffTab(repoRoot, file.path, isStaged, section, hostId ?? undefined, sessionId ?? undefined);
  }

  function handleOpenDiffSplit() {
    if (!repoRoot) return;
    setDiffViewMode("split");
    openGitDiffTab(repoRoot, file.path, isStaged, section, hostId ?? undefined, sessionId ?? undefined);
  }

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            className="group/item flex h-7 cursor-pointer items-center gap-1.5 rounded px-2 transition-colors hover:bg-foreground/6"
            onClick={handleOpenDiff}
            title={file.path}
          >
            {/* Status badge */}
            <span
              className={cn(
                "flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded text-[9px] font-bold leading-none",
                statusColor,
              )}
              title={submoduleLabel ?? undefined}
            >
              {statusChar}
            </span>

            {/* Filename — flex-1 so it truncates when sidebar is narrow */}
            <span className="min-w-0 flex-1 truncate text-[11.5px] font-medium text-foreground/90">
              {displayName}
            </span>

            {/* Diff stats — always visible */}
            {stat && (stat.added > 0 || stat.removed > 0) && (
              <span className="flex shrink-0 items-center gap-1 text-[10px] tabular-nums">
                {stat.added > 0 && <span className="font-medium text-success">+{stat.added}</span>}
                {stat.removed > 0 && <span className="font-medium text-error">−{stat.removed}</span>}
              </span>
            )}

            {/* Stage / Unstage checkbox — always visible */}
            <Checkbox
              checked={isStaged}
              onClick={(e) => e.stopPropagation()}
              onCheckedChange={(checked) => {
                if (checked) void handleStage();
                else void handleUnstage();
              }}
              className="shrink-0"
              title={isStaged ? "Unstage" : "Stage"}
            />
          </div>
        </ContextMenuTrigger>

        <ContextMenuContent className="min-w-52">
          {section === "staged" ? (
            <ContextMenuItem onSelect={() => void handleUnstage()}>
              Unstage File
              <ContextMenuShortcut>—</ContextMenuShortcut>
            </ContextMenuItem>
          ) : (
            <ContextMenuItem onSelect={() => void handleStage()}>
              Stage File
              <ContextMenuShortcut>—</ContextMenuShortcut>
            </ContextMenuItem>
          )}
          {section === "unstaged" && (
            <ContextMenuItem variant="destructive" onSelect={() => setShowDiscard(true)}>
              Discard Changes
              <ContextMenuShortcut>⌫</ContextMenuShortcut>
            </ContextMenuItem>
          )}

          <ContextMenuSeparator />

          <ContextMenuItem onSelect={() => void handleAddToGitignore()}>Add to .gitignore</ContextMenuItem>
          <ContextMenuItem onSelect={() => void handleAddToExclude()}>
            Add to .git/info/exclude
          </ContextMenuItem>

          <ContextMenuSeparator />

          <ContextMenuItem onSelect={handleOpenDiff}>
            Open Diff
            <ContextMenuShortcut>↵</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem onSelect={handleOpenDiffSplit}>
            Open Diff (File)
            <ContextMenuShortcut>⌃↵</ContextMenuShortcut>
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>

      {/* Discard confirmation — rendered outside ContextMenu to avoid portal nesting issues */}
      <AlertDialog open={showDiscard} onOpenChange={setShowDiscard}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Discard changes?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently discard all changes to{" "}
              <span className="font-mono text-foreground">{fileName}</span>. This cannot be undone.
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
  );
}
