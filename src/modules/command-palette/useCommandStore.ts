import { create } from "zustand";
import { usePreferencesStore } from "@/modules/settings/preferences";

const RECENT_KEY = "nexum-palette-recent";

function loadRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function saveRecent(ids: string[]): void {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(ids));
  } catch {
    // ignore
  }
}

type State = {
  isOpen: boolean;
  initialPage: string;
  recentIds: string[];
  open: () => void;
  openToPage: (pageId: string) => void;
  close: () => void;
  toggle: () => void;
  pushRecent: (id: string) => void;
};

export const useCommandStore = create<State>((set) => ({
  isOpen: false,
  initialPage: "root",
  recentIds: loadRecent(),
  open: () => set({ isOpen: true, initialPage: "root" }),
  openToPage: (pageId) => set({ isOpen: true, initialPage: pageId }),
  close: () => set({ isOpen: false, initialPage: "root" }),
  toggle: () => set((s) => ({ isOpen: !s.isOpen, initialPage: "root" })),
  pushRecent: (id) =>
    set((s) => {
      const max = usePreferencesStore.getState().commandPaletteHistorySize;
      const next = [id, ...s.recentIds.filter((r) => r !== id)].slice(0, max);
      saveRecent(next);
      return { recentIds: next };
    }),
}));
