import { indentUnit } from "@codemirror/language";
import { lintGutter } from "@codemirror/lint";
import { Compartment, EditorState, RangeSetBuilder, type Extension } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView, keymap, ViewPlugin, type ViewUpdate } from "@codemirror/view";

const fullLineDeco = Decoration.line({ class: "cm-line-sel-full" });

const fullWidthLineSelectionPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) { this.decorations = this.build(view); }
    update(u: ViewUpdate) {
      if (u.selectionSet || u.docChanged || u.viewportChanged)
        this.decorations = this.build(u.view);
    }
    build(view: EditorView): DecorationSet {
      const builder = new RangeSetBuilder<Decoration>();
      const { state } = view;
      for (const range of state.selection.ranges) {
        if (range.empty) continue;
        const from = Math.min(range.from, range.to);
        const to = Math.max(range.from, range.to);
        const startLine = state.doc.lineAt(from);
        const endLine = state.doc.lineAt(to);
        for (let n = startLine.number + 1; n < endLine.number; n++) {
          const line = state.doc.line(n);
          builder.add(line.from, line.from, fullLineDeco);
        }
      }
      return builder.finish();
    }
  },
  { decorations: (v) => v.decorations },
);

// Compartments allow runtime reconfiguration without rebuilding state.
export const fontSizeCompartment = new Compartment();
export const languageCompartment = new Compartment();
export const readOnlyCompartment = new Compartment();
export const wrapCompartment = new Compartment();
export const vimCompartment = new Compartment();
export const lineNumbersCompartment = new Compartment();
export const bracketMatchingCompartment = new Compartment();
export const tabSizeCompartment = new Compartment();
export const indentGuidesCompartment = new Compartment();
export const fontFamilyCompartment = new Compartment();
export const lineHeightCompartment = new Compartment();
export const indentWithTabsCompartment = new Compartment();

// Only what basicSetup doesn't already cover, to avoid duplicate extensions.
// basicSetup gives us line numbers, fold gutter, history, indentOnInput,
// bracketMatching, closeBrackets, autocompletion, highlightActiveLine,
// highlightSelectionMatches and the search keymap.
export function buildSharedExtensions(
  fontSize = 13,
  fontFamily = '"JetBrains Mono", SFMono-Regular, Menlo, monospace',
  lineHeight = 1.55,
): Extension[] {
  return [
    fullWidthLineSelectionPlugin,
    indentWithTabsCompartment.of(indentUnit.of("  ")),
    EditorState.tabSize.of(2),
    keymap.of([{ key: "Mod-f", run: () => true }]),
    lintGutter(),
    fontSizeCompartment.of(
      EditorView.theme({
        ".cm-scroller": { fontSize: `${fontSize}px` },
      }),
    ),
    fontFamilyCompartment.of(EditorView.theme({ ".cm-scroller": { fontFamily } })),
    lineHeightCompartment.of(EditorView.theme({ ".cm-scroller": { lineHeight: String(lineHeight) } })),
    EditorView.theme({
      "&, &.cm-editor, &.cm-editor.cm-focused": {
        backgroundColor: "transparent !important",
        color: "var(--foreground)",
        outline: "none",
        padding: "8px",
      },
      ".cm-scroller": {
        backgroundColor: "transparent !important",
      },
      ".cm-content": {
        caretColor: "var(--foreground)",
        backgroundColor: "transparent !important",
      },
      ".cm-gutters": {
        backgroundColor: "transparent !important",
        color: "var(--muted-foreground)",
      },
      ".cm-gutter-lint": {
        width: "0px",
      },
      ".cm-gutter": { backgroundColor: "transparent !important" },
      ".cm-lineNumbers .cm-gutterElement": {
        opacity: "0.55",
      },
      ".cm-foldGutter": { width: "10px" },
      ".cm-foldGutter .cm-gutterElement": {
        color: "var(--muted-foreground)",
        opacity: "0.5",
      },
      ".cm-activeLine": {
        borderTopRightRadius: "5px",
        borderBottomRightRadius: "5px",
        backgroundColor:
          "color-mix(in srgb, var(--foreground) 4%, transparent)",
      },
      ".cm-lineNumbers .cm-activeLineGutter": {
        borderTopLeftRadius: "5px",
        borderBottomLeftRadius: "5px",
        userSelect: "none",
      },
      ".cm-cursor, .cm-dropCursor": {
        borderLeftColor: "var(--foreground)",
      },
      // Vim normal-mode block cursor — translucent foreground, no rose hue.
      ".cm-fat-cursor": {
        background:
          "color-mix(in srgb, var(--foreground) 35%, transparent) !important",
        outline:
          "1px solid color-mix(in srgb, var(--foreground) 55%, transparent) !important",
        color: "var(--foreground) !important",
      },
      "&:not(.cm-focused) .cm-fat-cursor": {
        background: "transparent !important",
        outline:
          "1px solid color-mix(in srgb, var(--foreground) 35%, transparent) !important",
      },
      ".cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection":
        {
          backgroundColor:
            "color-mix(in srgb, var(--foreground) 18%, transparent) !important",
        },
      ".cm-line-sel-full": {
        backgroundColor:
          "color-mix(in srgb, var(--foreground) 18%, transparent)",
      },
      ".cm-panels": {
        backgroundColor: "var(--popover)",
        color: "var(--popover-foreground)",
        borderColor: "var(--border)",
      },
    }),
  ];
}
