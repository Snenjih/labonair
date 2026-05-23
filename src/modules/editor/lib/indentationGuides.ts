import { Decoration, type DecorationSet, EditorView, ViewPlugin } from "@codemirror/view";
import { RangeSetBuilder, type Extension } from "@codemirror/state";
import type { ViewUpdate } from "@codemirror/view";

const guideDecoration = Decoration.mark({ class: "cm-indent-guide" });

function buildDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const tabSize = view.state.tabSize;

  for (const { from, to } of view.visibleRanges) {
    let pos = from;
    while (pos <= to) {
      const line = view.state.doc.lineAt(pos);
      const text = line.text;

      // Count leading whitespace characters
      let ws = 0;
      while (ws < text.length && (text[ws] === " " || text[ws] === "\t")) ws++;

      // Skip blank lines — no content to anchor guides on
      if (ws > 0 && ws < text.length) {
        for (let col = 0; col + tabSize <= ws; col += tabSize) {
          const markFrom = line.from + col;
          const markTo = markFrom + 1;
          if (markTo <= line.to) {
            builder.add(markFrom, markTo, guideDecoration);
          }
        }
      }

      pos = line.to + 1;
    }
  }

  return builder.finish();
}

const guidePlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged || update.selectionSet) {
        this.decorations = buildDecorations(update.view);
      }
    }
  },
  { decorations: (v) => v.decorations },
);

const guideTheme = EditorView.baseTheme({
  ".cm-indent-guide": {
    boxShadow: "inset 1px 0 0 color-mix(in srgb, var(--muted-foreground) 16%, transparent)",
  },
});

export const indentationGuides: Extension = [guidePlugin, guideTheme];
