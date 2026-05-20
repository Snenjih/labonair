import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowRight01Icon,
  ArrowDown01Icon,
  Cancel01Icon,
  File02Icon,
  TerminalIcon,
} from "@hugeicons/core-free-icons";
import { createElement } from "react";
import type { CommandAction, CommandPage } from "../types";
import type { RegistryCallbacks } from "../types";

export function useLayoutCommands(
  cb: RegistryCallbacks,
  activeTabKind: string | undefined,
): CommandPage {
  const isWorkspace = activeTabKind === "workspace";

  const actions: CommandAction[] = [
    {
      id: "layout.new-tab",
      title: "New Terminal Tab",
      section: "Layout",
      shortcut: ["⌘", "T"],
      icon: createElement(HugeiconsIcon, {
        icon: TerminalIcon,
        strokeWidth: 2,
        className: "size-4",
      }),
      perform: () => cb.newTab(),
    },
    {
      id: "layout.new-editor",
      title: "New Editor Tab",
      section: "Layout",
      shortcut: ["⌘", "E"],
      icon: createElement(HugeiconsIcon, {
        icon: File02Icon,
        strokeWidth: 2,
        className: "size-4",
      }),
      perform: () => cb.openUntitledTab(),
    },
    {
      id: "layout.open-host-manager",
      title: "Open Host Manager",
      section: "Layout",
      icon: createElement(HugeiconsIcon, {
        icon: TerminalIcon,
        strokeWidth: 2,
        className: "size-4",
      }),
      perform: () => cb.openHomeTab(),
    },
  ];

  if (isWorkspace) {
    actions.push(
      {
        id: "layout.split-right",
        title: "Split Pane Right",
        section: "Layout",
        shortcut: ["⌘", "D"],
        icon: createElement(HugeiconsIcon, {
          icon: ArrowRight01Icon,
          strokeWidth: 2,
          className: "size-4",
        }),
        perform: () => cb.splitRight(),
      },
      {
        id: "layout.split-down",
        title: "Split Pane Down",
        section: "Layout",
        shortcut: ["⌘", "⇧", "D"],
        icon: createElement(HugeiconsIcon, {
          icon: ArrowDown01Icon,
          strokeWidth: 2,
          className: "size-4",
        }),
        perform: () => cb.splitDown(),
      },
      {
        id: "layout.close-pane",
        title: "Close Active Pane",
        section: "Layout",
        shortcut: ["⌘", "⇧", "W"],
        icon: createElement(HugeiconsIcon, {
          icon: Cancel01Icon,
          strokeWidth: 2,
          className: "size-4",
        }),
        perform: () => cb.closePane(),
      },
    );
  }

  return {
    id: "layout",
    searchPlaceholder: "Search layout commands...",
    actions,
  };
}
