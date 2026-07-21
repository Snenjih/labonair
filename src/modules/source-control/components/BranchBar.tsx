import { ArrowDown01Icon, ArrowUp01Icon, Cancel01Icon, GitBranchIcon } from "@hugeicons/core-free-icons";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { useNotificationStore } from "@/modules/notifications/store/useNotificationStore";
import { git } from "../lib/gitInvoke";
import { useSourceControlStore } from "../store/sourceControlStore";
import { BranchDropdown } from "./BranchDropdown";

interface BranchBarProps {
  onRefresh: () => void;
}

export function BranchBar({ onRefresh }: BranchBarProps) {
  const repoRoot = useSourceControlStore((s) => s.repoRoot);
  const sessionId = useSourceControlStore((s) => s.sessionId);
  const status = useSourceControlStore((s) => s.status);
  const operationInProgress = useSourceControlStore((s) => s.operationInProgress);
  const setOperationInProgress = useSourceControlStore((s) => s.setOperationInProgress);
  const currentBranch = useSourceControlStore((s) => s.currentBranch);
  const branchList = useSourceControlStore((s) => s.branchList);

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForcePushConfirm, setShowForcePushConfirm] = useState(false);
  const [showSetUpstreamPrompt, setShowSetUpstreamPrompt] = useState(false);

  const ahead = status?.ahead ?? 0;
  const behind = status?.behind ?? 0;
  const mergeInProgress = status?.mergeInProgress ?? false;
  const rebaseInProgress = status?.rebaseInProgress ?? false;
  const cherryPickInProgress = status?.cherryPickInProgress ?? false;
  const inProgress = mergeInProgress || rebaseInProgress || cherryPickInProgress;

  // No upstream on the current branch means there's nothing to push/pull
  // against yet — the split button proactively labels itself "Publish" for
  // that case instead of waiting for a push to fail first (see
  // handleSetUpstream below, which does the actual `--set-upstream` push).
  const hasUpstream = branchList.some((b) => b.name === currentBranch && !b.isRemote && b.upstream !== null);

  async function handlePush() {
    if (!repoRoot || operationInProgress) return;
    if (!hasUpstream) {
      await handleSetUpstream();
      return;
    }
    setOperationInProgress("push");
    setError(null);
    setShowSetUpstreamPrompt(false);
    try {
      await git.push(repoRoot, undefined, undefined, sessionId ?? undefined);
      onRefresh();
      useNotificationStore.getState().addNotification({
        type: "success",
        title: "Pushed",
        message: currentBranch ? `${currentBranch} pushed to remote` : "Pushed to remote",
      });
    } catch (e) {
      const errMsg = String(e);
      setError(errMsg);
      useNotificationStore
        .getState()
        .addNotification({ type: "error", title: "Push Failed", message: errMsg });
      if (
        errMsg.includes("no upstream") ||
        errMsg.includes("no tracking") ||
        errMsg.includes("--set-upstream") ||
        errMsg.includes("has no upstream")
      ) {
        setShowSetUpstreamPrompt(true);
      }
    } finally {
      setOperationInProgress(null);
    }
  }

  async function handlePull() {
    if (!repoRoot || operationInProgress) return;
    setOperationInProgress("pull");
    setError(null);
    try {
      await git.pull(repoRoot, sessionId ?? undefined);
      onRefresh();
      useNotificationStore
        .getState()
        .addNotification({ type: "success", title: "Pulled", message: "Branch updated from remote" });
    } catch (e) {
      setError(String(e));
      useNotificationStore
        .getState()
        .addNotification({ type: "error", title: "Pull Failed", message: String(e) });
    } finally {
      setOperationInProgress(null);
    }
  }

  async function handleFetch() {
    if (!repoRoot || operationInProgress) return;
    setOperationInProgress("fetch");
    setError(null);
    try {
      await git.fetch(repoRoot, sessionId ?? undefined);
      onRefresh();
      useNotificationStore
        .getState()
        .addNotification({ type: "info", title: "Fetched", message: "Fetched all remotes" });
    } catch (e) {
      setError(String(e));
      useNotificationStore
        .getState()
        .addNotification({ type: "error", title: "Fetch Failed", message: String(e) });
    } finally {
      setOperationInProgress(null);
    }
  }

  async function handleForcePush() {
    setShowForcePushConfirm(false);
    if (!repoRoot || operationInProgress) return;
    setOperationInProgress("push");
    setError(null);
    try {
      await git.pushForceWithLease(repoRoot, undefined, undefined, sessionId ?? undefined);
      onRefresh();
      useNotificationStore.getState().addNotification({
        type: "success",
        title: "Force Pushed",
        message: currentBranch ? `${currentBranch} force-pushed to remote` : "Force-pushed to remote",
      });
    } catch (e) {
      setError(String(e));
      useNotificationStore
        .getState()
        .addNotification({ type: "error", title: "Force Push Failed", message: String(e) });
    } finally {
      setOperationInProgress(null);
    }
  }

  async function handleSetUpstream() {
    if (!repoRoot || !currentBranch || operationInProgress) return;
    setOperationInProgress("push");
    setError(null);
    setShowSetUpstreamPrompt(false);
    try {
      await git.pushSetUpstream(repoRoot, "origin", currentBranch, sessionId ?? undefined);
      onRefresh();
      useNotificationStore.getState().addNotification({
        type: "success",
        title: "Pushed & Upstream Set",
        message: currentBranch ? `${currentBranch} pushed with upstream set` : "Upstream set and pushed",
      });
    } catch (e) {
      setError(String(e));
      useNotificationStore
        .getState()
        .addNotification({ type: "error", title: "Push Failed", message: String(e) });
    } finally {
      setOperationInProgress(null);
    }
  }

  // Plain button trigger — no tooltip wrapper so PopoverTrigger asChild can attach correctly
  const branchTrigger = (
    <button
      type="button"
      className="flex max-w-[200px] items-center gap-0.5 rounded px-1 py-0.5 text-[11px] font-medium text-foreground/90 transition-colors hover:bg-foreground/6"
    >
      <span className="truncate">{currentBranch || "—"}</span>
      <HugeiconsIcon
        icon={ArrowDown01Icon}
        size={10}
        strokeWidth={2.5}
        className="shrink-0 text-muted-foreground"
      />
    </button>
  );

  return (
    <div className="border-b border-border/60">
      {/* Main top bar */}
      <div className="flex h-9 items-center gap-0 px-2.5">
        {/* Left: git icon · branch */}
        <HugeiconsIcon
          icon={GitBranchIcon}
          size={12}
          strokeWidth={2}
          className="mr-1.5 shrink-0 text-muted-foreground"
        />

        {repoRoot ? (
          <BranchDropdown
            open={dropdownOpen}
            onOpenChange={setDropdownOpen}
            trigger={branchTrigger}
            repoRoot={repoRoot}
            sessionId={sessionId ?? undefined}
            currentBranch={currentBranch}
            onRefresh={onRefresh}
          />
        ) : (
          <span className="text-[11px] font-medium text-foreground/80">{currentBranch || "—"}</span>
        )}

        <div className="flex-1" />

        {/* Behind indicator */}
        {behind > 0 && (
          <span className="mr-2 shrink-0 rounded-full bg-error/15 px-1.5 py-0.5 text-[9px] font-medium tabular-nums text-error">
            ↓{behind}
          </span>
        )}

        {/* Push split button */}
        {repoRoot && (
          <div className="flex h-[26px] shrink-0 items-stretch overflow-hidden rounded border border-border/50 text-[11px]">
            <button
              type="button"
              onClick={() => void handlePush()}
              disabled={operationInProgress !== null}
              className="flex items-center gap-1.5 px-2.5 font-medium text-muted-foreground transition-colors hover:text-foreground hover:bg-foreground/6 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {operationInProgress === "push" ? (
                <Spinner className="size-2.5" />
              ) : (
                <HugeiconsIcon icon={ArrowUp01Icon} size={10} strokeWidth={2.5} />
              )}
              {ahead > 0 && <span className="tabular-nums">{ahead}</span>}
              {hasUpstream ? "Push" : "Publish"}
            </button>

            <div className="w-px self-stretch bg-border/50" />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  disabled={operationInProgress !== null}
                  className="flex w-6 items-center justify-center text-muted-foreground transition-colors hover:text-foreground hover:bg-foreground/6 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <HugeiconsIcon icon={ArrowDown01Icon} size={9} strokeWidth={2.5} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem onClick={() => setDropdownOpen(true)} className="text-xs">
                  Switch Branch
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => void handleFetch()} className="text-xs">
                  Fetch
                </DropdownMenuItem>
                <DropdownMenuItem disabled className="text-xs opacity-40">
                  Fetch From
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => void handlePull()} className="text-xs">
                  Pull
                </DropdownMenuItem>
                <DropdownMenuItem disabled className="text-xs opacity-40">
                  Pull (Rebase)
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => void handlePush()} className="text-xs">
                  Push
                </DropdownMenuItem>
                <DropdownMenuItem disabled className="text-xs opacity-40">
                  Push To
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => setShowForcePushConfirm(true)}
                  className="text-xs text-warning focus:text-warning"
                >
                  Force Push
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      {/* In-progress state banner */}
      {inProgress && (
        <div
          className={cn(
            "border-t border-border/40 px-3 py-1.5 text-[10px] font-medium",
            mergeInProgress && "bg-warning/10 text-warning",
            rebaseInProgress && "bg-warning/10 text-warning",
            cherryPickInProgress && "bg-warning/10 text-warning",
          )}
        >
          {mergeInProgress && "Merge in progress — resolve conflicts, then commit or Abort"}
          {rebaseInProgress && "Rebase in progress — resolve conflicts, then continue or Abort"}
          {cherryPickInProgress && "Cherry-pick in progress"}
        </div>
      )}

      {/* Remote op error */}
      {error && (
        <div className="flex items-start gap-2 border-t border-error/20 bg-error/10 px-2.5 py-1.5">
          <p className="flex-1 text-[10px] text-error">{error}</p>
          <button
            type="button"
            onClick={() => setError(null)}
            className="mt-0.5 shrink-0 text-error/60 hover:text-error"
          >
            <HugeiconsIcon icon={Cancel01Icon} size={9} strokeWidth={2} />
          </button>
        </div>
      )}

      {/* No upstream prompt */}
      {showSetUpstreamPrompt && (
        <div className="flex items-center gap-1.5 border-t border-info/30 bg-info/10 px-2.5 py-1.5">
          <p className="flex-1 text-[10px] text-info">No upstream — push & set tracking?</p>
          <button
            type="button"
            onClick={() => void handleSetUpstream()}
            className="h-5 shrink-0 rounded border border-info/40 px-2 text-[10px] text-info hover:bg-info/20"
          >
            Set upstream & push
          </button>
          <button
            type="button"
            onClick={() => setShowSetUpstreamPrompt(false)}
            className="text-info/60 hover:text-info"
          >
            <HugeiconsIcon icon={Cancel01Icon} size={9} strokeWidth={2} />
          </button>
        </div>
      )}

      {/* Force push confirm */}
      <AlertDialog open={showForcePushConfirm} onOpenChange={setShowForcePushConfirm}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Force Push?</AlertDialogTitle>
            <AlertDialogDescription>
              This will overwrite the remote branch. Force-with-lease protects against overwriting others'
              work if they pushed after your last fetch — but it is still a destructive operation.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void handleForcePush()}
              className="bg-orange-500 text-white hover:bg-orange-600"
            >
              Force Push
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
