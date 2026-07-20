import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import { applyThemeColors, revertThemeColors, type ThemeMeta } from "@/lib/useThemeEngine";
import { usePreferencesStore } from "./preferences";
import { setAppTheme, setThemeVariantOverride } from "./store";

export type RemoteTheme = {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  authorUrl: string;
  rawUrl: string;
};

/** Fallback mock data used when the remote index cannot be fetched. */
const MOCK_COMMUNITY_THEMES: RemoteTheme[] = [
  {
    id: "catppuccin",
    name: "Catppuccin",
    version: "1.0.0",
    description: "Soothing pastel theme for Labonair — Latte, Frappé, Macchiato, Mocha",
    author: "Catppuccin",
    authorUrl: "https://github.com/catppuccin",
    rawUrl: "https://raw.githubusercontent.com/Snenjih/labonair-themes/main/themes/catppuccin.json",
  },
  {
    id: "nord",
    name: "Nord",
    version: "1.0.0",
    description: "An arctic, north-bluish color palette",
    author: "arcticicestudio",
    authorUrl: "https://github.com/arcticicestudio",
    rawUrl: "https://raw.githubusercontent.com/Snenjih/labonair-themes/main/themes/nord.json",
  },
];

const COMMUNITY_INDEX_URL = "https://raw.githubusercontent.com/Snenjih/labonair-themes/main/index.json";

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
  applyTheme: (id: string, variantKey?: string) => Promise<void>;
  previewTheme: (meta: ThemeMeta | null, variantKey?: string) => void;
  cancelPreview: () => void;
  createTheme: (name: string) => Promise<string>;
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
        communityError: "Could not connect to the theme registry. Showing cached entries.",
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
      const { resolvedMode } = usePreferencesStore.getState();
      const meta = await loadDefaultMeta();
      if (meta) applyThemeColors(meta, resolvedMode);
      else revertThemeColors();
    }
    await get().fetchInstalled();
  },

  applyTheme: async (id: string, variantKey?: string) => {
    await setAppTheme(id);
    const { resolvedMode } = usePreferencesStore.getState();
    if (variantKey) await setThemeVariantOverride(id, resolvedMode, variantKey);
    if (id === "default") {
      const meta = await loadDefaultMeta();
      if (meta) applyThemeColors(meta, resolvedMode, variantKey);
      else revertThemeColors();
    } else {
      const meta = get().installedThemes.find((t) => t.id === id);
      if (meta) applyThemeColors(meta, resolvedMode, variantKey);
    }
    set({ previewThemeId: null });
  },

  previewTheme: (meta: ThemeMeta | null, variantKey?: string) => {
    const { resolvedMode } = usePreferencesStore.getState();
    if (meta) {
      applyThemeColors(meta, resolvedMode, variantKey);
      set({ previewThemeId: meta.id });
    } else {
      void revertToSaved();
      set({ previewThemeId: null });
    }
  },

  createTheme: async (name: string) => {
    const [meta, filePath] = await invoke<[ThemeMeta, string]>("theme_create", { name });
    get().fetchInstalled();
    void meta;
    return filePath;
  },

  cancelPreview: () => {
    if (get().previewThemeId === null) return;
    void revertToSaved();
    set({ previewThemeId: null });
  },
}));

async function loadDefaultMeta(): Promise<ThemeMeta | null> {
  try {
    return await invoke<ThemeMeta>("theme_get_default");
  } catch {
    return null;
  }
}

/** Re-apply the persisted (non-preview) theme — used to revert a hover preview. */
async function revertToSaved(): Promise<void> {
  const { appTheme, resolvedMode, themeVariantOverrides } = usePreferencesStore.getState();
  const variantKey = themeVariantOverrides[appTheme]?.[resolvedMode];
  if (appTheme === "default") {
    const meta = await loadDefaultMeta();
    if (meta) applyThemeColors(meta, resolvedMode, variantKey);
    else revertThemeColors();
    return;
  }
  const themes = await invoke<ThemeMeta[]>("themes_get_all").catch(() => [] as ThemeMeta[]);
  const saved = themes.find((t) => t.id === appTheme);
  if (saved) applyThemeColors(saved, resolvedMode, variantKey);
  else revertThemeColors();
}
