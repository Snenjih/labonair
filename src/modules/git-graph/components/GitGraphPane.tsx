import { GitBranchIcon, Refresh01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useRef, useState } from "react";
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
import { Button } from "@/components/ui/button";
import { useLazyExplorerSession } from "@/modules/explorer/lib/useLazyExplorerSession";
import { useNotificationStore } from "@/modules/notifications/store/useNotificationStore";
import { NewBranchDialog } from "@/modules/source-control/components/NewBranchDialog";
import { isSessionLostError } from "@/modules/source-control/lib/gitErrors";
import { git } from "@/modules/source-control/lib/gitInvoke";
import { useTabsStore } from "@/modules/tabs/store/tabsStore";
import type { GitGraphTab } from "@/modules/tabs/types";
import { useGitGraph } from "../lib/useGitGraph";
import type { LayoutCommit } from "../types";
import { CommitDetailPanel } from "./CommitDetailPanel";
import { GitGraphCanvas } from "./GitGraphCanvas";

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

function NoRepoState({ path }: { path: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-border/40 bg-muted/30">
        <HugeiconsIcon
          icon={GitBranchIcon}
          size={22}
          strokeWidth={1.5}
          className="text-muted-foreground/40"
        />
      </div>
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">No Repository</p>
        <p className="text-[11px] text-muted-foreground/50">
          {path
            ? "The selected folder is not a Git repository."
            : "Open a folder containing a Git repository to view the graph."}
        </p>
      </div>
    </div>
  );
}

/** Distinct from `NoRepoState`/`ErrorState` — the repo is fine, the SSH
 *  session backing it died. Offers a working reconnect when this tab was
 *  opened against a lazy session (see `lazyEligible` below); otherwise
 *  points the user at re-establishing the connection manually, since the
 *  tab was pinned to a specific SFTP tab's session that can't be
 *  auto-recreated here. */
function SessionLostState({ error, onReconnect }: { error: string; onReconnect?: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center">
      <p className="text-sm font-medium text-destructive">Connection Lost</p>
      <p className="max-w-xs text-xs text-muted-foreground">{error}</p>
      {onReconnect ? (
        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={onReconnect}>
          Reconnect
        </Button>
      ) : (
        <p className="max-w-xs text-[11px] text-muted-foreground/60">
          Reopen an SSH terminal or SFTP tab for this host, then refresh.
        </p>
      )}
    </div>
  );
}

function isNoRepoError(error: string): boolean {
  // A dead SSH session is not "no repo" — it needs a distinct
  // reconnect-aware error state (see `SessionLostState` below), not the
  // "open a folder with a git repo" empty state.
  if (isSessionLostError(error)) return false;
  const lower = error.toLowerCase();
  return (
    lower.includes("not a git repo") ||
    lower.includes("not a git repository") ||
    lower.includes("does not have any commits") ||
    lower.includes("no such file or directory") ||
    lower.includes("repository not found") ||
    (lower.includes("fatal") && lower.includes("git"))
  );
}

function RefreshAge({ date }: { date: Date }) {
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => forceUpdate((n) => n + 1), 30_000);
    return () => clearInterval(timer);
  }, []);

  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  const label = seconds < 60 ? `${seconds}s ago` : `${Math.round(seconds / 60)}m ago`;

  return <span className="text-[10px] text-muted-foreground/40">{label}</span>;
}

interface Props {
  tab: GitGraphTab;
  onOpenFile?: (path: string) => void;
}

export function GitGraphPane({ tab }: Props) {
  if (!tab.repositoryPath) {
    return <NoRepoState path="" />;
  }
  return <GitGraphPaneContent tab={tab} />;
}

