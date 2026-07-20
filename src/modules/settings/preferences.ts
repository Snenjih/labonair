import { create } from "zustand";
import {
  DEFAULT_PREFERENCES,
  loadPreferences,
  onPreferencesChange,
  type Preferences,
  setSftpShowHiddenFiles,
  type ThemePref,
} from "./store";

type State = Preferences & {
  hydrated: boolean;
  /** Derived from `theme` + the OS `prefers-color-scheme` media query — the
   *  single source of truth both ThemeProvider and the JSON theme engine
   *  read from, so a color-scheme change always propagates to whichever
   *  variant of the active JSON theme should be shown. */
  resolvedMode: "dark" | "light";
  /** Subscribe & hydrate. Idempotent — safe to call from multiple windows. */
  init: () => Promise<void>;
};

// Start loading immediately at module import time — before React renders.
// Falls back to null on error so init() can apply DEFAULT_PREFERENCES instead.
const _earlyPrefsP: Promise<Preferences | null> = loadPreferences().catch(() => null);

let initialized = false;
let systemDark =
  typeof window === "undefined" ? true : window.matchMedia("(prefers-color-scheme: dark)").matches;

function resolveMode(theme: ThemePref): "dark" | "light" {
  return theme === "system" ? (systemDark ? "dark" : "light") : theme;
}

export const usePreferencesStore = create<State>((set, get) => ({
  ...DEFAULT_PREFERENCES,
  hydrated: false,
  resolvedMode: resolveMode(DEFAULT_PREFERENCES.theme),
  init: async () => {
    if (initialized) return;
    initialized = true;
    const prefs = await _earlyPrefsP;
    const applied = prefs ?? DEFAULT_PREFERENCES;
    set({ ...applied, hydrated: true, resolvedMode: resolveMode(applied.theme) });

    void onPreferencesChange((key, value) => {
      set({ [key]: value } as Partial<State>);
      if (key === "theme") {
        set({ resolvedMode: resolveMode(value as ThemePref) });
      }
    });

    if (typeof window !== "undefined") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      mq.addEventListener("change", (e) => {
        systemDark = e.matches;
        set({ resolvedMode: resolveMode(get().theme) });
      });
    }
  },
}));

/** Shared by SftpPane's own hidden-files toggle button and the command
 *  palette's "Toggle: Show Hidden Files" command — previously each had its
 *  own copy (the palette's via a dead `CustomEvent` nobody listened for). */
export function toggleSftpHiddenFiles(): void {
  const next = !usePreferencesStore.getState().sftpShowHiddenFiles;
  usePreferencesStore.setState({ sftpShowHiddenFiles: next });
  void setSftpShowHiddenFiles(next);
}
