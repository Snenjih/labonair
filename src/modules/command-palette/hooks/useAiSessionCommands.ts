import { HugeiconsIcon } from "@hugeicons/react";
import { SparklesIcon, Cancel01Icon, Refresh01Icon } from "@hugeicons/core-free-icons";
import { createElement } from "react";
import { useChatStore } from "@/modules/ai";
import type { CommandAction, CommandPage } from "../types";
import type { RegistryCallbacks } from "../types";

export function useAiSessionCommands(cb: RegistryCallbacks): {
  rootActions: CommandAction[];
  aiSessionsPage: CommandPage;
} {
  const sessions = useChatStore((s) => s.sessions);
  const activeSessionId = useChatStore((s) => s.activeSessionId);

  const sessionActions: CommandAction[] = sessions.map((s) => ({
    id: `ai-session.${s.id}`,
    title: s.title || "Untitled Session",
    section: "AI Sessions",
    rightLabel: s.id === activeSessionId ? "active" : undefined,
    icon: createElement(HugeiconsIcon, {
      icon: SparklesIcon,
      strokeWidth: 2,
      className: "size-4",
    }),
    perform: () => cb.switchAiSession(s.id),
  }));

  const rootActions: CommandAction[] = [
    {
      id: "ai.new-session",
      title: "New AI Session",
      section: "AI",
      icon: createElement(HugeiconsIcon, { icon: Refresh01Icon, strokeWidth: 2, className: "size-4" }),
      perform: () => cb.newAiSession(),
    },
    {
      id: "ai.clear-chat",
      title: "Clear Current Chat",
      section: "AI",
      icon: createElement(HugeiconsIcon, { icon: Cancel01Icon, strokeWidth: 2, className: "size-4" }),
      perform: () => cb.clearAiChat(),
    },
    ...(sessions.length > 0
      ? [
          {
            id: "ai.switch-session",
            title: "Switch AI Session...",
            subtitle: `${sessions.length} sessions`,
            section: "AI",
            icon: createElement(HugeiconsIcon, {
              icon: SparklesIcon,
              strokeWidth: 2,
              className: "size-4",
            }),
            subPageId: "ai-sessions",
          } as CommandAction,
        ]
      : []),
  ];

  return {
    rootActions,
    aiSessionsPage: {
      id: "ai-sessions",
      searchPlaceholder: "Search sessions...",
      actions: sessionActions,
    },
  };
}
