import { create } from "zustand";
import {
  loadKeybinds,
  onKeybindsChanged,
  resetAllKeybinds,
  resetKeybind,
  saveKeybind,
} from "../keybinds-store";
import type { KeyBinding, KeyBindingMap, KeyBindingOrDisabled } from "../types";
import { bindingMatchesEvent } from "./captureKeyBinding";

type KeybindsState = {
  overrides: KeyBindingMap;
  hydrated: boolean;
  init: () => Promise<void>;
  setKeybind: (id: string, binding: KeyBindingOrDisabled) => Promise<void>;
  resetKeybind: (id: string) => Promise<void>;
  resetAll: () => Promise<void>;
  matchesShortcut: (id: string, defaultMatch: (e: KeyboardEvent) => boolean, e: KeyboardEvent) => boolean;
  getEffectiveDisplayKeys: (id: string, defaultKeys: string[]) => string[];
};

let initialized = false;

export const useKeybindsStore = create<KeybindsState>((set, get) => ({
  overrides: {},
  hydrated: false,

  init: async () => {
    if (initialized) return;
    initialized = true;
    try {
      const overrides = await loadKeybinds();
      set({ overrides, hydrated: true });
    } catch {
      set({ overrides: {}, hydrated: true });
    }
    void onKeybindsChanged(async () => {
      try {
        const overrides = await loadKeybinds();
        set({ overrides });
      } catch {
        // keep existing state on reload failure
      }
    });
  },

  setKeybind: async (id, binding) => {
    await saveKeybind(id, binding);
    set((s) => ({ overrides: { ...s.overrides, [id]: binding } }));
  },

  resetKeybind: async (id) => {
    await resetKeybind(id);
    set((s) => {
      const next = { ...s.overrides };
      delete next[id];
      return { overrides: next };
    });
  },

  resetAll: async () => {
    await resetAllKeybinds();
    set({ overrides: {} });
  },

  matchesShortcut: (id, defaultMatch, e) => {
    const { overrides } = get();
    if (id in overrides) {
      const override = overrides[id];
      if (override === null) return false;
      return bindingMatchesEvent(override as KeyBinding, e);
    }
    return defaultMatch(e);
  },

  getEffectiveDisplayKeys: (id, defaultKeys) => {
    const { overrides } = get();
    if (id in overrides) {
      const override = overrides[id];
      if (override === null) return [];
      return (override as KeyBinding).displayKeys;
    }
    return defaultKeys;
  },
}));
