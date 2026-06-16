import { ScrollArea } from "@/components/ui/scroll-area";
import { EyeIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { cn } from "@/lib/utils";
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
  const selectionMode = useSourceControlStore((s) => s.selectionMode);
  const selectAll = useSourceControlStore((s) => s.selectAll);
  const clearSelectedFile = useSourceControlStore((s) => s.clearSelectedFile);

  const totalChanges =
    (status?.staged.length ?? 0) +
    (status?.unstaged.length ?? 0) +
    (status?.untracked.length ?? 0);

  const isAllSelected = selectionMode?.type === 'all';

  if (!isRepo) {
    return <NoRepoState rootPath={rootPath} onRefresh={refresh} />;
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <BranchBar onOpenGitGraph={onOpenGitGraph} onRefresh={refresh} />

      {status?.hasConflicts && (
        <div className="mx-2 mb-1 rounded border border-orange-500/30 bg-orange-500/10 px-2 py-1 text-[10px] text-orange-400">
          Merge conflicts detected — resolve before committing.
        </div>
      )}

      <ScrollArea className="flex-1">
        <div className="py-1">
          {totalChanges > 0 && (
            <button
              type="button"
              className={cn(
                "mx-2 mb-1 flex h-6 w-[calc(100%-1rem)] items-center gap-1.5 rounded px-2 text-[10px] transition-colors",
                isAllSelected
                  ? "bg-accent/40 text-foreground/90"
                  : "bg-muted/20 text-muted-foreground/70 hover:bg-muted/40 hover:text-muted-foreground"
              )}
              onClick={() => (isAllSelected ? clearSelectedFile() : selectAll())}
            >
              <HugeiconsIcon icon={EyeIcon} size={10} strokeWidth={2} />
              <span>All Changes</span>
              <span className="ml-auto font-mono text-[9px] tabular-nums opacity-60">
                {totalChanges}
              </span>
            </button>
          )}

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

        {repoRoot && <CommitForm repoRoot={repoRoot} onRefresh={refresh} />}

        <DiffViewer />
      </ScrollArea>
    </div>
  );
}
