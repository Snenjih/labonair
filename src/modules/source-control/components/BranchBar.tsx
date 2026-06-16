import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { GitBranchIcon, Refresh01Icon, GitForkIcon, ArrowDown01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { cn } from "@/lib/utils";
import { useSourceControlStore } from "../store/sourceControlStore";
import { git } from "../lib/gitInvoke";
import { BranchDropdown } from "./BranchDropdown";

interface BranchBarProps {
  onOpenGitGraph: (repoPath: string, branch: string) => void;
  onRefresh: () => void;
}

export function BranchBar({ onOpenGitGraph, onRefresh }: BranchBarProps) {
  const repoRoot = useSourceControlStore((s) => s.repoRoot);
  const status = useSourceControlStore((s) => s.status);
  const setCurrentBranch = useSourceControlStore((s) => s.setCurrentBranch);
  const [localBranch, setLocalBranch] = useState<string>("");
  const [dropdownOpen, setDropdownOpen] = useState(false);

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
  }, [repoRoot, status, setCurrentBranch]); // re-fetch branch when status changes (e.g. after commit or checkout)

  const ahead = status?.ahead ?? 0;
  const behind = status?.behind ?? 0;
  const mergeInProgress = status?.mergeInProgress ?? false;
  const rebaseInProgress = status?.rebaseInProgress ?? false;
  const cherryPickInProgress = status?.cherryPickInProgress ?? false;
  const inProgress = mergeInProgress || rebaseInProgress || cherryPickInProgress;

  function handleOpenGraph() {
    if (repoRoot && localBranch) {
      onOpenGitGraph(repoRoot, localBranch);
    }
  }

  const branchTrigger = (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="flex max-w-[140px] items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-foreground/80 transition-colors hover:bg-accent/40 cursor-pointer"
            onClick={() => setDropdownOpen((o) => !o)}
          >
            <span className="truncate">{localBranch || "—"}</span>
            <HugeiconsIcon
              icon={ArrowDown01Icon}
              size={10}
              strokeWidth={2}
              className="shrink-0 text-muted-foreground/60"
            />
          </button>
        </TooltipTrigger>
        {localBranch && (
          <TooltipContent side="bottom">
            <span>{localBranch}</span>
          </TooltipContent>
        )}
      </Tooltip>
    </TooltipProvider>
  );

  return (
    <div className="border-b border-border/60">
      {/* Main branch row */}
      <div className="flex h-8 items-center gap-1.5 px-2">
        <HugeiconsIcon
          icon={GitBranchIcon}
          size={12}
          strokeWidth={2}
          className="shrink-0 text-muted-foreground/60"
        />

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
          <span className="flex-1 truncate text-[11px] font-medium text-foreground/80">
            {localBranch || "—"}
          </span>
        )}

        <div className="flex flex-1 items-center justify-end gap-1">
          {/* ahead / behind pills */}
          {ahead > 0 && (
            <span className="flex items-center gap-0.5 rounded-full bg-green-500/15 px-1.5 py-0.5 text-[9px] font-medium tabular-nums text-green-500">
              ↑{ahead}
            </span>
          )}
          {behind > 0 && (
            <span className="flex items-center gap-0.5 rounded-full bg-red-500/15 px-1.5 py-0.5 text-[9px] font-medium tabular-nums text-red-500">
              ↓{behind}
            </span>
          )}

          {/* Action buttons */}
          <Button
            variant="ghost"
            size="icon"
            className="size-6 text-muted-foreground hover:text-foreground"
            onClick={onRefresh}
            title="Refresh"
          >
            <HugeiconsIcon icon={Refresh01Icon} size={12} strokeWidth={2} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-6 text-muted-foreground hover:text-foreground"
            onClick={handleOpenGraph}
            title="Open Git Graph"
            disabled={!repoRoot || !localBranch}
          >
            <HugeiconsIcon icon={GitForkIcon} size={12} strokeWidth={2} />
          </Button>
        </div>
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
    </div>
  );
}
