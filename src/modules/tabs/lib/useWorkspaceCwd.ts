import { useCallback, useEffect, useRef } from "react";
import { useTabsStore } from "../store/tabsStore";

type Result = {
  explorerRoot: string | null;
  inheritedCwdForNewTab: () => string | undefined;
};

export function useWorkspaceCwd(home: string | null): Result {
  const lastLocalCwd = useRef<string | null>(null);

  const explorerRoot = useTabsStore((s) => {
    const activeTab = s.tabs.find((t) => t.id === s.activeId);
    if (activeTab?.kind === "workspace") {
      // Only a local session's cwd is a valid *local* fs path — an active
      // SSH pane's cwd is a remote path and must never leak into a new
      // local tab's initial cwd or a local fs read (see
      // inheritedCwdForNewTab below for where that used to happen).
      const session = activeTab.sessions[activeTab.activePaneId];
      if (session?.kind === "local" && session.cwd) return session.cwd;
    }
    if (lastLocalCwd.current) return lastLocalCwd.current;
    for (let i = s.tabs.length - 1; i >= 0; i--) {
      const t = s.tabs[i];
      if (t.kind !== "workspace") continue;
      for (const sess of Object.values(t.sessions)) {
        if (sess.kind === "local" && sess.cwd) return sess.cwd;
      }
    }
    return home;
  });

  useEffect(() => {
    return useTabsStore.subscribe((s) => {
      const tab = s.tabs.find((t) => t.id === s.activeId);
      if (tab?.kind !== "workspace") return;
      const sess = tab.sessions[tab.activePaneId];
      if (sess?.kind === "local" && sess.cwd) lastLocalCwd.current = sess.cwd;
    });
  }, []);

  const inheritedCwdForNewTab = useCallback((): string | undefined => {
    const { tabs, activeId } = useTabsStore.getState();
    const activeTab = tabs.find((t) => t.id === activeId);
    if (activeTab?.kind === "workspace") {
      // Must be a local session — a remote SSH pane's cwd is not a valid
      // path on THIS machine. Passing it through here used to seed a
      // brand-new local tab's cwd with a remote path, and the sidebar
      // Explorer/breadcrumb would then eagerly try to `fs_read_dir` it,
      // surfacing "No such file or directory (os error 2)" until the new
      // tab's own pty reported its real cwd via OSC7 a moment later.
      const session = activeTab.sessions[activeTab.activePaneId];
      if (session?.kind === "local" && session.cwd) return session.cwd;
    }
    return lastLocalCwd.current ?? home ?? undefined;
  }, [home]);

  return { explorerRoot, inheritedCwdForNewTab };
}
