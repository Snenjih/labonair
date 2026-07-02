import { useCallback, useEffect, useState } from "react";
import { git } from "@/modules/source-control/lib/gitInvoke";
import type { LayoutCommit } from "../types";
import { buildGraphLayout } from "./graphLayout";

const PAGE_SIZE = 500;
// Remote hosts pay a network round-trip plus remote CPU per commit and must
// finish within the SSH session's existing exec timeout — a smaller first
// page keeps that comfortably bounded; "Load more" still works identically.
const REMOTE_PAGE_SIZE = 200;
const PAGE_INCREMENT = 200;

/** Pure so it's testable without mounting the hook — see useGitGraph.test.ts. */
export function initialGraphPageSize(sessionId: string | undefined): number {
  return sessionId ? REMOTE_PAGE_SIZE : PAGE_SIZE;
}

export function useGitGraph(repositoryPath: string, sessionId?: string) {
  const initialPageSize = initialGraphPageSize(sessionId);
  const [commits, setCommits] = useState<LayoutCommit[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalLoaded, setTotalLoaded] = useState(initialPageSize);
  const [hasMore, setHasMore] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);

  const load = useCallback(
    async (limit: number) => {
      setIsLoading(true);
      setError(null);
      try {
        const raw = await git.getLog(repositoryPath, limit, true, sessionId);
        setHasMore(raw.length === limit);
        setCommits(buildGraphLayout(raw));
        setTotalLoaded(limit);
        setLastRefreshedAt(new Date());
      } catch (e) {
        setError(String(e));
      } finally {
        setIsLoading(false);
      }
    },
    [repositoryPath, sessionId],
  );

  useEffect(() => {
    void load(initialPageSize);
    // Does NOT auto-refresh — path is locked at tab open time
  }, [load, initialPageSize]);

  const loadMore = useCallback(() => {
    void load(totalLoaded + PAGE_INCREMENT);
  }, [load, totalLoaded]);

  const reload = useCallback(() => {
    void load(totalLoaded);
  }, [load, totalLoaded]);

  return { commits, isLoading, error, hasMore, loadMore, reload, lastRefreshedAt };
}
