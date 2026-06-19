import { useState, useEffect, useCallback } from "react";
import { git } from "@/modules/source-control/lib/gitInvoke";
import { buildGraphLayout } from "./graphLayout";
import type { LayoutCommit } from "../types";

const PAGE_SIZE = 500;
const PAGE_INCREMENT = 200;

export function useGitGraph(repositoryPath: string) {
  const [commits, setCommits] = useState<LayoutCommit[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalLoaded, setTotalLoaded] = useState(PAGE_SIZE);
  const [hasMore, setHasMore] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);

  const load = useCallback(
    async (limit: number) => {
      setIsLoading(true);
      setError(null);
      try {
        const raw = await git.getLog(repositoryPath, limit, true);
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
    [repositoryPath],
  );

  useEffect(() => {
    void load(PAGE_SIZE);
    // Does NOT auto-refresh — path is locked at tab open time
  }, [load]);

  const loadMore = useCallback(() => {
    void load(totalLoaded + PAGE_INCREMENT);
  }, [load, totalLoaded]);

  const reload = useCallback(() => {
    void load(totalLoaded);
  }, [load, totalLoaded]);

  return { commits, isLoading, error, hasMore, loadMore, reload, lastRefreshedAt };
}
