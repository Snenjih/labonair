import { useState, useEffect } from "react";
import { AnimatePresence } from "motion/react";
import { Button } from "@/components/ui/button";
import { Refresh01Icon } from "@hugeicons/core-free-icons";
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
} from "@/components/ui/alert-dialog";
import type { GitGraphTab } from "@/modules/tabs/types";
import { git } from "@/modules/source-control/lib/gitInvoke";
import { NewBranchDialog } from "@/modules/source-control/components/NewBranchDialog";
import { useGitGraph } from "../lib/useGitGraph";
import type { LayoutCommit } from "../types";
import { GitGraphCanvas } from "./GitGraphCanvas";
import { CommitDetailPanel } from "./CommitDetailPanel";
import { CommitDiffPanel } from "./CommitDiffPanel";

function LoadingSkeleton() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
      <div className="h-4 w-4 animate-spin rounded-full border-2 border-border border-t-foreground" />
      <p className="text-xs">Loading commits...</p>
    </div>
  );
}

function ErrorState({ error }: { error: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
      <p className="text-sm font-medium text-destructive">Failed to load git log</p>
      <p className="max-w-xs text-xs text-muted-foreground">{error}</p>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-full items-center justify-center">
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

interface Props {
  tab: GitGraphTab;
  onOpenFile?: (path: string) => void;
}

export function GitGraphPane({ tab, onOpenFile }: Props) {
  const { commits, isLoading, error, hasMore, loadMore, reload } = useGitGraph(tab.repositoryPath);
  const [selectedCommit, setSelectedCommit] = useState<LayoutCommit | null>(null);
  const [commitDiffHash, setCommitDiffHash] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isActioning, setIsActioning] = useState(false);
  const [checkoutConfirmCommit, setCheckoutConfirmCommit] = useState<LayoutCommit | null>(null);
  const [cherryPickConfirmCommit, setCherryPickConfirmCommit] = useState<LayoutCommit | null>(null);
  const [createBranchFromCommit, setCreateBranchFromCommit] = useState<string | null>(null);

  // Auto-dismiss error after 8 seconds
  useEffect(() => {
    if (!actionError) return;
    const timer = setTimeout(() => setActionError(null), 8000);
    return () => clearTimeout(timer);
  }, [actionError]);

  async function handleCheckoutCommit(commit: LayoutCommit) {
    setCheckoutConfirmCommit(commit);
  }

  async function doCheckout() {
    if (!checkoutConfirmCommit) return;
    setIsActioning(true);
    setActionError(null);
    try {
      await git.checkoutBranch(tab.repositoryPath, checkoutConfirmCommit.hash);
      reload();
    } catch (e) {
      setActionError(String(e));
    } finally {
      setIsActioning(false);
      setCheckoutConfirmCommit(null);
    }
  }

  async function handleCherryPick(commit: LayoutCommit) {
    setCherryPickConfirmCommit(commit);
  }

  async function doCherryPick() {
    if (!cherryPickConfirmCommit) return;
    setIsActioning(true);
    setActionError(null);
    try {
      await git.cherryPick(tab.repositoryPath, cherryPickConfirmCommit.hash);
      reload();
    } catch (e) {
      setActionError(String(e));
    } finally {
      setIsActioning(false);
      setCherryPickConfirmCommit(null);
    }
  }

  if (isLoading && commits.length === 0) {
    return <LoadingSkeleton />;
  }

  if (error) {
    return <ErrorState error={error} />;
  }

  if (commits.length === 0) {
    return <EmptyState message="No commits found" />;
  }

  return (
    <div className="flex h-full min-h-0">
      {/* Graph canvas */}
      <div className="flex min-h-0 flex-1 flex-col">
        {/* Toolbar */}
        <div className="flex shrink-0 items-center justify-between border-b border-border/60 px-3 py-1">
          <span className="truncate text-[11px] text-muted-foreground">
            {tab.repositoryPath.split("/").pop()}
          </span>
          <button
            type="button"
            onClick={reload}
            disabled={isLoading}
            title="Refresh git graph"
            className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground/60 hover:bg-accent hover:text-foreground disabled:opacity-40"
          >
            <HugeiconsIcon icon={Refresh01Icon} size={11} strokeWidth={1.75} />
          </button>
        </div>

        {/* Error banner */}
        {actionError && (
          <div className="mx-2 mb-1 rounded border border-red-500/30 bg-red-500/10 px-2 py-1.5 text-[10px] text-red-400">
            {actionError}
            <button
              type="button"
              className="ml-2 opacity-60 hover:opacity-100"
              onClick={() => setActionError(null)}
            >
              ✕
            </button>
          </div>
        )}

        <div className="min-h-0 flex-1">
          <GitGraphCanvas
            commits={commits}
            onSelectCommit={setSelectedCommit}
            selectedHash={selectedCommit?.hash ?? null}
            onViewChanges={(commit) => setCommitDiffHash(commit.hash)}
            onCheckoutCommit={handleCheckoutCommit}
            onCreateBranchHere={(commit) => setCreateBranchFromCommit(commit.hash)}
            onCherryPick={handleCherryPick}
          />
        </div>
        {hasMore && (
          <div className="shrink-0 border-t border-border/60 p-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={loadMore}
              disabled={isLoading}
              className="w-full text-xs"
            >
              {isLoading ? "Loading..." : "Load more commits"}
            </Button>
          </div>
        )}
      </div>

      {/* Detail / Diff panels */}
      <AnimatePresence>
        {commitDiffHash && (
          <CommitDiffPanel
            key={`diff-${commitDiffHash}`}
            hash={commitDiffHash}
            repositoryPath={tab.repositoryPath}
            onClose={() => setCommitDiffHash(null)}
          />
        )}
        {selectedCommit && !commitDiffHash && (
          <CommitDetailPanel
            key={selectedCommit.hash}
            commit={selectedCommit}
            repositoryPath={tab.repositoryPath}
            onClose={() => setSelectedCommit(null)}
            onOpenFile={onOpenFile}
            onViewChanges={(hash) => setCommitDiffHash(hash)}
          />
        )}
      </AnimatePresence>

      {/* Checkout confirmation */}
      <AlertDialog
        open={!!checkoutConfirmCommit}
        onOpenChange={(open) => !open && setCheckoutConfirmCommit(null)}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Checkout commit?</AlertDialogTitle>
            <AlertDialogDescription>
              You will enter detached HEAD state at{" "}
              <code className="font-mono text-foreground">{checkoutConfirmCommit?.shortHash}</code>.
              Any new commits will not be on a named branch. You can create a branch later with
              "Create Branch Here".
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void doCheckout()} disabled={isActioning}>
              Checkout
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cherry-pick confirmation */}
      <AlertDialog
        open={!!cherryPickConfirmCommit}
        onOpenChange={(open) => !open && setCherryPickConfirmCommit(null)}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Cherry-pick commit?</AlertDialogTitle>
            <AlertDialogDescription>
              Apply the changes from commit{" "}
              <code className="font-mono text-foreground">{cherryPickConfirmCommit?.shortHash}</code>{" "}
              "{cherryPickConfirmCommit?.subject?.slice(0, 60)}"
              onto the current branch.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void doCherryPick()} disabled={isActioning}>
              Cherry-pick
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* New branch from commit */}
      <NewBranchDialog
        open={!!createBranchFromCommit}
        onOpenChange={(open) => !open && setCreateBranchFromCommit(null)}
        repoRoot={tab.repositoryPath}
        currentBranch=""
        fromRef={createBranchFromCommit ?? undefined}
        onSuccess={() => {
          setCreateBranchFromCommit(null);
          reload();
        }}
      />
    </div>
  );
}
