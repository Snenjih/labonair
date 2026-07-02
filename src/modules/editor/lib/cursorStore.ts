import { create } from "zustand";

type State = {
  line: number;
  col: number;
  selectionChars: number;
  selectionLines: number;
  set: (line: number, col: number, selectionChars: number, selectionLines: number) => void;
};

export const useEditorCursorStore = create<State>((set) => ({
  line: 1,
  col: 1,
  selectionChars: 0,
  selectionLines: 0,
  set: (line, col, selectionChars, selectionLines) => set({ line, col, selectionChars, selectionLines }),
}));
