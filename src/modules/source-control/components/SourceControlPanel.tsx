import { ScrollArea } from "@/components/ui/scroll-area";
import { useSourceControlStore } from "../store/sourceControlStore";
import { useGitStatus } from "../lib/useGitStatus";
import { BranchBar } from "./BranchBar";
import { FileChangeList } from "./FileChangeList";
import { CommitForm } from "./CommitForm";
import { DiffViewer } from "./DiffViewer";
import { NoRepoState } from "./NoRepoState";

interface SourceControlPanelProps {
  rootPath: string | null;
  onOpenGitGraph: (repoPath: string, branch: string) => void;
}

export function SourceControlPanel({ rootPath, onOpenGitGraph }: SourceControlPanelProps) {
  const { refresh } = useGitStatus(rootPath);

  const isRepo = useSourceControlStore((s) => s.isRepo);
  const repoRoot = useSourceControlStore((s) => s.repoRoot);
  const status = useSourceControlStore((s) => s.status);

  if (!isRepo) {
    return <NoRepoState rootPath={rootPath} onRefresh={refresh} />;
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <BranchBar onOpenGitGraph={onOpenGitGraph} onRefresh={refresh} />

      <ScrollArea className="flex-1">
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

        {repoRoot && <CommitForm repoRoot={repoRoot} onRefresh={refresh} />}

        <DiffViewer />
      </ScrollArea>
    </div>
  );
}
