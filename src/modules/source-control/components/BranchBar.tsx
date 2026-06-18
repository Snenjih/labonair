import { useEffect, useState } from "react";
import { Spinner } from "@/components/ui/spinner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  GitBranchIcon,
  ArrowDown01Icon,
  ArrowUp01Icon,
  Cancel01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { cn } from "@/lib/utils";
import { useSourceControlStore } from "../store/sourceControlStore";
import { git } from "../lib/gitInvoke";
import { BranchDropdown } from "./BranchDropdown";

interface BranchBarProps {
  onRefresh: () => void;
}

export function BranchBar({ onRefresh }: BranchBarProps) {
  const repoRoot = useSourceControlStore((s) => s.repoRoot);
  const status = useSourceControlStore((s) => s.status);
  const operationInProgress = useSourceControlStore((s) => s.operationInProgress);
  const setOperationInProgress = useSourceControlStore((s) => s.setOperationInProgress);
  const currentBranch = useSourceControlStore((s) => s.currentBranch);
  const setCurrentBranch = useSourceControlStore((s) => s.setCurrentBranch);

  const [localBranch, setLocalBranch] = useState<string>("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForcePushConfirm, setShowForcePushConfirm] = useState(false);
  const [showSetUpstreamPrompt, setShowSetUpstreamPrompt] = useState(false);

  useEffect(() => {
    if (!repoRoot) return;
    git
      .getCurrentBranch(repoRoot)
      .then((b) => {
        setLocalBranch(b);
        setCurrentBranch(b);
      })
      .catch(() => {
        setLocalBranch("");
        setCurrentBranch("");
      });
  }, [repoRoot, status, setCurrentBranch]);

  const ahead = status?.ahead ?? 0;
  const behind = status?.behind ?? 0;
  const mergeInProgress = status?.mergeInProgress ?? false;
  const rebaseInProgress = status?.rebaseInProgress ?? false;
  const cherryPickInProgress = status?.cherryPickInProgress ?? false;
  const inProgress = mergeInProgress || rebaseInProgress || cherryPickInProgress;

  const repoName = repoRoot ? (repoRoot.split("/").pop() ?? repoRoot) : "—";

  async function handlePush() {
    if (!repoRoot || operationInProgress) return;
    setOperationInProgress("push");
    setError(null);
    setShowSetUpstreamPrompt(false);
    try {
      await git.push(repoRoot);
      onRefresh();
    } catch (e) {
      const errMsg = String(e);
      setError(errMsg);
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
      await git.pull(repoRoot);
      onRefresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setOperationInProgress(null);
    }
  }

  async function handleFetch() {
    if (!repoRoot || operationInProgress) return;
    setOperationInProgress("fetch");
    setError(null);
    try {
      await git.fetch(repoRoot);
      onRefresh();
    } catch (e) {
      setError(String(e));
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
      await git.pushForceWithLease(repoRoot);
      onRefresh();
    } catch (e) {
      setError(String(e));
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
      await git.pushSetUpstream(repoRoot, "origin", currentBranch);
      onRefresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setOperationInProgress(null);
    }
  }

  // Plain button trigger — no tooltip wrapper so PopoverTrigger asChild can attach correctly
  const branchTrigger = (
    <button
      type="button"
      className="flex max-w-[200px] items-center gap-0.5 rounded px-1 py-0.5 text-[11px] font-medium text-foreground/90 transition-colors hover:bg-accent/40"
    >
      <span className="truncate">{localBranch || "—"}</span>
      <HugeiconsIcon
        icon={ArrowDown01Icon}
        size={10}
        strokeWidth={2.5}
        className="shrink-0 text-muted-foreground/50"
      />
    </button>
  );

  return (
    <div className="border-b border-border/60">
      {/* Main top bar */}
      <div className="flex h-9 items-center gap-0 px-2.5">
        {/* Left: git icon · repo / branch */}
        <HugeiconsIcon
          icon={GitBranchIcon}
          size={12}
          strokeWidth={2}
          className="mr-1.5 shrink-0 text-muted-foreground/50"
        />
        <span className="shrink-0 text-[11px] font-medium text-muted-foreground/60">
          {repoName}
        </span>
        <span className="mx-1 shrink-0 text-[11px] text-muted-foreground/30">/</span>

        {repoRoot ? (
          <BranchDropdown
            open={dropdownOpen}
            onOpenChange={setDropdownOpen}
            trigger={branchTrigger}
            repoRoot={repoRoot}
            currentBranch={localBranch}
            onRefresh={onRefresh}
          />
        ) : (
          <span className="text-[11px] font-medium text-foreground/80">{localBranch || "—"}</span>
        )}

        <div className="flex-1" />

        {/* Behind indicator */}
        {behind > 0 && (
          <span className="mr-2 shrink-0 rounded-full bg-red-500/15 px-1.5 py-0.5 text-[9px] font-medium tabular-nums text-red-500">
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
              className="flex items-center gap-1.5 px-2.5 font-medium text-foreground/80 transition-colors hover:bg-accent/40 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {operationInProgress === "push" ? (
                <Spinner className="size-2.5" />
              ) : (
                <HugeiconsIcon icon={ArrowUp01Icon} size={10} strokeWidth={2.5} />
              )}
              {ahead > 0 && <span className="tabular-nums">{ahead}</span>}
              Push
            </button>

            <div className="w-px self-stretch bg-border/50" />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  disabled={operationInProgress !== null}
                  className="flex w-6 items-center justify-center text-muted-foreground/70 transition-colors hover:bg-accent/40 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <HugeiconsIcon icon={ArrowDown01Icon} size={9} strokeWidth={2.5} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
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
                  className="text-xs text-orange-500 focus:text-orange-500"
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
            mergeInProgress && "bg-orange-500/10 text-orange-400",
            rebaseInProgress && "bg-orange-500/10 text-orange-400",
            cherryPickInProgress && "bg-yellow-500/10 text-yellow-400"
          )}
        >
          {mergeInProgress && "Merge in progress — resolve conflicts, then commit or Abort"}
          {rebaseInProgress && "Rebase in progress — resolve conflicts, then continue or Abort"}
          {cherryPickInProgress && "Cherry-pick in progress"}
        </div>
      )}

      {/* Remote op error */}
      {error && (
        <div className="flex items-start gap-2 border-t border-red-500/20 bg-red-500/10 px-2.5 py-1.5">
          <p className="flex-1 text-[10px] text-red-400">{error}</p>
          <button
            type="button"
            onClick={() => setError(null)}
            className="mt-0.5 shrink-0 text-red-400/60 hover:text-red-400"
          >
            <HugeiconsIcon icon={Cancel01Icon} size={9} strokeWidth={2} />
          </button>
        </div>
      )}

      {/* No upstream prompt */}
      {showSetUpstreamPrompt && (
        <div className="flex items-center gap-1.5 border-t border-blue-500/30 bg-blue-500/10 px-2.5 py-1.5">
          <p className="flex-1 text-[10px] text-blue-400">No upstream — push & set tracking?</p>
          <button
            type="button"
            onClick={() => void handleSetUpstream()}
            className="h-5 shrink-0 rounded border border-blue-500/40 px-2 text-[10px] text-blue-400 hover:bg-blue-500/20"
          >
            Set upstream & push
          </button>
          <button
            type="button"
            onClick={() => setShowSetUpstreamPrompt(false)}
            className="text-blue-400/60 hover:text-blue-400"
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
              This will overwrite the remote branch. Force-with-lease protects against overwriting
              others' work if they pushed after your last fetch — but it is still a destructive
              operation.
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
