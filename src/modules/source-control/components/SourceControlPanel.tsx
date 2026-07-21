import { useEffect } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ExplorerTarget } from "@/modules/explorer/lib/useExplorerTarget";
import { useLazyExplorerSession } from "@/modules/explorer/lib/useLazyExplorerSession";
import { useGitStatus } from "../lib/useGitStatus";
import { useSourceControlStore } from "../store/sourceControlStore";
import { BranchBar } from "./BranchBar";
import { CommitForm } from "./CommitForm";
import { DiffViewer } from "./DiffViewer";
import { NoRepoState } from "./NoRepoState";
import { SourceControlActionBar } from "./SourceControlActionBar";
import { TrackedSection } from "./TrackedSection";
import { UntrackedSection } from "./UntrackedSection";

interface SourceControlPanelProps {
  target: ExplorerTarget;
  onOpenGitGraph: (repoPath: string, branch: string, hostId?: string, sessionId?: string) => void;
}

export function SourceControlPanel({ target, onOpenGitGraph }: SourceControlPanelProps) {
  const { refresh } = useGitStatus(target);
  const rootPath = target.path;

  // A lazy SSH session (as opposed to one owned by an open SFTP tab) is only
  // ref-counted/reconnected for as long as *something* holds a reference to
  // it via this hook — previously only the sidebar File Explorer did, so
  // switching to the Source Control panel let the session idle-time-out
  // while it was the only thing being viewed. Mirrors StatusBar.tsx's
  // identical pattern for the breadcrumb.
  const lazyHostId = target.type === "remote" && target.source === "lazy-session" ? target.hostId : null;
  const lazySession = useLazyExplorerSession(lazyHostId);

  const isRepo = useSourceControlStore((s) => s.isRepo);
  const repoRoot = useSourceControlStore((s) => s.repoRoot);
  const sessionId = useSourceControlStore((s) => s.sessionId);
  const status = useSourceControlStore((s) => s.status);
  const submodules = useSourceControlStore((s) => s.submodules);
  const error = useSourceControlStore((s) => s.error);

  // Uninitialized submodules (empty gitlink directory) never produce a
  // `git status` entry at all — the only way to see them is `git submodule
  // status`'s separate `-` prefix — so they can't appear in TrackedSection/
  // UntrackedSection's file lists like a dirty or pointer-changed submodule
  // can. Surfaced as its own small banner instead, so all three submodule
  // states (uninitialized / pointer-changed / dirty) are represented
  // somewhere, not just the two that happen to produce a status line.
  const uninitializedSubmodules = submodules.filter((s) => s.state === "uninitialized");

  useEffect(() => {
    void useSourceControlStore.getState().hydrateRecentMessages();
  }, []);

  if (!isRepo) {
    return (
      <NoRepoState
        rootPath={rootPath}
        sessionId={sessionId ?? undefined}
        onRefresh={refresh}
        errorMessage={error ?? undefined}
        onReconnect={lazySession?.reconnect}
      />
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <SourceControlActionBar onRefresh={refresh} />

      <DiffViewer />

      {status?.hasConflicts && (
        <div className="mx-3 my-1 rounded border border-warning/30 bg-warning/10 px-2 py-1 text-[10px] text-warning">
          Merge conflicts detected — resolve before committing.
        </div>
      )}

      {/* Non-fatal: repo is known-good (isRepo=true), but the most recent
       *  poll tick failed (e.g. the SSH session dropped mid-refresh) — shown
       *  inline instead of tearing down to NoRepoState, since the repo
       *  itself hasn't gone anywhere. Self-clears on the next successful poll. */}
      {error && (
        <div className="mx-3 my-1 rounded border border-error/30 bg-error/10 px-2 py-1 text-[10px] text-error">
          {error}
        </div>
      )}

      {uninitializedSubmodules.length > 0 && (
        <div className="mx-3 my-1 rounded border border-muted-foreground/20 bg-muted/30 px-2 py-1 text-[10px] text-muted-foreground">
          Uninitialized submodule{uninitializedSubmodules.length !== 1 ? "s" : ""}:{" "}
          {uninitializedSubmodules.map((s) => s.path).join(", ")}
        </div>
      )}

      {/* Scrollable file list */}
      <ScrollArea className="min-h-0 flex-1">
        <div className="py-1">
          <TrackedSection
            staged={status?.staged ?? []}
            unstaged={status?.unstaged ?? []}
            onRefresh={refresh}
          />
          <UntrackedSection files={status?.untracked ?? []} onRefresh={refresh} />
        </div>
      </ScrollArea>

      {/* Branch + commit form pinned at bottom */}
      <BranchBar onRefresh={refresh} />
      {repoRoot && <CommitForm repoRoot={repoRoot} onRefresh={refresh} onOpenGitGraph={onOpenGitGraph} />}
    </div>
  );
}
