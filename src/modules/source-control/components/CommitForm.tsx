import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
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
  GitCommitIcon,
  SparklesIcon,
  Cancel01Icon,
  ArrowUp01Icon,
  ArrowDown01Icon,
  Refresh01Icon,
  MoreHorizontalCircle01Icon,
  Clock01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { cn } from "@/lib/utils";
import { useSourceControlStore } from "../store/sourceControlStore";
import { git } from "../lib/gitInvoke";
import { useAiCommitMessage } from "../lib/useAiCommitMessage";

interface CommitFormProps {
  repoRoot: string;
  onRefresh: () => void;
}

function firstLineClass(len: number): string {
  if (len === 0) return "text-muted-foreground/40";
  if (len <= 50) return "text-green-500";
  if (len <= 72) return "text-yellow-500";
  return "text-red-500";
}

export function CommitForm({ repoRoot, onRefresh }: CommitFormProps) {
  const commitMessage = useSourceControlStore((s) => s.commitMessage);
  const setCommitMessage = useSourceControlStore((s) => s.setCommitMessage);
  const status = useSourceControlStore((s) => s.status);
  const operationInProgress = useSourceControlStore((s) => s.operationInProgress);
  const setOperationInProgress = useSourceControlStore((s) => s.setOperationInProgress);
  const error = useSourceControlStore((s) => s.error);
  const setError = useSourceControlStore((s) => s.setError);
  const currentBranch = useSourceControlStore((s) => s.currentBranch);
  const recentMessages = useSourceControlStore((s) => s.recentMessages);
  const addRecentMessage = useSourceControlStore((s) => s.addRecentMessage);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [showForcePushConfirm, setShowForcePushConfirm] = useState(false);
  const [showSetUpstreamPrompt, setShowSetUpstreamPrompt] = useState(false);

  // AI commit message generation
  const { generate: generateAiMessage, isGenerating } = useAiCommitMessage(repoRoot);

  function autoResize() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }

  async function handleCommit() {
    if (!commitMessage.trim() || operationInProgress) return;
    setOperationInProgress("commit");
    setError(null);
    try {
      await git.commit(repoRoot, commitMessage, false);
      addRecentMessage(commitMessage);
      setCommitMessage("");
      onRefresh();
    } catch (e) {
      setError(String(e));
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
    } catch (e) {
      setError(String(e));
    } finally {
      setOperationInProgress(null);
    }
  }

  async function handlePush() {
    if (operationInProgress) return;
    setOperationInProgress("push");
    setError(null);
    setShowSetUpstreamPrompt(false);
    try {
      await git.push(repoRoot);
      onRefresh();
    } catch (e) {
      const errMsg = String(e);
      setError(errMsg);
      // Detect "no upstream" error
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
    if (operationInProgress) return;
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
    if (operationInProgress) return;
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

  async function handleForcePush() {
    setShowForcePushConfirm(false);
    if (operationInProgress) return;
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
    if (operationInProgress || !currentBranch) return;
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

  const canCommit =
    commitMessage.trim().length > 0 &&
    (status?.staged.length ?? 0) > 0 &&
    operationInProgress === null;

  const inSpecialState =
    (status?.mergeInProgress ?? false) || (status?.rebaseInProgress ?? false);

  return (
    <div className="border-t border-border/60 px-2 py-2">
      {/* Hint: no staged files */}
      {status && status.staged.length === 0 && (status.unstaged.length > 0 || status.untracked.length > 0) && (
        <p className="mb-1.5 text-[10px] text-muted-foreground/70">
          Stage files above to enable commit.
        </p>
      )}

      {/* Textarea */}
      <div className="relative mb-1.5">
        <Textarea
          ref={textareaRef}
          value={commitMessage}
          onChange={(e) => {
            setCommitMessage(e.target.value);
            autoResize();
          }}
          onInput={autoResize}
          placeholder="Commit message…"
          rows={3}
          className="resize-none overflow-hidden border-border/50 bg-background/60 text-[11px] placeholder:text-muted-foreground/40 focus-visible:ring-1"
        />
      </div>

      {/* Character counter + AI button row */}
      <div className="mb-2 flex items-center justify-between gap-1">
        {(() => {
          const firstLine = commitMessage.split("\n")[0] ?? "";
          const firstLineLen = firstLine.length;
          return (
            <span className={cn("font-mono text-[10px] tabular-nums", firstLineClass(firstLineLen))}>
              {firstLineLen}/72
            </span>
          );
        })()}

        <div className="flex items-center gap-0.5">
          {/* Recent messages dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-5 gap-1 px-1.5 text-[10px] text-muted-foreground hover:text-foreground"
                disabled={recentMessages.length === 0}
                title="Recent commit messages"
              >
                <HugeiconsIcon icon={Clock01Icon} size={10} strokeWidth={2} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              {recentMessages.map((msg, i) => (
                <DropdownMenuItem
                  key={i}
                  onClick={() => setCommitMessage(msg)}
                  className="truncate text-[11px]"
                >
                  {msg}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* AI generate */}
          <Button
            variant="ghost"
            size="sm"
            className="h-5 gap-1 px-1.5 text-[10px] text-muted-foreground hover:text-foreground"
            disabled={isGenerating}
            onClick={async () => {
              try {
                const msg = await generateAiMessage();
                if (msg) setCommitMessage(msg);
              } catch (e) {
                setError(String(e));
              }
            }}
            title="Generate commit message with AI"
          >
            <HugeiconsIcon icon={SparklesIcon} size={10} strokeWidth={2} />
            Generate
          </Button>
        </div>
      </div>

      {/* Commit button row */}
      <div className="flex items-center gap-1">
        <Button
          className="flex-1 gap-1.5 text-xs"
          size="sm"
          disabled={!canCommit}
          onClick={() => void handleCommit()}
        >
          {operationInProgress === "commit" ? (
            <Spinner className="size-3" />
          ) : (
            <HugeiconsIcon icon={GitCommitIcon} size={12} strokeWidth={2} />
          )}
          Commit
        </Button>

        {/* More actions dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 border-border/50 text-muted-foreground hover:text-foreground"
              disabled={operationInProgress !== null}
            >
              <HugeiconsIcon icon={MoreHorizontalCircle01Icon} size={13} strokeWidth={2} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem
              disabled={!commitMessage.trim()}
              onClick={() => void handleAmend()}
              className="text-xs"
            >
              <HugeiconsIcon icon={GitCommitIcon} size={12} strokeWidth={2} className="mr-2 text-muted-foreground" />
              Amend Last Commit
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => void handlePush()} className="text-xs">
              <HugeiconsIcon icon={ArrowUp01Icon} size={12} strokeWidth={2} className="mr-2 text-muted-foreground" />
              Push
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => void handlePull()} className="text-xs">
              <HugeiconsIcon icon={ArrowDown01Icon} size={12} strokeWidth={2} className="mr-2 text-muted-foreground" />
              Pull
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => void handleFetch()} className="text-xs">
              <HugeiconsIcon icon={Refresh01Icon} size={12} strokeWidth={2} className="mr-2 text-muted-foreground" />
              Fetch All
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => setShowForcePushConfirm(true)}
              className="text-xs text-orange-500 focus:text-orange-500"
            >
              <HugeiconsIcon icon={ArrowUp01Icon} size={12} strokeWidth={2} className="mr-2" />
              Force Push (--force-with-lease)
            </DropdownMenuItem>
            {inSpecialState && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => void handleAbort()}
                  className="text-xs text-red-500 focus:text-red-500"
                >
                  <HugeiconsIcon icon={Cancel01Icon} size={12} strokeWidth={2} className="mr-2" />
                  Abort
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Error display */}
      {error && (
        <div className="mt-2 flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1.5">
          <p className="flex-1 text-[10px] text-red-400">{error}</p>
          <button
            type="button"
            onClick={() => setError(null)}
            className="mt-0.5 shrink-0 text-red-400/60 hover:text-red-400"
          >
            <HugeiconsIcon icon={Cancel01Icon} size={10} strokeWidth={2} />
          </button>
        </div>
      )}

      {/* Set upstream prompt */}
      {showSetUpstreamPrompt && (
        <div className="mt-1.5 flex items-center gap-1.5 rounded border border-blue-500/30 bg-blue-500/10 px-2 py-1.5">
          <p className="flex-1 text-[10px] text-blue-400">No upstream configured.</p>
          <Button
            size="sm"
            variant="outline"
            className="h-5 border-blue-500/40 px-2 text-[10px] text-blue-400 hover:bg-blue-500/20"
            onClick={() => void handleSetUpstream()}
          >
            Set upstream & push
          </Button>
          <button
            type="button"
            onClick={() => setShowSetUpstreamPrompt(false)}
            className="text-blue-400/60 hover:text-blue-400"
          >
            <HugeiconsIcon icon={Cancel01Icon} size={10} strokeWidth={2} />
          </button>
        </div>
      )}

      {/* Force push confirm dialog */}
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
