import { createElement } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Add01Icon,
  AntennaIcon,
  ComputerTerminal02Icon,
  LayoutGridIcon,
} from "@hugeicons/core-free-icons";
import { useTabsStore, selectActiveTabKind } from "@/modules/tabs";
import type { CommandAction } from "../types";
import type { AgentFleetTab } from "@/modules/tabs/types";

export function useAgentFleetCommands(): { rootActions: CommandAction[] } {
  const activeTabKind = useTabsStore(selectActiveTabKind);
  const isFleetTab = activeTabKind === "agent-fleet";

  const rootActions: CommandAction[] = [
    {
      id: "fleet.new-tab",
      title: "New Agent Fleet Tab",
      section: "Agent Fleet",
      icon: createElement(HugeiconsIcon, {
        icon: ComputerTerminal02Icon,
        strokeWidth: 2,
        className: "size-4",
      }),
      perform: () => {
        const id = useTabsStore.getState().newAgentFleetTab();
        useTabsStore.getState().setActiveId(id);
      },
    },
    ...(isFleetTab
      ? ([
          {
            id: "fleet.add-agent",
            title: "Add Agent to Fleet",
            section: "Agent Fleet",
            icon: createElement(HugeiconsIcon, {
              icon: Add01Icon,
              strokeWidth: 2,
              className: "size-4",
            }),
            perform: () =>
              window.dispatchEvent(
                new CustomEvent("nexum:fleet-action", { detail: "launch" }),
              ),
          },
          {
            id: "fleet.toggle-view",
            title: "Toggle Grid / Focus View",
            section: "Agent Fleet",
            icon: createElement(HugeiconsIcon, {
              icon: LayoutGridIcon,
              strokeWidth: 2,
              className: "size-4",
            }),
            perform: () => {
              const s = useTabsStore.getState();
              const t = s.tabs.find((x) => x.id === s.activeId);
              if (t?.kind === "agent-fleet") {
                s.updateFleetViewMode(
                  s.activeId,
                  (t as AgentFleetTab).viewMode === "grid" ? "focus" : "grid",
                );
              }
            },
          },
          {
            id: "fleet.broadcast",
            title: "Broadcast to All Agents…",
            section: "Agent Fleet",
            icon: createElement(HugeiconsIcon, {
              icon: AntennaIcon,
              strokeWidth: 2,
              className: "size-4",
            }),
            perform: () =>
              window.dispatchEvent(
                new CustomEvent("nexum:fleet-action", { detail: "broadcast-focus" }),
              ),
          },
        ] satisfies CommandAction[])
      : []),
  ];

  return { rootActions };
}
