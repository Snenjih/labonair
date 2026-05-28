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
      const cwd = activeTab.sessions[activeTab.activePaneId]?.cwd;
      if (cwd) return cwd;
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
      const cwd = activeTab.sessions[activeTab.activePaneId]?.cwd;
      if (cwd) return cwd;
    }
    return lastLocalCwd.current ?? home ?? undefined;
  }, [home]);

  return { explorerRoot, inheritedCwdForNewTab };
}
