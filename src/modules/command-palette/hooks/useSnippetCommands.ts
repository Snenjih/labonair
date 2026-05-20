import { HugeiconsIcon } from "@hugeicons/react";
import { CommandIcon, Settings01Icon } from "@hugeicons/core-free-icons";
import { createElement } from "react";
import { useCommandSnippetsStore } from "@/modules/snippets/store/commandSnippetsStore";
import type { SnippetExecMode } from "@/modules/snippets/types";
import type { CommandAction, CommandPage, RegistryCallbacks } from "../types";

function execModeLabel(mode: SnippetExecMode): string {
  if (mode === "terminal") return "Terminal";
  if (mode === "silent") return "Silent";
  return "Inject";
}

export function useSnippetCommands(cb: RegistryCallbacks): {
  rootActions: CommandAction[];
  snippetsPage: CommandPage;
} {
  const snippets = useCommandSnippetsStore((s) => s.snippets);
  const groups = useCommandSnippetsStore((s) => s.groups);

  const groupNameMap = new Map(groups.map((g) => [g.id, g.name]));

  const snippetActions: CommandAction[] = snippets.map((s) => ({
    id: `snippet.${s.id}`,
    title: s.name,
    subtitle: s.description ?? s.command,
    section: (s.groupId ? groupNameMap.get(s.groupId) : undefined) ?? "General",
    icon: createElement(HugeiconsIcon, {
      icon: CommandIcon,
      strokeWidth: 2,
      className: "size-4",
    }),
    rightLabel: execModeLabel(s.defaultExecMode),
    perform: () => cb.runSnippet(s),
  }));

  const rootActions: CommandAction[] = [
    {
      id: "snippets.open",
      title: "Snippets...",
      subtitle: snippets.length > 0 ? `${snippets.length} saved` : undefined,
      section: "Tools",
      icon: createElement(HugeiconsIcon, {
        icon: CommandIcon,
        strokeWidth: 2,
        className: "size-4",
      }),
      subPageId: "snippets",
    },
    {
      id: "snippets.manage",
      title: "Manage Snippets",
      section: "Tools",
      icon: createElement(HugeiconsIcon, {
        icon: Settings01Icon,
        strokeWidth: 2,
        className: "size-4",
      }),
      perform: () => cb.openSnippetsPanel(),
    },
  ];

  return {
    rootActions,
    snippetsPage: {
      id: "snippets",
      searchPlaceholder: "Search snippets...",
      actions: snippetActions,
    },
  };
}
