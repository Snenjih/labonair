import { useEffect, useRef, useCallback } from "react";
import { useSourceControlStore } from "../store/sourceControlStore";
import { git } from "./gitInvoke";

const POLL_INTERVAL_MS = 2000;

// Polling stops automatically when the panel unmounts (SidebarContent conditionally renders
// SourceControlPanel only when activePanel === "source-control"). No extra active-panel
// check is needed here — the useEffect cleanup handles it on unmount.
export function useGitStatus(rootPath: string | null) {
  const setRepoInfo = useSourceControlStore((s) => s.setRepoInfo);
  const setStatus = useSourceControlStore((s) => s.setStatus);
  const setIsStatusLoading = useSourceControlStore((s) => s.setIsStatusLoading);
  const setDiffContent = useSourceControlStore((s) => s.setDiffContent);
  const setIsDiffLoading = useSourceControlStore((s) => s.setIsDiffLoading);
  const selectionMode = useSourceControlStore((s) => s.selectionMode);
  const ignoreWhitespace = useSourceControlStore((s) => s.ignoreWhitespace);
  const repoRoot = useSourceControlStore((s) => s.repoRoot);
  const setStashEntries = useSourceControlStore((s) => s.setStashEntries);
  const setBranchList = useSourceControlStore((s) => s.setBranchList);
  const setIsBranchLoading = useSourceControlStore((s) => s.setIsBranchLoading);
  const setTags = useSourceControlStore((s) => s.setTags);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isMountedRef = useRef(true);

  const doRefresh = useCallback(async () => {
    if (!rootPath) {
      setRepoInfo(false, null);
      return;
    }

    let isRepo: boolean;
    try {
      isRepo = await git.isRepo(rootPath);
    } catch {
      setRepoInfo(false, null);
      return;
    }

    if (!isMountedRef.current) return;

    if (!isRepo) {
      setRepoInfo(false, null);
      return;
    }

    let root: string;
    try {
      root = await git.getRepoRoot(rootPath);
    } catch {
      setRepoInfo(false, null);
      return;
    }

    if (!isMountedRef.current) return;

    setRepoInfo(true, root);

    setIsStatusLoading(true);
    try {
      const status = await git.getStatus(root);
      if (isMountedRef.current) {
        setStatus(status);
      }
    } catch {
      // silently ignore status errors during polling
    } finally {
      if (isMountedRef.current) {
        setIsStatusLoading(false);
      }
    }

    // Fetch branches
    setIsBranchLoading(true);
    try {
      const branches = await git.getBranches(root);
      if (isMountedRef.current) {
        setBranchList(branches);
      }
    } catch {
      // silently ignore
    } finally {
      if (isMountedRef.current) {
        setIsBranchLoading(false);
      }
    }

    // Fetch stash entries
    try {
      const stashes = await git.stashList(root);
      if (isMountedRef.current) {
        setStashEntries(stashes);
      }
    } catch {
      // silently ignore
    }

    // Fetch tags
    try {
      const tags = await git.getTags(root);
      if (isMountedRef.current) {
        setTags(tags);
      }
    } catch {
      // silently ignore
    }
  }, [rootPath, setRepoInfo, setStatus, setIsStatusLoading, setStashEntries, setBranchList, setIsBranchLoading, setTags]);

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

        if (selectionMode!.type === 'file') {
          content = await git.getDiff(repoRoot!, selectionMode!.path, selectionMode!.staged, ignoreWhitespace);
        } else if (selectionMode!.type === 'section') {
          const section = selectionMode!.section;
          if (section === 'untracked') {
            // Untracked files don't show in git diff — use sentinel
            content = '__UNTRACKED_ONLY__';
          } else {
            const staged = section === 'staged';
            content = await git.getDiff(repoRoot!, '.', staged, ignoreWhitespace);
          }
        } else if (selectionMode!.type === 'all') {
          // Fetch staged and unstaged in parallel
          const [staged, unstaged] = await Promise.all([
            git.getDiff(repoRoot!, '.', true, ignoreWhitespace).catch(() => ''),
            git.getDiff(repoRoot!, '.', false, ignoreWhitespace).catch(() => ''),
          ]);
          const parts = [staged, unstaged].filter(Boolean);
          content = parts.join('\n');
        } else if (selectionMode!.type === 'commit') {
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
