import { invoke } from "@tauri-apps/api/core";
import { useEffect } from "react";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { setAppTheme } from "@/modules/settings/store";

export type ThemeColors = Record<string, string>;

export type ThemeMeta = {
  id: string;
  name: string;
  author: string;
  type: "dark" | "light" | string;
  colors: ThemeColors;
  builtin: boolean;
};

/** Maps JSON theme color keys to their CSS custom property names. */
const COLOR_VAR_MAP: Record<string, string> = {
  // Core shadcn/ui
  background: "--background",
  foreground: "--foreground",
  card: "--card",
  card_foreground: "--card-foreground",
  "card-foreground": "--card-foreground",
  popover: "--popover",
  popover_foreground: "--popover-foreground",
  "popover-foreground": "--popover-foreground",
  primary: "--primary",
  primary_foreground: "--primary-foreground",
  "primary-foreground": "--primary-foreground",
  secondary: "--secondary",
  secondary_foreground: "--secondary-foreground",
  "secondary-foreground": "--secondary-foreground",
  muted: "--muted",
  muted_foreground: "--muted-foreground",
  "muted-foreground": "--muted-foreground",
  accent: "--accent",
  accent_foreground: "--accent-foreground",
  "accent-foreground": "--accent-foreground",
  destructive: "--destructive",
  destructive_foreground: "--destructive-foreground",
  border: "--border",
  input: "--input",
  ring: "--ring",
  // Semantic status colors (new)
  modified: "--modified",
  error: "--error",
  warning: "--warning",
  info: "--info",
  hint: "--hint",
  success: "--success",
  // UI interaction (new)
  cursor: "--cursor",
  selection: "--selection",
  // Surface colors (new)
  "toolbar.background": "--toolbar-background",
  "title_bar.background": "--title-bar-background",
  "status_bar.background": "--status-bar-background",
  // Border variants (new)
  "border.variant": "--border-variant",
  "border.focused": "--border-focused",
  "border.selected": "--border-selected",
  "border.transparent": "--border-transparent",
  "border.disabled": "--border-disabled",
  // Sidebar — old key kept for backward compat
  sidebar: "--sidebar",
  "sidebar.background": "--sidebar",
  "sidebar-foreground": "--sidebar-foreground",
  "sidebar-primary": "--sidebar-primary",
  "sidebar-primary-foreground": "--sidebar-primary-foreground",
  "sidebar-accent": "--sidebar-accent",
  "sidebar-accent-foreground": "--sidebar-accent-foreground",
  "sidebar-border": "--sidebar-border",
  "sidebar-ring": "--sidebar-ring",
  // Terminal ANSI 16 — legacy underscore keys (backward compat)
  terminal_background: "--terminal-background",
  terminal_foreground: "--terminal-foreground",
  terminal_black: "--terminal-black",
  terminal_red: "--terminal-red",
  terminal_green: "--terminal-green",
  terminal_yellow: "--terminal-yellow",
  terminal_blue: "--terminal-blue",
  terminal_magenta: "--terminal-magenta",
  terminal_cyan: "--terminal-cyan",
  terminal_white: "--terminal-white",
  terminal_bright_black: "--terminal-bright-black",
  terminal_bright_red: "--terminal-bright-red",
  terminal_bright_green: "--terminal-bright-green",
  terminal_bright_yellow: "--terminal-bright-yellow",
  terminal_bright_blue: "--terminal-bright-blue",
  terminal_bright_magenta: "--terminal-bright-magenta",
  terminal_bright_cyan: "--terminal-bright-cyan",
  terminal_bright_white: "--terminal-bright-white",
  // Terminal — new dot-notation keys (schema.json canonical)
  "terminal.background": "--terminal-background",
  "terminal.foreground": "--terminal-foreground",
  "terminal.bright_foreground": "--terminal-bright-foreground",
  "terminal.dim_foreground": "--terminal-dim-foreground",
  "terminal.ansi.background": "--terminal-background",
  "terminal.ansi.black": "--terminal-black",
  "terminal.ansi.red": "--terminal-red",
  "terminal.ansi.green": "--terminal-green",
  "terminal.ansi.yellow": "--terminal-yellow",
  "terminal.ansi.blue": "--terminal-blue",
  "terminal.ansi.magenta": "--terminal-magenta",
  "terminal.ansi.cyan": "--terminal-cyan",
  "terminal.ansi.white": "--terminal-white",
  "terminal.ansi.bright_black": "--terminal-bright-black",
  "terminal.ansi.bright_red": "--terminal-bright-red",
  "terminal.ansi.bright_green": "--terminal-bright-green",
  "terminal.ansi.bright_yellow": "--terminal-bright-yellow",
  "terminal.ansi.bright_blue": "--terminal-bright-blue",
  "terminal.ansi.bright_magenta": "--terminal-bright-magenta",
  "terminal.ansi.bright_cyan": "--terminal-bright-cyan",
  "terminal.ansi.bright_white": "--terminal-bright-white",
  "terminal.ansi.dim_black": "--terminal-dim-black",
  "terminal.ansi.dim_red": "--terminal-dim-red",
  "terminal.ansi.dim_green": "--terminal-dim-green",
  "terminal.ansi.dim_yellow": "--terminal-dim-yellow",
  "terminal.ansi.dim_blue": "--terminal-dim-blue",
  "terminal.ansi.dim_magenta": "--terminal-dim-magenta",
  "terminal.ansi.dim_cyan": "--terminal-dim-cyan",
  "terminal.ansi.dim_white": "--terminal-dim-white",
};

