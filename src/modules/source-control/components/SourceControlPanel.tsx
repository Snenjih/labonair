import { ScrollArea } from "@/components/ui/scroll-area";
import { useSourceControlStore } from "../store/sourceControlStore";
import { useGitStatus } from "../lib/useGitStatus";
import { BranchBar } from "./BranchBar";
import { FileChangeList } from "./FileChangeList";
import { CommitForm } from "./CommitForm";
import { DiffViewer } from "./DiffViewer";
import { NoRepoState } from "./NoRepoState";
import { StashPanel } from "./StashPanel";

interface SourceControlPanelProps {
  rootPath: string | null;
  onOpenGitGraph: (repoPath: string, branch: string) => void;
}

export function SourceControlPanel({ rootPath, onOpenGitGraph }: SourceControlPanelProps) {
  const { refresh } = useGitStatus(rootPath);

  const isRepo = useSourceControlStore((s) => s.isRepo);
  const repoRoot = useSourceControlStore((s) => s.repoRoot);
  const status = useSourceControlStore((s) => s.status);
  const selectAll = useSourceControlStore((s) => s.selectAll);
  const clearSelectedFile = useSourceControlStore((s) => s.clearSelectedFile);
  const selectionMode = useSourceControlStore((s) => s.selectionMode);

  const stagedCount = status?.staged.length ?? 0;
  const unstagedCount = status?.unstaged.length ?? 0;
  const untrackedCount = status?.untracked.length ?? 0;
  const totalChanges = stagedCount + unstagedCount + untrackedCount;
  const isAllSelected = selectionMode?.type === 'all';

  if (!isRepo) {
    return <NoRepoState rootPath={rootPath} onRefresh={refresh} />;
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <BranchBar onOpenGitGraph={onOpenGitGraph} onRefresh={refresh} />

      {/* Panel header: change count + stage all */}
      <div className="flex h-8 shrink-0 items-center justify-between border-b border-border/50 px-3">
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
        {totalChanges > 0 && (
          <button
            type="button"
            className="rounded px-2 py-0.5 text-[10px] font-medium text-muted-foreground/60 transition-colors hover:bg-accent/50 hover:text-foreground/80"
            onClick={() => (isAllSelected ? clearSelectedFile() : selectAll())}
          >
            {isAllSelected ? "Deselect All" : "Stage All"}
          </button>
        )}
      </div>

      {status?.hasConflicts && (
        <div className="mx-3 my-1 rounded border border-orange-500/30 bg-orange-500/10 px-2 py-1 text-[10px] text-orange-400">
          Merge conflicts detected — resolve before committing.
        </div>
      )}

      {/* Scrollable file list */}
      <ScrollArea className="min-h-0 flex-1">
        <div className="py-1">
          <FileChangeList
            files={status?.staged ?? []}
            section="staged"
            onRefresh={refresh}
          />
          <FileChangeList
            files={status?.unstaged ?? []}
            section="unstaged"
            onRefresh={refresh}
          />
          <FileChangeList
            files={status?.untracked ?? []}
            section="untracked"
            onRefresh={refresh}
          />
        </div>

        {repoRoot && <StashPanel repoRoot={repoRoot} onRefresh={refresh} />}
        <DiffViewer />
      </ScrollArea>

      {/* Commit form pinned at bottom */}
      {repoRoot && <CommitForm repoRoot={repoRoot} onRefresh={refresh} />}
    </div>
  );
}
