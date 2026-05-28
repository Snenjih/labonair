import { HugeiconsIcon } from "@hugeicons/react";
import {
  TerminalIcon,
  File02Icon,
  Folder01Icon,
  Globe02Icon,
  SparklesIcon,
  Cancel01Icon,
} from "@hugeicons/core-free-icons";
import { createElement } from "react";
import { useTabsStore } from "@/modules/tabs/store/tabsStore";
import { useShallow } from "zustand/react/shallow";
import type { CommandAction, CommandPage } from "../types";
import type { RegistryCallbacks } from "../types";

export function useTabCommands(cb: RegistryCallbacks): {
  rootAction: CommandAction;
  tabsPage: CommandPage;
} {
  const tabs = useTabsStore(useShallow((s) => s.tabs));
  const activeTabId = useTabsStore((s) => s.activeId);
  const { switchTab } = cb;

  function iconForKind(kind: string) {
    switch (kind) {
      case "workspace": return TerminalIcon;
      case "editor": return File02Icon;
      case "sftp": return Folder01Icon;
      case "preview": return Globe02Icon;
      case "ai-diff": return SparklesIcon;
      default: return TerminalIcon;
    }
  }

  const switchActions: CommandAction[] = tabs.map((t) => ({
    id: `tab.switch.${t.id}`,
    title: t.title || "Untitled",
    subtitle: t.kind,
    section: "Open Tabs",
    rightLabel: t.id === activeTabId ? "active" : undefined,
    icon: createElement(HugeiconsIcon, {
      icon: iconForKind(t.kind),
      strokeWidth: 2,
      className: "size-4",
    }),
    perform: () => switchTab(t.id),
  }));

  const closeAction: CommandAction = {
    id: "tab.close-current",
    title: "Close Current Tab",
    section: "Tab Actions",
    shortcut: ["⌘", "W"],
    icon: createElement(HugeiconsIcon, { icon: Cancel01Icon, strokeWidth: 2, className: "size-4" }),
    perform: () => cb.closeCurrentTab(),
  };

  const rootAction: CommandAction = {
    id: "tabs.switch",
    title: "Switch Tab...",
    subtitle: `${tabs.length} open`,
    section: "Layout",
    icon: createElement(HugeiconsIcon, { icon: TerminalIcon, strokeWidth: 2, className: "size-4" }),
    subPageId: "tabs",
  };

  return {
    rootAction,
    tabsPage: {
      id: "tabs",
      searchPlaceholder: "Search open tabs...",
      actions: [...switchActions, closeAction],
    },
  };
}
