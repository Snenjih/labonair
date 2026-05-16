import { load } from "@tauri-apps/plugin-store";
import { create } from "zustand";

// Keyed by host_address (e.g. "192.168.1.1") or "local".
type BookmarkMap = Record<string, string[]>;

interface BookmarksState {
  bookmarks: BookmarkMap;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  addBookmark: (key: string, path: string) => Promise<void>;
  removeBookmark: (key: string, path: string) => Promise<void>;
  getBookmarks: (key: string) => string[];
}

let _store: Awaited<ReturnType<typeof load>> | null = null;

async function getStore() {
  if (!_store) {
    _store = await load("nexum-bookmarks.json", { autoSave: true, defaults: {} });
  }
  return _store;
}

export const useBookmarksStore = create<BookmarksState>((set, get) => ({
  bookmarks: {},
  hydrated: false,

  hydrate: async () => {
    if (get().hydrated) return;
    const store = await getStore();
    const raw = await store.get<BookmarkMap>("bookmarks");
    set({ bookmarks: raw ?? {}, hydrated: true });
  },

  addBookmark: async (key, path) => {
    const current = get().bookmarks;
    const existing = current[key] ?? [];
    if (existing.includes(path)) return;
    const next = { ...current, [key]: [...existing, path] };
    set({ bookmarks: next });
    const store = await getStore();
    await store.set("bookmarks", next);
  },

  removeBookmark: async (key, path) => {
    const current = get().bookmarks;
    const existing = current[key] ?? [];
    const next = { ...current, [key]: existing.filter((p) => p !== path) };
    set({ bookmarks: next });
    const store = await getStore();
    await store.set("bookmarks", next);
  },

  getBookmarks: (key) => get().bookmarks[key] ?? [],
}));