function GitGraphPaneContent({ tab }: Props) {
  const { commits, isLoading, error, hasMore, loadMore, reload, lastRefreshedAt } = useGitGraph(
    tab.repositoryPath,
    tab.sessionId,
  );
  const [selectedCommit, setSelectedCommit] = useState<LayoutCommit | null>(null);
  const openCommitDiffTab = useTabsStore((s) => s.openCommitDiffTab);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isActioning, setIsActioning] = useState(false);
  const [checkoutConfirmCommit, setCheckoutConfirmCommit] = useState<LayoutCommit | null>(null);
  const [cherryPickConfirmCommit, setCherryPickConfirmCommit] = useState<LayoutCommit | null>(null);
  const [createBranchFromCommit, setCreateBranchFromCommit] = useState<string | null>(null);

  // Only re-acquire via useLazyExplorerSession when this tab's sessionId was
  // actually sourced from one — an sftp-tab-sourced session is pinned to a
  // *specific* SFTP tab and re-acquiring here would stand up an unrelated
  // second session instead of reconnecting the real one.
  const lazyHostId = tab.hostId && tab.sessionId === `explorer:${tab.hostId}` ? tab.hostId : null;
  const lazySession = useLazyExplorerSession(lazyHostId);
  const prevLazyStatus = useRef(lazySession?.status);
  useEffect(() => {
    if (
      prevLazyStatus.current &&
      prevLazyStatus.current !== "connected" &&
      lazySession?.status === "connected"
    ) {
      reload();
    }
    prevLazyStatus.current = lazySession?.status;
  }, [lazySession?.status, reload]);

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
      await git.checkoutBranch(tab.repositoryPath, checkoutConfirmCommit.hash, tab.sessionId);
      reload();
    } catch (e) {
      setActionError(String(e));
      useNotificationStore
        .getState()
        .addNotification({ type: "error", title: "Checkout Failed", message: String(e) });
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
      await git.cherryPick(tab.repositoryPath, cherryPickConfirmCommit.hash, tab.sessionId);
      reload();
    } catch (e) {
      setActionError(String(e));
      useNotificationStore
        .getState()
        .addNotification({ type: "error", title: "Cherry-pick Failed", message: String(e) });
    } finally {
      setIsActioning(false);
      setCherryPickConfirmCommit(null);
    }
  }

  if (isLoading && commits.length === 0) {
    return <LoadingSkeleton />;
  }

  if (error) {
    if (isSessionLostError(error)) {
      return <SessionLostState error={error} onReconnect={lazySession?.reconnect} />;
    }
    if (isNoRepoError(error)) {
      return <NoRepoState path={tab.repositoryPath} />;
    }
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
          <div className="flex items-center gap-2">
            {lastRefreshedAt && <RefreshAge date={lastRefreshedAt} />}
            <button
              type="button"
              onClick={reload}
              disabled={isLoading}
              title="Refresh git graph"
              className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"
            >
              <HugeiconsIcon icon={Refresh01Icon} size={11} strokeWidth={1.75} />
            </button>
          </div>
        </div>

        {/* Error banner */}
        {actionError && (
          <div className="mx-2 mb-1 rounded border border-error/30 bg-error/10 px-2 py-1.5 text-[10px] text-error">
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

        <GitGraphCanvas
          commits={commits}
          onSelectCommit={setSelectedCommit}
          selectedHash={selectedCommit?.hash ?? null}
          onViewChanges={(commit) =>
            openCommitDiffTab(tab.repositoryPath, commit.hash, tab.hostId, tab.sessionId)
          }
          onCheckoutCommit={handleCheckoutCommit}
          onCreateBranchHere={(commit) => setCreateBranchFromCommit(commit.hash)}
          onCherryPick={handleCherryPick}
        />
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

      {/* Detail panel */}
      {selectedCommit && (
        <CommitDetailPanel
          key={selectedCommit.hash}
          commit={selectedCommit}
          repositoryPath={tab.repositoryPath}
          sessionId={tab.sessionId}
          onClose={() => setSelectedCommit(null)}
          onViewChanges={(hash) => openCommitDiffTab(tab.repositoryPath, hash, tab.hostId, tab.sessionId)}
        />
      )}

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
              <code className="font-mono text-foreground">{checkoutConfirmCommit?.shortHash}</code>. Any new
              commits will not be on a named branch. You can create a branch later with "Create Branch Here".
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
              <code className="font-mono text-foreground">{cherryPickConfirmCommit?.shortHash}</code> "
              {cherryPickConfirmCommit?.subject?.slice(0, 60)}" onto the current branch.
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
        sessionId={tab.sessionId}
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
