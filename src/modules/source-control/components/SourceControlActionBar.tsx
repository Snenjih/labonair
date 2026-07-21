import {
  FolderTreeIcon,
  MinusSignIcon,
  MoreHorizontalIcon,
  PlusMinusIcon,
  PlusSignIcon,
  Sorting01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useNotificationStore } from "@/modules/notifications/store/useNotificationStore";
import { git } from "../lib/gitInvoke";
import { useSourceControlStore } from "../store/sourceControlStore";
import { StashPanel } from "./StashPanel";

interface SourceControlActionBarProps {
  onRefresh: () => void;
}

export function SourceControlActionBar({ onRefresh }: SourceControlActionBarProps) {
  const repoRoot = useSourceControlStore((s) => s.repoRoot);
  const sessionId = useSourceControlStore((s) => s.sessionId);
  const status = useSourceControlStore((s) => s.status);
  const diffStats = useSourceControlStore((s) => s.diffStats);
  const stashEntries = useSourceControlStore((s) => s.stashEntries);
  const selectionMode = useSourceControlStore((s) => s.selectionMode);
  const selectAll = useSourceControlStore((s) => s.selectAll);
  const clearSelectedFile = useSourceControlStore((s) => s.clearSelectedFile);
  const fileListViewMode = useSourceControlStore((s) => s.fileListViewMode);
  const setFileListViewMode = useSourceControlStore((s) => s.setFileListViewMode);
  const sortByPath = useSourceControlStore((s) => s.sortByPath);
  const setSortByPath = useSourceControlStore((s) => s.setSortByPath);

  const [showStashDialog, setShowStashDialog] = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [showTrashConfirm, setShowTrashConfirm] = useState(false);
  const [busyAction, setBusyAction] = useState<"stash" | "stashPop" | "discard" | "trash" | null>(null);

  const stagedCount = status?.staged.length ?? 0;
  const unstagedCount = status?.unstaged.length ?? 0;
  const untrackedCount = status?.untracked.length ?? 0;
  const trackedCount = stagedCount + unstagedCount;
  const hasAnyChanges = trackedCount + untrackedCount > 0;
  const hasUnstagedOrUntracked = unstagedCount + untrackedCount > 0;

  const totalAdded = diffStats.reduce((sum, s) => sum + s.added, 0);
  const totalRemoved = diffStats.reduce((sum, s) => sum + s.removed, 0);

  const isViewingDiff = selectionMode?.type === "all";

  function handleViewDiff() {
    if (isViewingDiff) clearSelectedFile();
    else selectAll();
  }

  async function handleStageOrUnstageAll() {
    if (!repoRoot) return;
    try {
      if (hasUnstagedOrUntracked) await git.stageAll(repoRoot, sessionId ?? undefined);
      else await git.unstageAll(repoRoot, sessionId ?? undefined);
      onRefresh();
    } catch (e) {
      useNotificationStore
        .getState()
        .addNotification({ type: "error", title: "Git Operation Failed", message: String(e) });
    }
  }

  async function handleStashAll() {
    if (!repoRoot) return;
    setBusyAction("stash");
    try {
      await git.stashPush(repoRoot, undefined, true, sessionId ?? undefined);
      onRefresh();
    } catch (e) {
      useNotificationStore
        .getState()
        .addNotification({ type: "error", title: "Stash Failed", message: String(e) });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleStashPop() {
    if (!repoRoot || stashEntries.length === 0) return;
    setBusyAction("stashPop");
    try {
      await git.stashPop(repoRoot, stashEntries[0].hash, sessionId ?? undefined);
      onRefresh();
    } catch (e) {
      useNotificationStore
        .getState()
        .addNotification({ type: "error", title: "Stash Pop Failed", message: String(e) });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleDiscardTracked() {
    if (!repoRoot) return;
    setShowDiscardConfirm(false);
    setBusyAction("discard");
    try {
      await git.discardAll(repoRoot, sessionId ?? undefined);
      onRefresh();
    } catch (e) {
      useNotificationStore
        .getState()
        .addNotification({ type: "error", title: "Discard Failed", message: String(e) });
    } finally {
      setBusyAction(null);
    }
  }

  async function handleTrashUntracked() {
    if (!repoRoot) return;
    setShowTrashConfirm(false);
    setBusyAction("trash");
    try {
      await git.cleanUntracked(repoRoot, sessionId ?? undefined);
      onRefresh();
    } catch (e) {
      useNotificationStore
        .getState()
        .addNotification({ type: "error", title: "Trash Untracked Failed", message: String(e) });
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <>
      <div className="flex h-8 shrink-0 items-center gap-1 border-b border-border/50 px-2">
        {/* View Diff */}
        <button
          type="button"
          onClick={handleViewDiff}
          disabled={!hasAnyChanges}
          className={cn(
            "flex h-6 shrink-0 items-center gap-1 rounded px-1.5 text-[11px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40",
            isViewingDiff
              ? "bg-accent text-foreground"
              : "text-muted-foreground hover:bg-foreground/6 hover:text-foreground",
          )}
        >
          <HugeiconsIcon icon={PlusMinusIcon} size={11} strokeWidth={2} />
          View Diff
        </button>

        {/* Aggregate +/- stats */}
        {(totalAdded > 0 || totalRemoved > 0) && (
          <span className="flex shrink-0 items-center gap-1.5 text-[10px] tabular-nums">
            {totalAdded > 0 && <span className="font-semibold text-success">+{totalAdded}</span>}
            {totalRemoved > 0 && <span className="font-semibold text-error">−{totalRemoved}</span>}
          </span>
        )}

        <div className="flex-1" />

        {/* Options */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-foreground/6 hover:text-foreground"
              title="Options"
            >
              <HugeiconsIcon icon={MoreHorizontalIcon} size={13} strokeWidth={2} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem
              onClick={() => void handleStageOrUnstageAll()}
              disabled={!hasAnyChanges}
              className="text-xs"
            >
              {hasUnstagedOrUntracked ? "Stage All" : "Unstage All"}
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            <DropdownMenuItem
              onClick={() => void handleStashAll()}
              disabled={!hasAnyChanges || busyAction !== null}
              className="text-xs"
            >
              Stash All
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => void handleStashPop()}
              disabled={stashEntries.length === 0 || busyAction !== null}
              className="text-xs"
            >
              Stash Pop
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setShowStashDialog(true)} className="text-xs">
              View Stash
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            <DropdownMenuItem onClick={handleViewDiff} disabled={!hasAnyChanges} className="text-xs">
              Open Diff
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            <DropdownMenuItem
              onClick={() => setShowDiscardConfirm(true)}
              disabled={trackedCount === 0 || busyAction !== null}
              className="text-xs text-warning focus:text-warning"
            >
              Discard Tracked Changes
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setShowTrashConfirm(true)}
              disabled={untrackedCount === 0 || busyAction !== null}
              className="text-xs text-error focus:text-error"
            >
              Trash Untracked Files
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            <DropdownMenuCheckboxItem
              checked={fileListViewMode === "tree"}
              onCheckedChange={(checked) => setFileListViewMode(checked ? "tree" : "list")}
              className="text-xs"
            >
              <HugeiconsIcon icon={FolderTreeIcon} size={11} strokeWidth={2} className="mr-1.5" />
              Tree View
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={sortByPath}
              onCheckedChange={(checked) => setSortByPath(checked)}
              className="text-xs"
            >
              <HugeiconsIcon icon={Sorting01Icon} size={11} strokeWidth={2} className="mr-1.5" />
              Sort by Path
            </DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Stage All / Unstage All */}
        <button
          type="button"
          onClick={() => void handleStageOrUnstageAll()}
          disabled={!hasAnyChanges}
          className="flex h-6 shrink-0 items-center gap-1 rounded px-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-foreground/6 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
        >
          <HugeiconsIcon
            icon={hasUnstagedOrUntracked ? PlusSignIcon : MinusSignIcon}
            size={10}
            strokeWidth={2}
          />
          {hasUnstagedOrUntracked ? "Stage All" : "Unstage All"}
        </button>
      </div>

      {/* View Stash dialog */}
      <Dialog open={showStashDialog} onOpenChange={setShowStashDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Stashes</DialogTitle>
          </DialogHeader>
          {repoRoot && (
            <StashPanel repoRoot={repoRoot} sessionId={sessionId ?? undefined} onRefresh={onRefresh} />
          )}
        </DialogContent>
      </Dialog>

      {/* Discard tracked changes confirm */}
      <AlertDialog open={showDiscardConfirm} onOpenChange={setShowDiscardConfirm}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Discard tracked changes?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently discard all staged and unstaged changes to tracked files, resetting them
              to <span className="font-mono text-foreground">HEAD</span>. Untracked files are not affected.
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void handleDiscardTracked()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Trash untracked files confirm */}
      <AlertDialog open={showTrashConfirm} onOpenChange={setShowTrashConfirm}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Trash untracked files?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete all untracked files and directories (respecting{" "}
              <span className="font-mono text-foreground">.gitignore</span>). This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void handleTrashUntracked()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
