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
  const selectedFile = useSourceControlStore((s) => s.selectedFile);
  const repoRoot = useSourceControlStore((s) => s.repoRoot);

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
  }, [rootPath, setRepoInfo, setStatus, setIsStatusLoading]);

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

  // Load diff when selectedFile changes
  useEffect(() => {
    if (!selectedFile || !repoRoot) {
      setDiffContent(null);
      return;
    }

    let cancelled = false;
    setIsDiffLoading(true);
    git
      .getDiff(repoRoot, selectedFile.path, selectedFile.staged)
      .then((content) => {
        if (!cancelled) {
          setDiffContent(content);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDiffContent(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsDiffLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selectedFile, repoRoot, setDiffContent, setIsDiffLoading]);

  return { refresh: () => void doRefresh() };
}
