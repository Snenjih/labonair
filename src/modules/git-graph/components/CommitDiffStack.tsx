import { useShallow } from "zustand/react/shallow";
import { cn } from "@/lib/utils";
import { useTabsStore } from "@/modules/tabs/store/tabsStore";
import type { CommitDiffTab } from "@/modules/tabs/types";
import { CommitDiffTabPane } from "./CommitDiffTabPane";

export function CommitDiffStack() {
  const tabs = useTabsStore(
    useShallow((s) => s.tabs.filter((t): t is CommitDiffTab => t.kind === "commit-diff")),
  );
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
            <CommitDiffTabPane repositoryPath={t.repositoryPath} hash={t.hash} sessionId={t.sessionId} />
          </div>
        );
      })}
    </div>
  );
}
