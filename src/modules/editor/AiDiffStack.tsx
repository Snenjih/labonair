import { cn } from "@/lib/utils";
import type { AiDiffTab } from "@/modules/tabs";
import { useTabsStore } from "@/modules/tabs/store/tabsStore";
import { useShallow } from "zustand/react/shallow";
import { AiDiffPane } from "./AiDiffPane";

type Props = {
  onAccept: (approvalId: string) => void;
  onReject: (approvalId: string) => void;
};

export function AiDiffStack({ onAccept, onReject }: Props) {
  const diffs = useTabsStore(
    useShallow((s) => s.tabs.filter((t): t is AiDiffTab => t.kind === "ai-diff")),
  );
  const activeId = useTabsStore((s) => s.activeId);
  if (diffs.length === 0) return null;
  return (
    <div className="relative h-full w-full">
      {diffs.map((t) => {
        const visible = t.id === activeId;
        return (
          <div
            key={t.id}
            className={cn(
              "absolute inset-0",
              !visible && "invisible pointer-events-none",
            )}
            aria-hidden={!visible}
          >
            <AiDiffPane
              path={t.path}
              originalContent={t.originalContent}
              proposedContent={t.proposedContent}
              status={t.status}
              isNewFile={t.isNewFile}
              onAccept={() => onAccept(t.approvalId)}
              onReject={() => onReject(t.approvalId)}
            />
          </div>
        );
      })}
    </div>
  );
}
