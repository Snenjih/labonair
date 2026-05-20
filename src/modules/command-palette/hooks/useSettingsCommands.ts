import { HugeiconsIcon } from "@hugeicons/react";
import {
  Settings01Icon,
  EyeIcon,
  ArrowUpDownIcon,
  Refresh01Icon,
} from "@hugeicons/core-free-icons";
import { createElement, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { usePreferencesStore } from "@/modules/settings/preferences";
import {
  setTheme as persistTheme,
  setAppTheme,
  type ThemePref,
} from "@/modules/settings/store";
import type { CommandAction, CommandPage } from "../types";
import type { ThemeMeta } from "@/lib/useThemeEngine";

export function useSettingsCommands(): {
  rootActions: CommandAction[];
  themesPage: CommandPage;
  appModePage: CommandPage;
} {
  const appTheme = usePreferencesStore((s) => s.appTheme);
  const editorWordWrap = usePreferencesStore((s) => s.editorWordWrap);
  const terminalCursorBlink = usePreferencesStore((s) => s.terminalCursorBlink);
  const theme = usePreferencesStore((s) => s.theme);

  const [themes, setThemes] = useState<ThemeMeta[]>([]);

  useEffect(() => {
    invoke<ThemeMeta[]>("themes_get_all")
      .then(setThemes)
      .catch(() => setThemes([]));
  }, []);

  const themeActions: CommandAction[] = [
    {
      id: "theme.default",
      title: "Default (CSS Variables)",
      section: "App Themes",
      rightLabel: appTheme === "default" ? "active" : undefined,
      icon: createElement(HugeiconsIcon, {
        icon: Settings01Icon,
        strokeWidth: 2,
        className: "size-4",
      }),
      perform: () => void setAppTheme("default"),
    },
    ...themes.map((t) => ({
      id: `theme.${t.id}`,
      title: t.name,
      subtitle: t.author,
      section: t.type === "dark" ? "Dark Themes" : "Light Themes",
      rightLabel: appTheme === t.id ? "active" : undefined,
      icon: createElement(HugeiconsIcon, {
        icon: Settings01Icon,
        strokeWidth: 2,
        className: "size-4",
      }),
      perform: () => void setAppTheme(t.id),
    })),
  ];

  const appModeActions: CommandAction[] = (
    [
      { id: "mode.dark", title: "Dark Mode", value: "dark" as ThemePref },
      { id: "mode.light", title: "Light Mode", value: "light" as ThemePref },
      { id: "mode.system", title: "System (Auto)", value: "system" as ThemePref },
    ] as const
  ).map((m) => ({
    id: m.id,
    title: m.title,
    section: "Color Mode",
    rightLabel: theme === m.value ? "active" : undefined,
    icon: createElement(HugeiconsIcon, {
      icon: Refresh01Icon,
      strokeWidth: 2,
      className: "size-4",
    }),
    perform: () => void persistTheme(m.value),
  }));

  const rootActions: CommandAction[] = [
    {
      id: "settings.theme",
      title: "Change App Theme...",
      section: "Settings",
      icon: createElement(HugeiconsIcon, {
        icon: Settings01Icon,
        strokeWidth: 2,
        className: "size-4",
      }),
      subPageId: "themes",
    },
    {
      id: "settings.mode",
      title: "Change Color Mode...",
      section: "Settings",
      icon: createElement(HugeiconsIcon, {
        icon: ArrowUpDownIcon,
        strokeWidth: 2,
        className: "size-4",
      }),
      subPageId: "mode",
    },
    {
      id: "settings.word-wrap",
      title: "Toggle: Editor Word Wrap",
      section: "Settings",
      contexts: ["editor"] as const,
      rightLabel: editorWordWrap ? "ON" : "OFF",
      icon: createElement(HugeiconsIcon, {
        icon: ArrowUpDownIcon,
        strokeWidth: 2,
        className: "size-4",
      }),
      perform: () => {
        const store = usePreferencesStore.getState();
        void import("@/modules/settings/store").then(({ setEditorWordWrap }) =>
          setEditorWordWrap(!store.editorWordWrap),
        );
      },
    },
    {
      id: "settings.hidden-files",
      title: "Toggle: Show Hidden Files",
      section: "Settings",
      contexts: ["sftp"] as const,
      rightLabel: undefined,
      icon: createElement(HugeiconsIcon, {
        icon: EyeIcon,
        strokeWidth: 2,
        className: "size-4",
      }),
      perform: () => {
        window.dispatchEvent(new CustomEvent("nexum:sftp-toggle-hidden"));
      },
    },
    {
      id: "settings.cursor-blink",
      title: "Toggle: Terminal Cursor Blink",
      section: "Settings",
      rightLabel: terminalCursorBlink ? "ON" : "OFF",
      icon: createElement(HugeiconsIcon, {
        icon: EyeIcon,
        strokeWidth: 2,
        className: "size-4",
      }),
      perform: () => {
        void import("@/modules/settings/store").then(
          ({ setTerminalCursorBlink }) =>
            setTerminalCursorBlink(!terminalCursorBlink),
        );
      },
    },
  ];

  return {
    rootActions,
    themesPage: {
      id: "themes",
      searchPlaceholder: "Search themes...",
      actions: themeActions,
    },
    appModePage: {
      id: "mode",
      searchPlaceholder: "Search color modes...",
      actions: appModeActions,
    },
  };
}
