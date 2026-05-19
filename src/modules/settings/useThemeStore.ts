import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import {
  applyThemeColors,
  revertThemeColors,
  type ThemeMeta,
} from "@/lib/useThemeEngine";
import { setAppTheme } from "./store";
import { usePreferencesStore } from "./preferences";

export type RemoteTheme = {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  authorUrl: string;
  type: "dark" | "light" | string;
  rawUrl: string;
};

/** Fallback mock data used when the remote index cannot be fetched. */
const MOCK_COMMUNITY_THEMES: RemoteTheme[] = [
  {
    id: "catppuccin-mocha",
    name: "Catppuccin Mocha",
    version: "1.0.0",
    description: "Soothing pastel theme for Nexum",
    author: "Catppuccin",
    authorUrl: "https://github.com/catppuccin",
    type: "dark",
    rawUrl:
      "https://raw.githubusercontent.com/Snenjih/nexum-themes/main/themes/catppuccin-mocha.json",
  },
  {
    id: "nord",
    name: "Nord",
    version: "1.0.0",
    description: "An arctic, north-bluish color palette",
    author: "arcticicestudio",
    authorUrl: "https://github.com/arcticicestudio",
    type: "dark",
    rawUrl:
      "https://raw.githubusercontent.com/Snenjih/nexum-themes/main/themes/nord.json",
  },
];

const COMMUNITY_INDEX_URL =
  "https://raw.githubusercontent.com/Snenjih/nexum-themes/main/index.json";

type ThemeStore = {
  installedThemes: ThemeMeta[];
  communityThemes: RemoteTheme[];
  isLoadingInstalled: boolean;
  isLoadingCommunity: boolean;
  installingIds: Set<string>;
  communityError: string | null;
  previewThemeId: string | null;

  fetchInstalled: () => Promise<void>;
  fetchCommunity: () => Promise<void>;
  installTheme: (remote: RemoteTheme) => Promise<void>;
  uninstallTheme: (id: string) => Promise<void>;
  applyTheme: (id: string) => Promise<void>;
  previewTheme: (meta: ThemeMeta | null) => void;
  cancelPreview: () => void;
};

export const useThemeStore = create<ThemeStore>((set, get) => ({
  installedThemes: [],
  communityThemes: [],
  isLoadingInstalled: false,
  isLoadingCommunity: false,
  installingIds: new Set(),
  communityError: null,
  previewThemeId: null,

  fetchInstalled: async () => {
    set({ isLoadingInstalled: true });
    try {
      const themes = await invoke<ThemeMeta[]>("themes_get_all");
      set({ installedThemes: themes });
    } catch (e) {
      console.error("fetchInstalled error:", e);
    } finally {
      set({ isLoadingInstalled: false });
    }
  },

  fetchCommunity: async () => {
    set({ isLoadingCommunity: true, communityError: null });
    try {
      const raw = await invoke<string>("theme_fetch_index", {
        url: COMMUNITY_INDEX_URL,
      });
      const themes = JSON.parse(raw) as RemoteTheme[];
      set({ communityThemes: themes });
    } catch (e) {
      console.warn("Could not fetch community themes:", e);
      set({
        communityError:
          "Could not connect to the theme registry. Showing cached entries.",
        communityThemes: MOCK_COMMUNITY_THEMES,
      });
    } finally {
      set({ isLoadingCommunity: false });
    }
  },

  installTheme: async (remote: RemoteTheme) => {
    const prev = get().installingIds;
    set({ installingIds: new Set([...prev, remote.id]) });
    try {
      await invoke("theme_download", { url: remote.rawUrl });
      await get().fetchInstalled();
    } finally {
      const next = new Set(get().installingIds);
      next.delete(remote.id);
      set({ installingIds: next });
    }
  },

  uninstallTheme: async (id: string) => {
    const savedTheme = usePreferencesStore.getState().appTheme;
    await invoke("theme_delete", { id });
    if (savedTheme === id) {
      await setAppTheme("default");
      revertThemeColors();
    }
    await get().fetchInstalled();
  },

  applyTheme: async (id: string) => {
    await setAppTheme(id);
    if (id === "default") {
      revertThemeColors();
    } else {
      const meta = get().installedThemes.find((t) => t.id === id);
      if (meta) applyThemeColors(meta);
    }
    set({ previewThemeId: null });
  },

  previewTheme: (meta: ThemeMeta | null) => {
    if (meta) {
      applyThemeColors(meta);
      set({ previewThemeId: meta.id });
    } else {
      const savedTheme = usePreferencesStore.getState().appTheme;
      if (savedTheme === "default") {
        revertThemeColors();
      } else {
        const saved = get().installedThemes.find((t) => t.id === savedTheme);
        if (saved) applyThemeColors(saved);
        else revertThemeColors();
      }
      set({ previewThemeId: null });
    }
  },

  cancelPreview: () => {
    const savedTheme = usePreferencesStore.getState().appTheme;
    const { previewThemeId, installedThemes } = get();
    if (previewThemeId === null) return;
    if (savedTheme === "default") {
      revertThemeColors();
    } else {
      const saved = installedThemes.find((t) => t.id === savedTheme);
      if (saved) applyThemeColors(saved);
      else revertThemeColors();
    }
    set({ previewThemeId: null });
  },
}));
