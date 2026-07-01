import { cn } from "@/lib/utils";
import type { GitDiffTab } from "@/modules/tabs/types";
import { useTabsStore } from "@/modules/tabs/store/tabsStore";
import { useShallow } from "zustand/react/shallow";
import { GitDiffPane } from "./GitDiffPane";

export function GitDiffStack() {
  const tabs = useTabsStore(useShallow((s) => s.tabs.filter((t): t is GitDiffTab => t.kind === "git-diff")));
  const activeId = useTabsStore((s) => s.activeId);
  if (tabs.length === 0) return null;
  return (
    <div className="relative h-full w-full">
      {tabs.map((t) => {
        const visible = t.id === activeId;
        return (
          <div
            key={t.id}
            className={cn("absolute inset-0", !visible && "invisible pointer-events-none")}
            aria-hidden={!visible}
          >
            <GitDiffPane repoRoot={t.repoRoot} filePath={t.filePath} staged={t.staged} section={t.section} />
          </div>
        );
      })}
    </div>
  );
}
