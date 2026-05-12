import { invoke } from "@tauri-apps/api/core";
import { useEffect } from "react";
import { usePreferencesStore } from "@/modules/settings/preferences";

export type ThemeColors = Record<string, string>;

export type ThemeMeta = {
  id: string;
  name: string;
  author: string;
  type: string;
  colors: ThemeColors;
  builtin: boolean;
};

/**
 * Convert a HEX color string to the raw "H S% L%" format Tailwind v4 / shadcn
 * CSS variables expect (no `hsl()` wrapper, just the three numbers).
 */
export function hexToHslRaw(hex: string): string {
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

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }

  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

const COLOR_VAR_MAP: Record<string, string> = {
  background: "--background",
  foreground: "--foreground",
  card: "--card",
  card_foreground: "--card-foreground",
  popover: "--popover",
  popover_foreground: "--popover-foreground",
  primary: "--primary",
  primary_foreground: "--primary-foreground",
  secondary: "--secondary",
  secondary_foreground: "--secondary-foreground",
  muted: "--muted",
  muted_foreground: "--muted-foreground",
  accent: "--accent",
  accent_foreground: "--accent-foreground",
  destructive: "--destructive",
  destructive_foreground: "--destructive-foreground",
  border: "--border",
  input: "--input",
  ring: "--ring",
};

export function applyThemeColors(
  colors: ThemeColors,
  target: HTMLElement = document.documentElement,
): void {
  for (const [key, cssVar] of Object.entries(COLOR_VAR_MAP)) {
    const hex = colors[key];
    if (hex) {
      target.style.setProperty(cssVar, hexToHslRaw(hex));
    }
  }
}

export function revertThemeColors(
  target: HTMLElement = document.documentElement,
): void {
  for (const cssVar of Object.values(COLOR_VAR_MAP)) {
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

/** Boot-time hook: applies the active theme from preferences to the DOM. */
export function useThemeEngine(): void {
  const appTheme = usePreferencesStore((s) => s.appTheme);

  useEffect(() => {
    void loadThemeMeta(appTheme).then((meta) => {
      if (meta) applyThemeColors(meta.colors);
    });
  }, [appTheme]);
}
