import { cn } from "@/lib/utils";
import { useTabsStore } from "@/modules/tabs/store/tabsStore";
import type { GitGraphTab } from "@/modules/tabs/types";
import { useShallow } from "zustand/react/shallow";
import { GitGraphPane } from "./GitGraphPane";

export function GitGraphStack() {
  const tabs = useTabsStore(
    useShallow((s) => s.tabs.filter((t): t is GitGraphTab => t.kind === "git-graph")),
  );
  const activeId = useTabsStore((s) => s.activeId);

  if (tabs.length === 0) return null;

  return (
    <>
      {tabs.map((tab) => (
        <div
          key={tab.id}
          className={cn("h-full", tab.id === activeId ? "block" : "hidden")}
        >
          <GitGraphPane tab={tab} />
        </div>
      ))}
    </>
  );
}
