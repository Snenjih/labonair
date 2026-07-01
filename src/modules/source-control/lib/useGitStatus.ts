import { useEffect, useRef, useCallback } from "react";
import { useSourceControlStore } from "../store/sourceControlStore";
import { git } from "./gitInvoke";

const POLL_INTERVAL_MS = 3000;

// Polling stops automatically when the panel unmounts (SidebarContent conditionally renders
// SourceControlPanel only when activePanel === "source-control"). No extra active-panel
// check is needed here — the useEffect cleanup handles it on unmount.
export function useGitStatus(rootPath: string | null) {
  const setRepoInfo = useSourceControlStore((s) => s.setRepoInfo);
  const setStatus = useSourceControlStore((s) => s.setStatus);
  const setIsStatusLoading = useSourceControlStore((s) => s.setIsStatusLoading);
  const setDiffContent = useSourceControlStore((s) => s.setDiffContent);
  const setIsDiffLoading = useSourceControlStore((s) => s.setIsDiffLoading);
  const setDiffStats = useSourceControlStore((s) => s.setDiffStats);
  const selectionMode = useSourceControlStore((s) => s.selectionMode);
  const ignoreWhitespace = useSourceControlStore((s) => s.ignoreWhitespace);
  const repoRoot = useSourceControlStore((s) => s.repoRoot);
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
      return;
    }
    if (isRefreshingRef.current) return;
    isRefreshingRef.current = true;

    let isRepo: boolean;
    try {
      isRepo = await git.isRepo(rootPath);
    } catch (e) {
      const msg = String(e);
      if (msg.includes("not installed") || msg.includes("not in PATH") || msg.includes("not found")) {
        setError("git is not installed or not in PATH");
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
      root = await git.getRepoRoot(rootPath);
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
    setRepoInfo(true, root);
    if (prevRoot !== null && prevRoot !== root) {
      useSourceControlStore.getState().clearSelectedFile();
    }

    setIsStatusLoading(true);
    setIsBranchLoading(true);

    const [statusResult, branchesResult, stashResult, tagsResult, statsResult] = await Promise.allSettled([
      git.getStatus(root),
      git.getBranches(root),
      git.stashList(root),
      git.getTags(root),
      git.getDiffStats(root),
    ]);

    if (!isMountedRef.current) {
      isRefreshingRef.current = false;
      return;
    }

    if (statusResult.status === "fulfilled") setStatus(statusResult.value);
    setIsStatusLoading(false);

    if (branchesResult.status === "fulfilled") {
      setBranchList(branchesResult.value);
      const current = branchesResult.value.find((b) => b.isCurrent)?.name ?? "";
      setCurrentBranch(current);
    }
    setIsBranchLoading(false);

    if (stashResult.status === "fulfilled") setStashEntries(stashResult.value);
    if (tagsResult.status === "fulfilled") setTags(tagsResult.value);
    if (statsResult.status === "fulfilled") setDiffStats(statsResult.value);

    isRefreshingRef.current = false;
  }, [
    rootPath,
    setRepoInfo,
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

  const startPolling = useCallback(() => {
    if (intervalRef.current !== null) return;
    intervalRef.current = setInterval(() => {
      if (document.visibilityState === "visible") {
        void doRefresh();
      }
    }, POLL_INTERVAL_MS);
  }, [doRefresh]);

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
          );
        } else if (selectionMode!.type === "section") {
          const section = selectionMode!.section;
          if (section === "untracked") {
            // Untracked files don't show in git diff — use sentinel
            content = "__UNTRACKED_ONLY__";
          } else {
            const staged = section === "staged";
            content = await git.getDiff(repoRoot!, ".", staged, ignoreWhitespace);
          }
        } else if (selectionMode!.type === "all") {
          // Fetch staged and unstaged in parallel
          const [staged, unstaged] = await Promise.all([
            git.getDiff(repoRoot!, ".", true, ignoreWhitespace).catch(() => ""),
            git.getDiff(repoRoot!, ".", false, ignoreWhitespace).catch(() => ""),
          ]);
          const parts = [staged, unstaged].filter(Boolean);
          content = parts.join("\n");
        } else if (selectionMode!.type === "commit") {
          content = await git.getCommitDiff(selectionMode!.repositoryPath, selectionMode!.hash);
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
  }, [selectionMode, repoRoot, ignoreWhitespace, setDiffContent, setIsDiffLoading]);

  return { refresh: () => void doRefresh() };
}
