import { useState, useRef, useEffect } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  GitCommitIcon,
  SparklesIcon,
  Cancel01Icon,
  Refresh01Icon,
  GitForkIcon,
  ArrowDown01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { cn } from "@/lib/utils";
import { useSourceControlStore } from "../store/sourceControlStore";
import { git } from "../lib/gitInvoke";
import { useAiCommitMessage } from "../lib/useAiCommitMessage";
import { useNotificationStore } from "@/modules/notifications/store/useNotificationStore";
import type { CommitInfo } from "../types";

interface CommitFormProps {
  repoRoot: string;
  onRefresh: () => void;
  onOpenGitGraph: (repoPath: string, branch: string) => void;
}

export function CommitForm({ repoRoot, onRefresh, onOpenGitGraph }: CommitFormProps) {
  const commitMessage = useSourceControlStore((s) => s.commitMessage);
  const setCommitMessage = useSourceControlStore((s) => s.setCommitMessage);
  const status = useSourceControlStore((s) => s.status);
  const operationInProgress = useSourceControlStore((s) => s.operationInProgress);
  const setOperationInProgress = useSourceControlStore((s) => s.setOperationInProgress);
  const error = useSourceControlStore((s) => s.error);
  const setError = useSourceControlStore((s) => s.setError);
  const currentBranch = useSourceControlStore((s) => s.currentBranch);
  const addRecentMessage = useSourceControlStore((s) => s.addRecentMessage);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [lastCommit, setLastCommit] = useState<CommitInfo | null>(null);

  const { generate: generateAiMessage, isGenerating } = useAiCommitMessage(repoRoot);

  useEffect(() => {
    if (!repoRoot) {
      setLastCommit(null);
      return;
    }
    let cancelled = false;
    git
      .getLog(repoRoot, 1, false)
      .then((commits) => {
        if (!cancelled) setLastCommit(commits[0] ?? null);
      })
      .catch(() => {
        if (!cancelled) setLastCommit(null);
      });
    return () => {
      cancelled = true;
    };
  }, [repoRoot, status]);

  const canCommit =
    commitMessage.trim().length > 0 && (status?.staged.length ?? 0) > 0 && operationInProgress === null;

  const inSpecialState = (status?.mergeInProgress ?? false) || (status?.rebaseInProgress ?? false);

  async function handleCommit() {
    if (!canCommit) return;
    setOperationInProgress("commit");
    setError(null);
    try {
      await git.commit(repoRoot, commitMessage, false);
      addRecentMessage(commitMessage);
      setCommitMessage("");
      onRefresh();
      useNotificationStore
        .getState()
        .addNotification({ type: "success", title: "Committed", message: commitMessage.trim().slice(0, 80) });
    } catch (e) {
      setError(String(e));
      useNotificationStore
        .getState()
        .addNotification({ type: "error", title: "Commit Failed", message: String(e) });
    } finally {
      setOperationInProgress(null);
    }
  }

  async function handleAmend() {
    if (!commitMessage.trim() || operationInProgress) return;
    setOperationInProgress("commit");
    setError(null);
    try {
      await git.commit(repoRoot, commitMessage, true);
      addRecentMessage(commitMessage);
      setCommitMessage("");
      onRefresh();
      useNotificationStore
        .getState()
        .addNotification({ type: "success", title: "Amended", message: "Last commit amended" });
    } catch (e) {
      setError(String(e));
      useNotificationStore
        .getState()
        .addNotification({ type: "error", title: "Amend Failed", message: String(e) });
    } finally {
      setOperationInProgress(null);
    }
  }

  async function handleAbort() {
    if (operationInProgress) return;
    setOperationInProgress("abort");
    setError(null);
    try {
      await git.abort(repoRoot);
      onRefresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setOperationInProgress(null);
    }
  }

  function handleSignOff() {
    const suffix = commitMessage.trim() ? "\n\nSigned-off-by: " : "Signed-off-by: ";
    setCommitMessage(commitMessage + suffix);
    setTimeout(() => textareaRef.current?.focus(), 0);
  }

  function handleOpenGraph() {
    if (repoRoot && currentBranch) {
      onOpenGitGraph(repoRoot, currentBranch);
    }
  }

  return (
    <div className="shrink-0 border-t border-border/50">
      {/* No staged hint */}
      {status &&
        status.staged.length === 0 &&
        (status.unstaged.length > 0 || status.untracked.length > 0) && (
          <p className="px-2.5 pt-2 text-[10px] text-muted-foreground/60">
            Stage files above to enable commit.
          </p>
        )}

      {/* Commit message textarea */}
      <div className="px-2.5 pt-2">
        <Textarea
          ref={textareaRef}
          value={commitMessage}
          onChange={(e) => setCommitMessage(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              void handleCommit();
            }
          }}
          placeholder="Enter commit message"
          rows={4}
          className="min-h-[72px] resize-none border-border/40 bg-transparent text-[11px] leading-relaxed placeholder:text-muted-foreground/35 focus-visible:ring-1 focus-visible:ring-ring/40"
        />
      </div>

      {/* Action row: Generate (left) + Commit split button (right) */}
      <div className="flex items-center justify-between gap-2 px-2.5 py-2">
        {/* AI Generate */}
        <button
          type="button"
          disabled={isGenerating}
          onClick={async () => {
            try {
              const msg = await generateAiMessage();
              if (msg) setCommitMessage(msg);
            } catch (e) {
              setError(String(e));
            }
          }}
          className="flex h-[26px] items-center gap-1 rounded px-2 text-muted-foreground transition-colors hover:text-foreground hover:bg-foreground/6 disabled:cursor-not-allowed disabled:opacity-40"
          title="Generate commit message with AI"
        >
          {isGenerating ? (
            <Spinner className="size-3" />
          ) : (
            <HugeiconsIcon icon={SparklesIcon} size={12} strokeWidth={2} />
          )}
          <span className="text-[11px]">Generate</span>
        </button>

        {/* Commit split button */}
        <div
          className={cn(
            "flex h-[26px] shrink-0 items-stretch overflow-hidden rounded border text-[11px] transition-all",
            canCommit ? "border-primary/50 bg-primary/10" : "border-muted-foreground/20 opacity-50",
          )}
        >
          <button
            type="button"
            onClick={() => void handleCommit()}
            disabled={!canCommit}
            className="flex items-center gap-1.5 border-r border-muted-foreground/20 px-2.5 font-medium text-muted-foreground transition-colors hover:text-foreground hover:bg-foreground/6 disabled:cursor-not-allowed"
            title="Commit staged changes (⌘↵)"
          >
            {operationInProgress === "commit" ? (
              <Spinner className="size-2.5" />
            ) : (
              <HugeiconsIcon icon={GitCommitIcon} size={10} strokeWidth={2.5} />
            )}
            Commit Tracked
          </button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                disabled={operationInProgress !== null}
                className="flex w-6 items-center justify-center text-muted-foreground transition-colors hover:text-foreground hover:bg-foreground/6 disabled:cursor-not-allowed"
              >
                <HugeiconsIcon icon={ArrowDown01Icon} size={9} strokeWidth={2.5} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem
                onClick={() => void handleAmend()}
                disabled={!commitMessage.trim()}
                className="text-xs"
              >
                <HugeiconsIcon
                  icon={GitCommitIcon}
                  size={11}
                  strokeWidth={2}
                  className="mr-2 text-muted-foreground"
                />
                Amend Last Commit
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSignOff} className="text-xs">
                Sign-off
              </DropdownMenuItem>
              {inSpecialState && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => void handleAbort()}
                    className="text-xs text-red-500 focus:text-red-500"
                  >
                    <HugeiconsIcon icon={Cancel01Icon} size={11} strokeWidth={2} className="mr-2" />
                    Abort
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Commit error */}
      {error && (
        <div className="mx-2.5 mb-1.5 flex items-start gap-2 rounded border border-red-500/30 bg-red-500/10 px-2 py-1.5">
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

      {/* Last commit bar */}
      <div className="flex h-7 items-center gap-1.5 border-t border-border/40 px-2.5">
        <HugeiconsIcon
          icon={GitCommitIcon}
          size={10}
          strokeWidth={2}
          className="shrink-0 text-muted-foreground/35"
        />
        <span className="flex-1 truncate text-[10px] text-muted-foreground/55" title={lastCommit?.subject}>
          {lastCommit?.subject ?? "No recent commits"}
        </span>
        <button
          type="button"
          onClick={onRefresh}
          className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground hover:bg-foreground/6"
          title="Refresh"
        >
          <HugeiconsIcon icon={Refresh01Icon} size={10} strokeWidth={2} />
        </button>
        <button
          type="button"
          onClick={handleOpenGraph}
          disabled={!currentBranch}
          className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground hover:bg-foreground/6 disabled:cursor-not-allowed disabled:opacity-30"
          title="Open Git Graph"
        >
          <HugeiconsIcon icon={GitForkIcon} size={10} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}
