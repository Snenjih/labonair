import { history as cmHistory, defaultKeymap, historyKeymap } from "@codemirror/commands";
import { StreamLanguage } from "@codemirror/language";
import { shell } from "@codemirror/legacy-modes/mode/shell";
import { EditorState, Prec, StateEffect, StateField, type Transaction } from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  drawSelection,
  EditorView,
  keymap,
  placeholder,
  WidgetType,
} from "@codemirror/view";
import { historyListFor, suggestFor } from "./commandHistory";

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

/** When the just-typed text exactly continues the current ghost suggestion
 *  (the common case: typing into a match that's already being suggested),
 *  shrink it in place instead of clearing it — the debounced re-lookup in
 *  scheduleGhostLookup takes ~80ms, and clearing-then-reappearing every
 *  single keystroke in that window is a visible flicker. Returns `undefined`
 *  when the edit doesn't cleanly continue the suggestion (a deletion, a
 *  mismatched character, a multi-change transaction like a paste) — the
 *  caller falls back to clearing until the next lookup resolves, same as
 *  before. This is a pure local slice of a string CodeMirror already has in
 *  hand, so it can never disagree with the debounced lookup that follows;
 *  it just avoids waiting for it in the overwhelmingly common case. */
function predictShrunkGhost(current: string | null, tr: Transaction): string | null | undefined {
  if (!current) return undefined;
  let deletedAny = false;
  let insertedText = "";
  let changeCount = 0;
  tr.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
    changeCount += 1;
    if (toA > fromA) deletedAny = true;
    insertedText += inserted.toString();
  });
  if (changeCount !== 1 || deletedAny || !insertedText) return undefined;
  if (!current.startsWith(insertedText)) return undefined;
  return current.slice(insertedText.length) || null;
}

