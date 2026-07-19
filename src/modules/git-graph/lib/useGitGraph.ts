import { useCallback, useEffect, useState } from "react";
import { git } from "@/modules/source-control/lib/gitInvoke";
import type { CommitInfo, LayoutCommit } from "../types";
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

/** Fetches one page of `limit` commits starting at `skip`, over-fetching by
 *  one extra commit so `hasMore` can be determined directly instead of
 *  guessing from `raw.length === limit` — which is wrong whenever the repo
 *  has exactly `limit` commits left. The extra commit is sliced off before
 *  returning. */
async function fetchPage(
  repositoryPath: string,
  limit: number,
  skip: number,
  sessionId: string | undefined,
): Promise<{ page: CommitInfo[]; hasMore: boolean }> {
  const raw = await git.getLog(repositoryPath, limit + 1, true, sessionId, skip);
  const hasMore = raw.length > limit;
  return { page: hasMore ? raw.slice(0, limit) : raw, hasMore };
}

export function useGitGraph(repositoryPath: string, sessionId?: string) {
  const initialPageSize = initialGraphPageSize(sessionId);
  // Undecorated commits as fetched from the backend — kept around so
  // `loadMore` can append its new page to it instead of re-fetching
  // everything already loaded.
  const [rawCommits, setRawCommits] = useState<CommitInfo[]>([]);
  const [commits, setCommits] = useState<LayoutCommit[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalLoaded, setTotalLoaded] = useState(initialPageSize);
  const [hasMore, setHasMore] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);

  // Full (re-)load from HEAD — used on mount and for `reload`, since the
  // repo may have new commits since the last load and a partial re-walk
  // wouldn't see them.
  const load = useCallback(
    async (limit: number) => {
      setIsLoading(true);
      setError(null);
      try {
        const { page, hasMore: more } = await fetchPage(repositoryPath, limit, 0, sessionId);
        setRawCommits(page);
        setCommits(buildGraphLayout(page));
        setTotalLoaded(limit);
        setHasMore(more);
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

  // Real offset pagination: fetches only the next PAGE_INCREMENT commits via
  // `--skip=totalLoaded` and appends them, instead of re-walking `git log`
  // from scratch with an ever-larger `-n` (O(n^2) cumulative cost) on every
  // click. Lane assignment in `buildGraphLayout` needs full history context
  // to stay correct (it's a stateful left-to-right sweep, and that state
  // isn't exposed/resumable), so the layout step still re-processes the
  // whole — now correctly paginated — array on every page; only the git
  // fetch itself is truly incremental.
  const loadMorePage = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { page, hasMore: more } = await fetchPage(repositoryPath, PAGE_INCREMENT, totalLoaded, sessionId);
      const appended = [...rawCommits, ...page];
      setRawCommits(appended);
      setCommits(buildGraphLayout(appended));
      setTotalLoaded(totalLoaded + page.length);
      setHasMore(more);
      setLastRefreshedAt(new Date());
    } catch (e) {
      setError(String(e));
    } finally {
      setIsLoading(false);
    }
  }, [repositoryPath, sessionId, totalLoaded, rawCommits]);

  const loadMore = useCallback(() => {
    void loadMorePage();
  }, [loadMorePage]);

  const reload = useCallback(() => {
    void load(totalLoaded);
  }, [load, totalLoaded]);

  return { commits, isLoading, error, hasMore, loadMore, reload, lastRefreshedAt };
}
