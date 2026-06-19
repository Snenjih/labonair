import { cn } from "@/lib/utils";
import type { AgentFleetTab } from "@/modules/tabs/types";
import { useTabsStore } from "@/modules/tabs";
import { useShallow } from "zustand/react/shallow";
import { AgentFleetPane } from "./AgentFleetPane";

export function AgentFleetStack() {
  const fleetTabs = useTabsStore(
    useShallow((s) => s.tabs.filter((t): t is AgentFleetTab => t.kind === "agent-fleet")),
  );
  const activeId = useTabsStore((s) => s.activeId);

  if (fleetTabs.length === 0) return null;

  return (
    <>
      {fleetTabs.map((t) => (
        <div
          key={t.id}
          className={cn(
            "absolute inset-0",
            activeId === t.id ? "z-10" : "z-0 opacity-0 pointer-events-none",
          )}
          aria-hidden={activeId !== t.id}
        >
          <AgentFleetPane tab={t} visible={activeId === t.id} />
        </div>
      ))}
    </>
  );
}
