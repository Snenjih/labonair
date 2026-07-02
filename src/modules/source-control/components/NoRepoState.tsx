import { GitBranchIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import { useNotificationStore } from "@/modules/notifications/store/useNotificationStore";
import { isSessionLostError } from "../lib/gitErrors";
import { git } from "../lib/gitInvoke";

interface NoRepoStateProps {
  rootPath: string | null;
  sessionId?: string;
  onRefresh: () => void;
  errorMessage?: string;
  /** Set when a lazy SSH session backs this target — lets a session-lost
   *  error offer a working "Reconnect" button instead of a dead end. */
  onReconnect?: () => void;
}

export function NoRepoState({ rootPath, sessionId, onRefresh, errorMessage, onReconnect }: NoRepoStateProps) {
  async function handleGitInit() {
    if (!rootPath) return;
    try {
      await git.init(rootPath, sessionId);
      onRefresh();
    } catch (e) {
      useNotificationStore
        .getState()
        .addNotification({ type: "error", title: "Git Init Failed", message: String(e) });
    }
  }

  if (errorMessage) {
    const sessionLost = isSessionLostError(errorMessage);
    return (
      <div className="flex flex-col items-center gap-3 px-4 py-8 text-center">
        <p className="text-sm font-medium text-destructive">
          {sessionLost ? "Connection Lost" : "Git Error"}
        </p>
        <p className="text-xs text-muted-foreground">{errorMessage}</p>
        {sessionLost && onReconnect && (
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={onReconnect}>
            Reconnect
          </Button>
        )}
      </div>
    );
  }

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
          {rootPath
            ? "The current folder is not a Git repository."
            : "Open a folder containing a Git repository."}
        </p>
      </div>
      {rootPath !== null && (
        <Button
          variant="outline"
          size="sm"
          className="h-8 border-border/50 text-xs"
          onClick={() => void handleGitInit()}
        >
          git init
        </Button>
      )}
    </div>
  );
}
