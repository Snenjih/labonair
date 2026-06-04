import { create } from "zustand";
import {
  DEFAULT_PREFERENCES,
  loadPreferences,
  onPreferencesChange,
  type Preferences,
} from "./store";

type State = Preferences & {
  hydrated: boolean;
  /** Subscribe & hydrate. Idempotent — safe to call from multiple windows. */
  init: () => Promise<void>;
};

// Start loading immediately at module import time — before React renders.
// Falls back to null on error so init() can apply DEFAULT_PREFERENCES instead.
const _earlyPrefsP: Promise<Preferences | null> = loadPreferences().catch(() => null);

let initialized = false;

export const usePreferencesStore = create<State>((set) => ({
  ...DEFAULT_PREFERENCES,
  hydrated: false,
  init: async () => {
    if (initialized) return;
    initialized = true;
    const prefs = await _earlyPrefsP;
    set({ ...(prefs ?? DEFAULT_PREFERENCES), hydrated: true });
    void onPreferencesChange((key, value) => {
      set({ [key]: value } as Partial<State>);
    });
  },
}));
