import { HugeiconsIcon } from "@hugeicons/react";
import {
  Settings01Icon,
  EyeIcon,
  ArrowUpDownIcon,
  Refresh01Icon,
  CheckListIcon,
} from "@hugeicons/core-free-icons";
import { createElement, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { usePreferencesStore } from "@/modules/settings/preferences";
import {
  setTheme as persistTheme,
  setAppTheme,
  setEditorWordWrap,
  setTerminalCursorBlink,
  setTerminalUseWebGL,
  setTerminalShowPaneHeader,
  setTerminalShowPaneFooter,
  setVimMode,
  setEditorAutoSave,
  setAutocompleteEnabled,
  setAutostart,
  setEditorTheme,
  EDITOR_THEMES,
  EDITOR_THEME_LABELS,
  type ThemePref,
} from "@/modules/settings/store";
import type { CommandAction, CommandPage } from "../types";
import { applyThemeColors, revertThemeColors } from "@/lib/useThemeEngine";
import type { ThemeMeta } from "@/lib/useThemeEngine";

function toggle(label: boolean | undefined): string {
  return label ? "ON" : "OFF";
}

export function useSettingsCommands(): {
  rootActions: CommandAction[];
  themesPage: CommandPage;
  appModePage: CommandPage;
  editorThemePage: CommandPage;
} {
  const appTheme = usePreferencesStore((s) => s.appTheme);
  const theme = usePreferencesStore((s) => s.theme);
  const editorTheme = usePreferencesStore((s) => s.editorTheme);

  // Toggles — all reactive via store subscription
  const editorWordWrap = usePreferencesStore((s) => s.editorWordWrap);
  const terminalCursorBlink = usePreferencesStore((s) => s.terminalCursorBlink);
  const terminalUseWebGL = usePreferencesStore((s) => s.terminalUseWebGL);
  const terminalShowPaneHeader = usePreferencesStore((s) => s.terminalShowPaneHeader);
  const terminalShowPaneFooter = usePreferencesStore((s) => s.terminalShowPaneFooter);
  const vimMode = usePreferencesStore((s) => s.vimMode);
  const editorAutoSave = usePreferencesStore((s) => s.editorAutoSave);
  const autocompleteEnabled = usePreferencesStore((s) => s.autocompleteEnabled);
  const autostart = usePreferencesStore((s) => s.autostart);

  const [themes, setThemes] = useState<ThemeMeta[]>([]);
  useEffect(() => {
    invoke<ThemeMeta[]>("themes_get_all")
      .then(setThemes)
      .catch(() => setThemes([]));
  }, []);

  // ─── Theme pages ──────────────────────────────────────────────────────────

  function revertToSavedTheme() {
    if (appTheme === "default") {
      revertThemeColors();
    } else {
      const saved = themes.find((t) => t.id === appTheme);
      if (saved) applyThemeColors(saved);
    }
  }

  const themeActions: CommandAction[] = [
    {
      id: "theme.default",
      title: "Default (CSS Variables)",
      section: "App Themes",
      rightLabel: appTheme === "default" ? "active" : undefined,
      icon: createElement(HugeiconsIcon, { icon: Settings01Icon, strokeWidth: 2, className: "size-4" }),
      onPreview: () => revertThemeColors(),
      perform: () => void setAppTheme("default"),
    },
    ...themes.map((t) => ({
      id: `theme.${t.id}`,
      title: t.name,
      subtitle: t.author,
      section: t.type === "dark" ? "Dark Themes" : "Light Themes",
      rightLabel: appTheme === t.id ? "active" : undefined,
      icon: createElement(HugeiconsIcon, { icon: Settings01Icon, strokeWidth: 2, className: "size-4" }),
      onPreview: () => applyThemeColors(t),
      perform: () => void setAppTheme(t.id),
    })),
  ];

  const appModeActions: CommandAction[] = (
    [
      { id: "mode.dark",   title: "Dark Mode",       value: "dark"   as ThemePref },
      { id: "mode.light",  title: "Light Mode",      value: "light"  as ThemePref },
      { id: "mode.system", title: "System (Auto)",   value: "system" as ThemePref },
    ] as const
  ).map((m) => ({
    id: m.id,
    title: m.title,
    section: "Color Mode",
    rightLabel: theme === m.value ? "active" : undefined,
    icon: createElement(HugeiconsIcon, { icon: Refresh01Icon, strokeWidth: 2, className: "size-4" }),
    perform: () => void persistTheme(m.value),
  }));

  // ─── Root actions ─────────────────────────────────────────────────────────

  const rootActions: CommandAction[] = [
    // Sub-menu navigators
    {
      id: "settings.editor-theme",
      title: "Change Editor Theme...",
      section: "Settings",
      contexts: ["editor"],
      icon: createElement(HugeiconsIcon, { icon: Settings01Icon, strokeWidth: 2, className: "size-4" }),
      subPageId: "editor-theme",
    },
    {
      id: "settings.theme",
      title: "Change App Theme...",
      section: "Settings",
      icon: createElement(HugeiconsIcon, { icon: Settings01Icon, strokeWidth: 2, className: "size-4" }),
      subPageId: "themes",
    },
    {
      id: "settings.mode",
      title: "Change Color Mode...",
      section: "Settings",
      icon: createElement(HugeiconsIcon, { icon: ArrowUpDownIcon, strokeWidth: 2, className: "size-4" }),
      subPageId: "mode",
    },

    // Editor toggles
    {
      id: "settings.word-wrap",
      title: "Toggle: Editor Word Wrap",
      section: "Settings",
      contexts: ["editor"],
      rightLabel: toggle(editorWordWrap),
      icon: createElement(HugeiconsIcon, { icon: ArrowUpDownIcon, strokeWidth: 2, className: "size-4" }),
      perform: () => void setEditorWordWrap(!editorWordWrap),
    },
    {
      id: "settings.autosave",
      title: "Toggle: Editor Auto-Save",
      section: "Settings",
      contexts: ["editor"],
      rightLabel: editorAutoSave !== "off" ? "ON" : "OFF",
      icon: createElement(HugeiconsIcon, { icon: CheckListIcon, strokeWidth: 2, className: "size-4" }),
      perform: () =>
        void setEditorAutoSave(editorAutoSave === "off" ? "afterDelay" : "off"),
    },

    // Terminal toggles
    {
      id: "settings.cursor-blink",
      title: "Toggle: Terminal Cursor Blink",
      section: "Settings",
      contexts: ["terminal"],
      rightLabel: toggle(terminalCursorBlink),
      icon: createElement(HugeiconsIcon, { icon: EyeIcon, strokeWidth: 2, className: "size-4" }),
      perform: () => void setTerminalCursorBlink(!terminalCursorBlink),
    },
    {
      id: "settings.webgl",
      title: "Toggle: Terminal WebGL Renderer",
      section: "Settings",
      contexts: ["terminal"],
      rightLabel: toggle(terminalUseWebGL),
      icon: createElement(HugeiconsIcon, { icon: EyeIcon, strokeWidth: 2, className: "size-4" }),
      perform: () => void setTerminalUseWebGL(!terminalUseWebGL),
    },
    {
      id: "settings.pane-header",
      title: "Toggle: Terminal Pane Header",
      section: "Settings",
      contexts: ["terminal"],
      rightLabel: toggle(terminalShowPaneHeader),
      icon: createElement(HugeiconsIcon, { icon: EyeIcon, strokeWidth: 2, className: "size-4" }),
      perform: () => void setTerminalShowPaneHeader(!terminalShowPaneHeader),
    },
    {
      id: "settings.pane-footer",
      title: "Toggle: Terminal Pane Footer",
      section: "Settings",
      contexts: ["terminal"],
      rightLabel: toggle(terminalShowPaneFooter),
      icon: createElement(HugeiconsIcon, { icon: EyeIcon, strokeWidth: 2, className: "size-4" }),
      perform: () => void setTerminalShowPaneFooter(!terminalShowPaneFooter),
    },
    {
      id: "settings.vim",
      title: "Toggle: Vim Mode",
      section: "Settings",
      contexts: ["terminal"],
      rightLabel: toggle(vimMode),
      icon: createElement(HugeiconsIcon, { icon: CheckListIcon, strokeWidth: 2, className: "size-4" }),
      perform: () => void setVimMode(!vimMode),
    },

    // Global toggles
    {
      id: "settings.hidden-files",
      title: "Toggle: Show Hidden Files",
      section: "Settings",
      contexts: ["sftp"],
      icon: createElement(HugeiconsIcon, { icon: EyeIcon, strokeWidth: 2, className: "size-4" }),
      perform: () => {
        window.dispatchEvent(new CustomEvent("nexum:sftp-toggle-hidden"));
      },
    },
    {
      id: "settings.autocomplete",
      title: "Toggle: AI Autocomplete",
      section: "Settings",
      rightLabel: toggle(autocompleteEnabled),
      icon: createElement(HugeiconsIcon, { icon: CheckListIcon, strokeWidth: 2, className: "size-4" }),
      perform: () => void setAutocompleteEnabled(!autocompleteEnabled),
    },
    {
      id: "settings.autostart",
      title: "Toggle: Launch at Login",
      section: "Settings",
      rightLabel: toggle(autostart),
      icon: createElement(HugeiconsIcon, { icon: CheckListIcon, strokeWidth: 2, className: "size-4" }),
      perform: () => void setAutostart(!autostart),
    },
  ];

  const editorThemePage: CommandPage = {
    id: "editor-theme",
    searchPlaceholder: "Search editor themes...",
    actions: EDITOR_THEMES.map((id) => ({
      id: `editor-theme.${id}`,
      title: EDITOR_THEME_LABELS[id],
      section: "Editor Themes",
      rightLabel: editorTheme === id ? "active" : undefined,
      icon: createElement(HugeiconsIcon, { icon: Settings01Icon, strokeWidth: 2, className: "size-4" }),
      perform: () => void setEditorTheme(id),
    })),
  };

  return {
    rootActions,
    themesPage: { id: "themes", searchPlaceholder: "Search themes...", actions: themeActions, onLeave: revertToSavedTheme },
    appModePage: { id: "mode", searchPlaceholder: "Search color modes...", actions: appModeActions },
    editorThemePage,
  };
}
