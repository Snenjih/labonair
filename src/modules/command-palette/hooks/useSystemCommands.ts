import { HugeiconsIcon } from "@hugeicons/react";
import {
  Settings01Icon,
  CheckListIcon,
  SparklesIcon,
  Refresh01Icon,
} from "@hugeicons/core-free-icons";
import { createElement } from "react";
import type { CommandPage } from "../types";
import type { RegistryCallbacks } from "../types";

export function useSystemCommands(cb: RegistryCallbacks): CommandPage {
  return {
    id: "system",
    searchPlaceholder: "Search commands...",
    actions: [
      {
        id: "system.settings",
        title: "Open Settings",
        section: "Application",
        icon: createElement(HugeiconsIcon, {
          icon: Settings01Icon,
          strokeWidth: 2,
          className: "size-4",
        }),
        perform: () => cb.openSettings(),
      },
      {
        id: "system.shortcuts",
        title: "Keyboard Shortcuts",
        section: "Application",
        icon: createElement(HugeiconsIcon, {
          icon: CheckListIcon,
          strokeWidth: 2,
          className: "size-4",
        }),
        perform: () => cb.openShortcuts(),
      },
      {
        id: "system.ai-toggle",
        title: "Toggle AI Panel",
        section: "Application",
        shortcut: ["⌘", "I"],
        icon: createElement(HugeiconsIcon, {
          icon: SparklesIcon,
          strokeWidth: 2,
          className: "size-4",
        }),
        perform: () => cb.toggleAi(),
      },
      {
        id: "system.ai-ask",
        title: "Ask AI About Selection",
        section: "Application",
        shortcut: ["⌘", "L"],
        icon: createElement(HugeiconsIcon, {
          icon: SparklesIcon,
          strokeWidth: 2,
          className: "size-4",
        }),
        perform: () => cb.askSelection(),
      },
      {
        id: "system.settings-models",
        title: "Manage AI Keys & Models",
        section: "Application",
        icon: createElement(HugeiconsIcon, {
          icon: Refresh01Icon,
          strokeWidth: 2,
          className: "size-4",
        }),
        perform: () => cb.openSettings("models"),
      },
    ],
  };
}
