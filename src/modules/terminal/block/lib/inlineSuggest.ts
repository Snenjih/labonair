import {
  EditorView,
  Decoration,
  type DecorationSet,
  WidgetType,
} from "@codemirror/view";
import { StateField, StateEffect } from "@codemirror/state";

const setSuggestionEffect = StateEffect.define<string | null>();

class GhostTextWidget extends WidgetType {
  constructor(readonly text: string) {
    super();
  }

  eq(other: GhostTextWidget): boolean {
    return this.text === other.text;
  }

  toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = "cm-ghost-text";
    span.textContent = this.text;
    return span;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

export const inlineSuggestField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(decos, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setSuggestionEffect)) {
        if (!effect.value) return Decoration.none;
        const pos = tr.newDoc.length;
        return Decoration.set([
          Decoration.widget({
            widget: new GhostTextWidget(effect.value),
            side: 1,
          }).range(pos),
        ]);
      }
    }
    return tr.docChanged ? Decoration.none : decos;
  },
  provide: (f) => EditorView.decorations.from(f),
});

export function setGhostText(view: EditorView, text: string | null): void {
  view.dispatch({ effects: [setSuggestionEffect.of(text)] });
}

export function acceptGhostText(view: EditorView): boolean {
  const decos = view.state.field(inlineSuggestField, false);
  if (!decos) return false;
  let found: string | null = null;
  decos.between(
    view.state.doc.length,
    view.state.doc.length,
    (_from, _to, deco) => {
      const spec = (deco as unknown as { spec?: { widget?: unknown } }).spec;
      const w = spec?.widget;
      if (w instanceof GhostTextWidget) found = w.text;
    },
  );
  if (!found) return false;
  view.dispatch(
    view.state.update({
      changes: { from: view.state.doc.length, insert: found },
      selection: {
        anchor: view.state.doc.length + (found as string).length,
      },
    }),
  );
  setGhostText(view, null);
  return true;
}