/** All CSS vars we inject — deduplicated so cleanup doesn't double-remove. */
const ALL_VARS = [...new Set(Object.values(COLOR_VAR_MAP))];

/**
 * Convert a HEX color to a full `hsl(H S% L%)` CSS value.
 * Using the full hsl() wrapper ensures the value is a valid CSS <color>.
 */
export function hexToHslCss(hex: string): string {
  if (!/^#([A-Fa-f0-9]{3,8})$/.test(hex.trim())) return hex;
  const clean = hex.replace(/^#/, "");
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean;

  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  const a = full.length === 8 ? parseInt(full.slice(6, 8), 16) / 255 : 1;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }

  const hDeg = Math.round(h * 360);
  const sPct = Math.round(s * 100);
  const lPct = Math.round(l * 100);
  if (a < 1) {
    const aPct = Math.round(a * 100);
    return `hsl(${hDeg}deg ${sPct}% ${lPct}% / ${aPct}%)`;
  }
  return `hsl(${hDeg}deg ${sPct}% ${lPct}%)`;
}

/**
 * Apply a loaded theme's colors to a DOM element (default: :root).
 * Also sets the `.dark` / `.light` root class based on the theme's type.
 */
export function applyThemeColors(
  meta: ThemeMeta,
  target: HTMLElement = document.documentElement,
): void {
  // Clear all previously injected vars first so no leftover values from a
  // prior theme bleed through when the new theme omits certain color keys.
  for (const cssVar of ALL_VARS) {
    target.style.removeProperty(cssVar);
  }
  for (const [key, cssVar] of Object.entries(COLOR_VAR_MAP)) {
    const hex = meta.colors[key];
    if (hex) {
      target.style.setProperty(cssVar, hexToHslCss(hex));
    }
  }
  // Override dark/light class to match the JSON theme's declared type.
  target.classList.remove("dark", "light");
  if (meta.type === "dark" || meta.type === "light") {
    target.classList.add(meta.type);
  }
}

/**
 * Remove all inline CSS vars set by a JSON theme, reverting to globals.css.
 * The dark/light class management is left entirely to ThemeProvider.
 */
export function revertThemeColors(
  target: HTMLElement = document.documentElement,
): void {
  for (const cssVar of ALL_VARS) {
    target.style.removeProperty(cssVar);
  }
}

export async function loadThemeMeta(id: string): Promise<ThemeMeta | null> {
  try {
    const themes = await invoke<ThemeMeta[]>("themes_get_all");
    return themes.find((t) => t.id === id) ?? null;
  } catch {
    return null;
  }
}

/**
 * Boot-time hook.
 * - "default" → clears all injected vars, ThemeProvider's dark/light class takes over.
 * - Any other id → loads the JSON theme and injects its colors + sets the class.
 * Falls back to "default" if the theme cannot be loaded.
 */
export function useThemeEngine(): void {
  const appTheme = usePreferencesStore((s) => s.appTheme);

  useEffect(() => {
    if (appTheme === "default") {
      revertThemeColors();
      return;
    }

    void loadThemeMeta(appTheme).then((meta) => {
      if (meta) {
        applyThemeColors(meta);
      } else {
        // Theme was deleted or cannot be found — fall back gracefully.
        revertThemeColors();
        void setAppTheme("default");
      }
    });
  }, [appTheme]);
}
