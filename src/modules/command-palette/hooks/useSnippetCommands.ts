import { HugeiconsIcon } from "@hugeicons/react";
import { CheckListIcon } from "@hugeicons/core-free-icons";
import { createElement } from "react";
import { useSnippetsStore } from "@/modules/ai/store/snippetsStore";
import type { CommandAction, CommandPage } from "../types";
import type { RegistryCallbacks } from "../types";

export function useSnippetCommands(cb: RegistryCallbacks): {
  rootActions: CommandAction[];
  snippetsPage: CommandPage;
} {
  const snippets = useSnippetsStore((s) => s.snippets);

  const snippetActions: CommandAction[] = snippets.map((s) => ({
    id: `snippet.${s.id}`,
    title: s.name,
    subtitle: s.description || `#${s.handle}`,
    section: "Snippets",
    icon: createElement(HugeiconsIcon, {
      icon: CheckListIcon,
      strokeWidth: 2,
      className: "size-4",
    }),
    perform: () => cb.injectIntoTerminal(s.content),
  }));

  const rootActions: CommandAction[] = snippets.length > 0
    ? [
        {
          id: "snippets.open",
          title: "Insert Snippet...",
          subtitle: `${snippets.length} saved`,
          section: "Tools",
          contexts: ["terminal"],
          icon: createElement(HugeiconsIcon, {
            icon: CheckListIcon,
            strokeWidth: 2,
            className: "size-4",
          }),
          subPageId: "snippets",
        },
      ]
    : [];

  return {
    rootActions,
    snippetsPage: {
      id: "snippets",
      searchPlaceholder: "Search snippets...",
      actions: snippetActions,
    },
  };
}
