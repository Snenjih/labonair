import { create } from "zustand";
import type { OutlineItem } from "./outline";

type State = {
  outline: OutlineItem[];
  setOutline: (items: OutlineItem[]) => void;
};

export const useEditorMetaStore = create<State>((set) => ({
  outline: [],
  setOutline: (outline) => set({ outline }),
}));
