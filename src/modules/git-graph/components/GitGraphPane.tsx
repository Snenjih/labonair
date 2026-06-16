import { useState } from "react";
import { AnimatePresence } from "motion/react";
import { Button } from "@/components/ui/button";
import type { GitGraphTab } from "@/modules/tabs/types";
import { useGitGraph } from "../lib/useGitGraph";
import type { LayoutCommit } from "../types";
import { GitGraphCanvas } from "./GitGraphCanvas";
import { CommitDetailPanel } from "./CommitDetailPanel";

function LoadingSkeleton() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
      <div className="h-4 w-4 animate-spin rounded-full border-2 border-border border-t-foreground" />
      <p className="text-xs">Loading commits...</p>
    </div>
  );
}

function ErrorState({ error }: { error: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
      <p className="text-sm font-medium text-destructive">Failed to load git log</p>
      <p className="max-w-xs text-xs text-muted-foreground">{error}</p>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-full items-center justify-center">
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

interface Props {
  tab: GitGraphTab;
}

export function GitGraphPane({ tab }: Props) {
  const { commits, isLoading, error, hasMore, loadMore } = useGitGraph(tab.repositoryPath);
  const [selectedCommit, setSelectedCommit] = useState<LayoutCommit | null>(null);

  if (isLoading && commits.length === 0) {
    return <LoadingSkeleton />;
  }

  if (error) {
    return <ErrorState error={error} />;
  }

  if (commits.length === 0) {
    return <EmptyState message="No commits found" />;
  }

  return (
    <div className="flex h-full min-h-0">
      {/* Graph canvas */}
      <div className="flex min-h-0 flex-1 flex-col">
        <GitGraphCanvas
          commits={commits}
          onSelectCommit={setSelectedCommit}
          selectedHash={selectedCommit?.hash ?? null}
        />
        {hasMore && (
          <div className="shrink-0 border-t border-border/60 p-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={loadMore}
              disabled={isLoading}
              className="w-full text-xs"
            >
              {isLoading ? "Loading..." : "Load more commits"}
            </Button>
          </div>
        )}
      </div>

      {/* Detail panel */}
      <AnimatePresence>
        {selectedCommit && (
          <CommitDetailPanel
            key={selectedCommit.hash}
            commit={selectedCommit}
            repositoryPath={tab.repositoryPath}
            onClose={() => setSelectedCommit(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
