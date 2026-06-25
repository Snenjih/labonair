import { emit, listen } from "@tauri-apps/api/event";
import { create } from "zustand";
import {
  loadDirectives,
  newDirectiveId,
  saveDirectives,
  type Directive,
} from "../lib/directives";

const CHANGED_EVENT = "labonair://ai-directives-changed";

type State = {
  hydrated: boolean;
  directives: Directive[];
  hydrate: () => Promise<void>;
  upsert: (directive: Directive) => void;
  remove: (id: string) => void;
};

let initialized = false;

export const useDirectivesStore = create<State>((set, get) => ({
  hydrated: false,
  directives: [],
  hydrate: async () => {
    if (initialized) return;
    initialized = true;
    set({ directives: await loadDirectives(), hydrated: true });
    void listen(CHANGED_EVENT, async () => {
      set({ directives: await loadDirectives() });
    });
  },
  upsert: (directive) => {
    const list = get().directives;
    const idx = list.findIndex((d) => d.id === directive.id);
    const next =
      idx === -1 ? [...list, directive] : list.map((d) => (d.id === directive.id ? directive : d));
    set({ directives: next });
    void saveDirectives(next).then(() => emit(CHANGED_EVENT));
  },
  remove: (id) => {
    const next = get().directives.filter((d) => d.id !== id);
    set({ directives: next });
    void saveDirectives(next).then(() => emit(CHANGED_EVENT));
  },
}));

export { newDirectiveId };
