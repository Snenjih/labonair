import { useEffect } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useSourceControlStore } from "../store/sourceControlStore";
import { useGitStatus } from "../lib/useGitStatus";
import { BranchBar } from "./BranchBar";
import { CommitForm } from "./CommitForm";
import { NoRepoState } from "./NoRepoState";
import { TrackedSection } from "./TrackedSection";
import { UntrackedSection } from "./UntrackedSection";

interface SourceControlPanelProps {
  rootPath: string | null;
  onOpenGitGraph: (repoPath: string, branch: string) => void;
}

export function SourceControlPanel({ rootPath, onOpenGitGraph }: SourceControlPanelProps) {
  const { refresh } = useGitStatus(rootPath);

  const isRepo = useSourceControlStore((s) => s.isRepo);
  const repoRoot = useSourceControlStore((s) => s.repoRoot);
  const status = useSourceControlStore((s) => s.status);
  const diffStats = useSourceControlStore((s) => s.diffStats);
  const error = useSourceControlStore((s) => s.error);

  useEffect(() => {
    void useSourceControlStore.getState().hydrateRecentMessages();
  }, []);

  const stagedCount = status?.staged.length ?? 0;
  const unstagedCount = status?.unstaged.length ?? 0;
  const untrackedCount = status?.untracked.length ?? 0;
  const trackedCount = stagedCount + unstagedCount;
  const totalChanges = trackedCount + untrackedCount;

  const totalAdded = diffStats.reduce((sum, s) => sum + s.added, 0);
  const totalRemoved = diffStats.reduce((sum, s) => sum + s.removed, 0);

  if (!isRepo) {
    return <NoRepoState rootPath={rootPath} onRefresh={refresh} errorMessage={error ?? undefined} />;
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <BranchBar onRefresh={refresh} />

      {/* Header: change count + aggregate diff stats */}
      <div className="flex h-8 shrink-0 items-center gap-2 border-b border-border/50 px-3">
        <span className="text-[11px] text-muted-foreground/60">
          {totalChanges > 0 ? (
            <>
              <span className="font-semibold text-foreground/80">{totalChanges}</span>
              {" "}Change{totalChanges !== 1 ? "s" : ""}
            </>
          ) : (
            "No changes"
          )}
        </span>
        {(totalAdded > 0 || totalRemoved > 0) && (
          <span className="flex items-center gap-1.5 text-[10px] tabular-nums">
            {totalAdded > 0 && (
              <span className="font-semibold text-success">+{totalAdded}</span>
            )}
            {totalRemoved > 0 && (
              <span className="font-semibold text-error">−{totalRemoved}</span>
            )}
          </span>
        )}
      </div>

      {status?.hasConflicts && (
        <div className="mx-3 my-1 rounded border border-warning/30 bg-warning/10 px-2 py-1 text-[10px] text-warning">
          Merge conflicts detected — resolve before committing.
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
          <UntrackedSection
            files={status?.untracked ?? []}
            onRefresh={refresh}
          />
        </div>
      </ScrollArea>

      {/* Commit form pinned at bottom */}
      {repoRoot && <CommitForm repoRoot={repoRoot} onRefresh={refresh} onOpenGitGraph={onOpenGitGraph} />}
    </div>
  );
}
