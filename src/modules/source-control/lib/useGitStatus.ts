import { useCallback, useEffect, useRef } from "react";
import type { ExplorerTarget } from "@/modules/explorer/lib/useExplorerTarget";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { useSourceControlStore } from "../store/sourceControlStore";
import { git } from "./gitInvoke";

/** Remote polling is inherently slower per round-trip (the SSH session's
 *  underlying channel is serialized), so it backs off from whatever the
 *  user configured for local instead of adding a second, redundant setting. */
const REMOTE_POLL_MULTIPLIER = 2.5;

/** Pure so it's testable without mounting the hook — see useGitStatus.test.ts. */
export function effectivePollIntervalMs(pollIntervalMs: number, target: ExplorerTarget): number {
  return target.type === "remote" ? Math.round(pollIntervalMs * REMOTE_POLL_MULTIPLIER) : pollIntervalMs;
}

// Polling stops automatically when the panel unmounts (SidebarContent conditionally renders
// SourceControlPanel only when activePanel === "source-control"). No extra active-panel
// check is needed here — the useEffect cleanup handles it on unmount.
export function useGitStatus(target: ExplorerTarget) {
  const rootPath = target.path;
  const targetSessionId = target.type === "remote" ? target.sessionId : undefined;
  const targetHostId = target.type === "remote" ? target.hostId : undefined;
  const pollIntervalMs = usePreferencesStore((s) => s.gitStatusPollIntervalMs);

  const setRepoInfo = useSourceControlStore((s) => s.setRepoInfo);
  const setTarget = useSourceControlStore((s) => s.setTarget);
  const setStatus = useSourceControlStore((s) => s.setStatus);
  const setIsStatusLoading = useSourceControlStore((s) => s.setIsStatusLoading);
  const setDiffContent = useSourceControlStore((s) => s.setDiffContent);
  const setIsDiffLoading = useSourceControlStore((s) => s.setIsDiffLoading);
  const setDiffStats = useSourceControlStore((s) => s.setDiffStats);
  const selectionMode = useSourceControlStore((s) => s.selectionMode);
  const ignoreWhitespace = useSourceControlStore((s) => s.ignoreWhitespace);
  const repoRoot = useSourceControlStore((s) => s.repoRoot);
  const sessionId = useSourceControlStore((s) => s.sessionId);
  const setStashEntries = useSourceControlStore((s) => s.setStashEntries);
  const setBranchList = useSourceControlStore((s) => s.setBranchList);
  const setIsBranchLoading = useSourceControlStore((s) => s.setIsBranchLoading);
  const setCurrentBranch = useSourceControlStore((s) => s.setCurrentBranch);
  const setTags = useSourceControlStore((s) => s.setTags);
  const setError = useSourceControlStore((s) => s.setError);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isMountedRef = useRef(true);
  const isRefreshingRef = useRef(false);

  const doRefresh = useCallback(async () => {
    if (!rootPath) {
      setRepoInfo(false, null);
      setTarget(null, null);
      return;
    }
    if (isRefreshingRef.current) return;
    isRefreshingRef.current = true;
    setTarget(targetHostId ?? null, targetSessionId ?? null);

    let isRepo: boolean;
    try {
      isRepo = await git.isRepo(rootPath, targetSessionId);
    } catch (e) {
      const msg = String(e);
      if (msg.includes("not installed") || msg.includes("not in PATH") || msg.includes("not found")) {
        setError(msg);
      }
      setRepoInfo(false, null);
      isRefreshingRef.current = false;
      return;
    }

    if (!isMountedRef.current) {
      isRefreshingRef.current = false;
      return;
    }

    if (!isRepo) {
      setRepoInfo(false, null);
      isRefreshingRef.current = false;
      return;
    }

    let root: string;
    try {
      root = await git.getRepoRoot(rootPath, targetSessionId);
    } catch {
      setRepoInfo(false, null);
      isRefreshingRef.current = false;
      return;
    }

    if (!isMountedRef.current) {
      isRefreshingRef.current = false;
      return;
    }

    // Check if repo root changed and clear stale diff selection
    const prevRoot = useSourceControlStore.getState().repoRoot;
    setError(null);
    setRepoInfo(true, root);
    if (prevRoot !== null && prevRoot !== root) {
      useSourceControlStore.getState().clearSelectedFile();
    }

    setIsStatusLoading(true);
    setIsBranchLoading(true);

    try {
      const state = await git.getWorkspaceState(root, targetSessionId);
      if (!isMountedRef.current) {
        isRefreshingRef.current = false;
        return;
      }
      setStatus(state.status);
      setBranchList(state.branches);
      setCurrentBranch(state.currentBranch);
      setStashEntries(state.stash);
      setTags(state.tags);
      setDiffStats(state.diffStats);
    } catch (e) {
      const msg = String(e);
      if (msg.includes("not installed") || msg.includes("not in PATH")) {
        setError(msg);
      }
    } finally {
      setIsStatusLoading(false);
      setIsBranchLoading(false);
    }

    isRefreshingRef.current = false;
  }, [
    rootPath,
    targetSessionId,
    targetHostId,
    setRepoInfo,
    setTarget,
    setStatus,
    setIsStatusLoading,
    setStashEntries,
    setBranchList,
    setIsBranchLoading,
    setCurrentBranch,
    setTags,
    setDiffStats,
    setError,
  ]);

  const effectiveIntervalMs = effectivePollIntervalMs(pollIntervalMs, target);

  const startPolling = useCallback(() => {
    if (intervalRef.current !== null) return;
    intervalRef.current = setInterval(() => {
      if (document.visibilityState === "visible") {
        void doRefresh();
      }
    }, effectiveIntervalMs);
  }, [doRefresh, effectiveIntervalMs]);

  const stopPolling = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // Initial fetch + polling setup
  useEffect(() => {
    isMountedRef.current = true;
    void doRefresh();
    startPolling();

    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void doRefresh();
        startPolling();
      } else {
        stopPolling();
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      isMountedRef.current = false;
      isRefreshingRef.current = false;
      stopPolling();
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [doRefresh, startPolling, stopPolling]);

  // Load diff when selectionMode or ignoreWhitespace changes
  useEffect(() => {
    if (!selectionMode || !repoRoot) {
      setDiffContent(null);
      return;
    }

    let cancelled = false;
    setIsDiffLoading(true);

    async function loadDiff() {
      try {
        let content: string | null = null;

        if (selectionMode!.type === "file") {
          content = await git.getDiff(
            repoRoot!,
            selectionMode!.path,
            selectionMode!.staged,
            ignoreWhitespace,
            sessionId ?? undefined,
          );
        } else if (selectionMode!.type === "section") {
          const section = selectionMode!.section;
          if (section === "untracked") {
            // Untracked files don't show in git diff — use sentinel
            content = "__UNTRACKED_ONLY__";
          } else {
            const staged = section === "staged";
            content = await git.getDiff(repoRoot!, ".", staged, ignoreWhitespace, sessionId ?? undefined);
          }
        } else if (selectionMode!.type === "all") {
          // Fetch staged and unstaged in parallel
          const [staged, unstaged] = await Promise.all([
            git.getDiff(repoRoot!, ".", true, ignoreWhitespace, sessionId ?? undefined).catch(() => ""),
            git.getDiff(repoRoot!, ".", false, ignoreWhitespace, sessionId ?? undefined).catch(() => ""),
          ]);
          const parts = [staged, unstaged].filter(Boolean);
          content = parts.join("\n");
        } else if (selectionMode!.type === "commit") {
          content = await git.getCommitDiff(
            selectionMode!.repositoryPath,
            selectionMode!.hash,
            selectionMode!.sessionId,
          );
        }

        if (!cancelled) {
          setDiffContent(content);
        }
      } catch {
        if (!cancelled) {
          setDiffContent(null);
        }
      } finally {
        if (!cancelled) {
          setIsDiffLoading(false);
        }
      }
    }

    void loadDiff();

    return () => {
      cancelled = true;
    };
  }, [selectionMode, repoRoot, sessionId, ignoreWhitespace, setDiffContent, setIsDiffLoading]);

  return { refresh: () => void doRefresh() };
}
