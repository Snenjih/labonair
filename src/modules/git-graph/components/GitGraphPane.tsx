import { useState } from "react";
import { AnimatePresence } from "motion/react";
import { Button } from "@/components/ui/button";
import { Refresh01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
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
  onOpenFile?: (path: string) => void;
}

export function GitGraphPane({ tab, onOpenFile }: Props) {
  const { commits, isLoading, error, hasMore, loadMore, reload } = useGitGraph(tab.repositoryPath);
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
        {/* Toolbar */}
        <div className="flex shrink-0 items-center justify-between border-b border-border/60 px-3 py-1">
          <span className="truncate text-[11px] text-muted-foreground">
            {tab.repositoryPath.split("/").pop()}
          </span>
          <button
            type="button"
            onClick={reload}
            disabled={isLoading}
            title="Refresh git graph"
            className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground/60 hover:bg-accent hover:text-foreground disabled:opacity-40"
          >
            <HugeiconsIcon icon={Refresh01Icon} size={11} strokeWidth={1.75} />
          </button>
        </div>

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
            onOpenFile={onOpenFile}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