const ghostField = StateField.define<{ suggestion: string | null; deco: DecorationSet }>({
  create: () => ({ suggestion: null, deco: Decoration.none }),
  update(value, tr) {
    let suggestion = value.suggestion;
    let explicit = false;
    for (const e of tr.effects) {
      if (e.is(setGhost)) {
        suggestion = e.value;
        explicit = true;
      }
    }
    if (tr.docChanged && !explicit) {
      const predicted = predictShrunkGhost(value.suggestion, tr);
      suggestion = predicted === undefined ? null : predicted;
    }
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

function scheduleGhostLookup(view: EditorView, sessionId: string): void {
  const text = view.state.doc.toString();
  const atEnd = view.state.selection.main.head === view.state.doc.length;
  if (!atEnd || !text.trim()) {
    view.dispatch({ effects: setGhost.of(null) });
    return;
  }
  const found = suggestFor(sessionId, text);
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
// Only used when the "history popup" setting is off — see
// ShellComposerCallbacks.history for the popup-driven alternative.

type NavState = { index: number | null; draft: string };
const navBySession = new Map<string, NavState>();

function navigateHistory(view: EditorView, sessionId: string, direction: -1 | 1): boolean {
  const list = historyListFor(sessionId);
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
  /** Only set when the "history popup" setting is on. When present, ArrowUp
   *  at the document start opens the popup (instead of the inline
   *  navigateHistory behavior above); while it reports `isOpen() === true`,
   *  ArrowUp/ArrowDown/Enter/Escape are fully delegated to it instead of
   *  their normal editor behavior. All state (open/selected index) lives in
   *  the React component that renders the popup — this module only ever
   *  reads it through these callbacks, never owns it, since the keymap
   *  closures here are created once per editor instance and would
   *  otherwise go stale. */
  history?: {
    isOpen: () => boolean;
    open: () => void;
    close: () => void;
    move: (direction: -1 | 1) => void;
    runSelected: () => void;
  };
};

export type ShellComposerCursorOptions = {
  fontFamily: string;
  cursorStyle: "block" | "underline" | "bar";
  cursorBlink: boolean;
  cursorBlinkInterval: number;
};

function cursorCss(style: ShellComposerCursorOptions["cursorStyle"]): Record<string, string> {
  switch (style) {
    case "block":
      return {
        borderLeft: "none",
        width: "1ch",
        backgroundColor: "color-mix(in oklch, var(--cursor) 55%, transparent)",
      };
    case "underline":
      return {
        borderLeft: "none",
        width: "1ch",
        borderBottom: "2px solid var(--cursor)",
      };
    default:
      return { borderLeftColor: "var(--cursor)", borderLeftWidth: "1.5px" };
  }
}

export function createShellComposerEditor(
  parent: HTMLElement,
  sessionId: string,
  callbacks: ShellComposerCallbacks,
  options: ShellComposerCursorOptions,
): ShellComposerHandle {
  let ghostTimer: ReturnType<typeof setTimeout> | null = null;

  const submitKeymap = Prec.highest(
    keymap.of([
      {
        key: "Enter",
        run: (view) => {
          if (callbacks.history?.isOpen()) {
            callbacks.history.runSelected();
            return true;
          }
          // Enter always submits exactly what's typed, ignoring any ghost
          // suggestion — only Tab (below) accepts it. The ghost text is a
          // decoration, not part of the document, so it's never included in
          // `text` regardless.
          const text = view.state.doc.toString();
          if (!text.trim()) return false;
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
        key: "Escape",
        run: () => {
          if (!callbacks.history?.isOpen()) return false;
          callbacks.history.close();
          return true;
        },
      },
      {
        key: "ArrowUp",
        run: (view) => {
          if (callbacks.history) {
            if (callbacks.history.isOpen()) {
              callbacks.history.move(-1);
              return true;
            }
            if (view.state.selection.main.head !== 0) return false;
            callbacks.history.open();
            return true;
          }
          if (view.state.selection.main.head !== 0) return false;
          return navigateHistory(view, sessionId, -1);
        },
      },
      {
        key: "ArrowDown",
        run: (view) => {
          if (callbacks.history?.isOpen()) {
            callbacks.history.move(1);
            return true;
          }
          if (view.state.selection.main.head !== view.state.doc.length) return false;
          return navigateHistory(view, sessionId, 1);
        },
      },
    ]),
  );

  const updateListener = EditorView.updateListener.of((update) => {
    if (!update.docChanged) return;
    // Genuine typing while the history popup is open means the user wants
    // to type, not browse — close it and let the keystroke through normally
    // (the popup never edits the doc itself, so any doc change here is real
    // user input, not a popup-driven update).
    if (callbacks.history?.isOpen()) callbacks.history.close();
    if (ghostTimer) clearTimeout(ghostTimer);
    ghostTimer = setTimeout(() => scheduleGhostLookup(update.view, sessionId), 80);
  });

  const { fontFamily, cursorStyle, cursorBlink, cursorBlinkInterval } = options;

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
        // Draws its own cursor overlay (synced to focus/selection state, not
        // the browser's native caret) — the native caret is what caused the
        // "cursor gets stuck after deleting back to empty" bug and the
        // hardcoded-black color, since CodeMirror's base theme only styles
        // the native caret's `caret-color`. drawSelection replaces it
        // entirely with a `.cm-cursor` element that behaves correctly.
        drawSelection({ cursorBlinkRate: cursorBlink ? cursorBlinkInterval : 0 }),
        placeholder("Run a command…   ·   ↑ history"),
        // Matches AiInputBar's plain <textarea> look exactly (transparent,
        // no border/focus ring) — CodeMirror's base theme otherwise draws a
        // focus outline, neither themeable via Tailwind classes on the
        // wrapper since they're inside CodeMirror's own shadow-less content
        // root. Cursor color/shape mirror the terminalCursor* preferences
        // the real xterm terminal already uses, via the same --cursor token.
        EditorView.theme({
          "&": { fontSize: "13px", backgroundColor: "transparent" },
          "&.cm-editor": { outline: "none", border: "none" },
          "&.cm-focused": { outline: "none" },
          ".cm-content": { fontFamily, padding: "0" },
          ".cm-line": { padding: "0" },
          ".cm-cursor": cursorCss(cursorStyle),
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
