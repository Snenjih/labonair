import { defaultKeymap, history as cmHistory, historyKeymap } from "@codemirror/commands";
import { shell } from "@codemirror/legacy-modes/mode/shell";
import { StreamLanguage } from "@codemirror/language";
import { EditorState, Prec, StateEffect, StateField } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  keymap,
  placeholder,
  WidgetType,
} from "@codemirror/view";
import { historyList, recordCommand, suggest } from "./commandHistory";

// ─── Ghost text (inline history suggestion, Tab to accept) ───────────────────

const setGhost = StateEffect.define<string | null>();

class GhostWidget extends WidgetType {
  constructor(readonly text: string) {
    super();
  }
  eq(other: GhostWidget): boolean {
    return other.text === this.text;
  }
  toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.textContent = this.text;
    span.className = "opacity-40 select-none";
    return span;
  }
}

const ghostField = StateField.define<{ suggestion: string | null; deco: DecorationSet }>({
  create: () => ({ suggestion: null, deco: Decoration.none }),
  update(value, tr) {
    let suggestion = value.suggestion;
    for (const e of tr.effects) {
      if (e.is(setGhost)) suggestion = e.value;
    }
    if (tr.docChanged && !tr.effects.some((e) => e.is(setGhost))) suggestion = null;
    if (!suggestion) return { suggestion: null, deco: Decoration.none };
    const pos = tr.state.doc.length;
    const deco = Decoration.set([
      Decoration.widget({ widget: new GhostWidget(suggestion), side: 1 }).range(pos),
    ]);
    return { suggestion, deco };
  },
  provide: (f) => EditorView.decorations.from(f, (v) => v.deco),
});

function ghostSuggestionOf(view: EditorView): string | null {
  return view.state.field(ghostField).suggestion;
}

function scheduleGhostLookup(view: EditorView): void {
  const text = view.state.doc.toString();
  const atEnd = view.state.selection.main.head === view.state.doc.length;
  if (!atEnd || !text.trim()) {
    view.dispatch({ effects: setGhost.of(null) });
    return;
  }
  const found = suggest(text);
  const remainder = found ? found.slice(text.length) : null;
  view.dispatch({ effects: setGhost.of(remainder) });
}

function acceptGhost(view: EditorView): boolean {
  const g = ghostSuggestionOf(view);
  if (!g) return false;
  view.dispatch({
    changes: { from: view.state.doc.length, insert: g },
    selection: { anchor: view.state.doc.length + g.length },
    effects: setGhost.of(null),
  });
  return true;
}

// ─── History navigation (Up/Down at doc boundary) ─────────────────────────────

type NavState = { index: number | null; draft: string };
const navBySession = new Map<string, NavState>();

function navigateHistory(view: EditorView, sessionId: string, direction: -1 | 1): boolean {
  const list = historyList();
  if (list.length === 0) return false;
  let nav = navBySession.get(sessionId);
  if (!nav) {
    nav = { index: null, draft: view.state.doc.toString() };
    navBySession.set(sessionId, nav);
  }
  if (direction === -1) {
    if (nav.index === null) {
      nav.draft = view.state.doc.toString();
      nav.index = list.length - 1;
    } else if (nav.index > 0) {
      nav.index -= 1;
    } else {
      return true; // already at oldest — stay put
    }
  } else {
    if (nav.index === null) return false; // nothing to go "forward" from
    if (nav.index < list.length - 1) {
      nav.index += 1;
    } else {
      nav.index = null;
    }
  }
  const value = nav.index === null ? nav.draft : list[nav.index];
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: value },
    selection: { anchor: value.length },
    effects: setGhost.of(null),
  });
  return true;
}

function resetHistoryNav(sessionId: string): void {
  navBySession.delete(sessionId);
}

// ─── Public factory ────────────────────────────────────────────────────────

export type ShellComposerHandle = {
  view: EditorView;
  focus: () => void;
  setValue: (text: string) => void;
  getValue: () => string;
  destroy: () => void;
};

export type ShellComposerCallbacks = {
  /** Fires on Enter with a non-empty trimmed value. Caller is responsible
   *  for beginBlock()/write() — this module only owns editing/history/ghost
   *  text, not what happens to a submitted command. */
  onSubmit: (text: string) => void;
};

export function createShellComposerEditor(
  parent: HTMLElement,
  sessionId: string,
  callbacks: ShellComposerCallbacks,
  fontFamily: string,
): ShellComposerHandle {
  let ghostTimer: ReturnType<typeof setTimeout> | null = null;

  const submitKeymap = Prec.highest(
    keymap.of([
      {
        key: "Enter",
        run: (view) => {
          if (ghostSuggestionOf(view)) return acceptGhost(view);
          const text = view.state.doc.toString();
          if (!text.trim()) return false;
          void recordCommand(text);
          resetHistoryNav(sessionId);
          callbacks.onSubmit(text);
          view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: "" } });
          return true;
        },
      },
      {
        key: "Shift-Enter",
        run: (view) => {
          view.dispatch(view.state.replaceSelection("\n"));
          return true;
        },
      },
      { key: "Tab", run: acceptGhost },
      {
        key: "ArrowUp",
        run: (view) => {
          if (view.state.selection.main.head !== 0) return false;
          return navigateHistory(view, sessionId, -1);
        },
      },
      {
        key: "ArrowDown",
        run: (view) => {
          if (view.state.selection.main.head !== view.state.doc.length) return false;
          return navigateHistory(view, sessionId, 1);
        },
      },
    ]),
  );

  const updateListener = EditorView.updateListener.of((update) => {
    if (!update.docChanged) return;
    if (ghostTimer) clearTimeout(ghostTimer);
    ghostTimer = setTimeout(() => scheduleGhostLookup(update.view), 80);
  });

  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: "",
      extensions: [
        StreamLanguage.define(shell),
        submitKeymap,
        keymap.of([...defaultKeymap, ...historyKeymap]),
        cmHistory(),
        ghostField,
        updateListener,
        placeholder("Run a command…"),
        EditorView.theme({
          "&": { fontSize: "13px" },
          ".cm-content": { fontFamily, padding: "0" },
          ".cm-line": { padding: "0" },
        }),
        EditorView.lineWrapping,
      ],
    }),
  });

  return {
    view,
    focus: () => view.focus(),
    setValue: (text: string) => {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
    },
    getValue: () => view.state.doc.toString(),
    destroy: () => {
      if (ghostTimer) clearTimeout(ghostTimer);
      view.destroy();
    },
  };
}
