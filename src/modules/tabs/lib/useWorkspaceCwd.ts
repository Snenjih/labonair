import { useCallback, useEffect, useMemo, useRef } from "react";
import type { Tab } from "./useTabs";

type Result = {
  explorerRoot: string | null;
  inheritedCwdForNewTab: () => string | undefined;
};

function getActivePaneCwd(tab: Tab): string | undefined {
  if (tab.kind !== "workspace") return undefined;
  const session = tab.sessions[tab.activePaneId];
  return session?.cwd;
}

function getAnyWorkspaceCwd(tabs: Tab[]): string | undefined {
  for (let i = tabs.length - 1; i >= 0; i--) {
    const t = tabs[i];
    if (t.kind !== "workspace") continue;
    for (const session of Object.values(t.sessions)) {
      if (session.kind === "local" && session.cwd) return session.cwd;
    }
  }
  return undefined;
}

export function useWorkspaceCwd(
  activeTab: Tab | undefined,
  tabs: Tab[],
  home: string | null,
): Result {
  const lastLocalCwd = useRef<string | null>(null);

  useEffect(() => {
    if (!activeTab || activeTab.kind !== "workspace") return;
    const session = activeTab.sessions[activeTab.activePaneId];
    if (session?.kind === "local" && session.cwd) {
      lastLocalCwd.current = session.cwd;
    }
  }, [activeTab]);

  const explorerRoot = useMemo<string | null>(() => {
    const activeCwd = activeTab ? getActivePaneCwd(activeTab) : undefined;
    if (activeCwd) return activeCwd;
    if (lastLocalCwd.current) return lastLocalCwd.current;
    const anyCwd = getAnyWorkspaceCwd(tabs);
    if (anyCwd) return anyCwd;
    return home;
  }, [activeTab, tabs, home]);

  const inheritedCwdForNewTab = useCallback((): string | undefined => {
    const activeCwd = activeTab ? getActivePaneCwd(activeTab) : undefined;
    if (activeCwd) return activeCwd;
    return lastLocalCwd.current ?? home ?? undefined;
  }, [activeTab, home]);

  return { explorerRoot, inheritedCwdForNewTab };
}
