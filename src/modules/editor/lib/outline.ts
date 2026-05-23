import { syntaxTree } from "@codemirror/language";
import type { EditorView } from "@codemirror/view";

export type OutlineItem = {
  label: string;
  level: number;
  line: number;
  pos: number;
};

const HEADING_NAMES = new Set([
  "ATXHeading1",
  "ATXHeading2",
  "ATXHeading3",
  "ATXHeading4",
  "ATXHeading5",
  "ATXHeading6",
]);

const DECL_NAMES = new Set([
  "FunctionDeclaration",
  "FunctionDefinition",
  "FunctionItem",
  "ClassDeclaration",
  "ClassDefinition",
  "StructItem",
  "EnumItem",
  "ImplItem",
  "MethodDefinition",
]);

const IDENT_NAMES = new Set([
  "VariableDefinition",
  "PropertyDefinition",
  "Identifier",
  "TypeIdentifier",
  "Name",
]);

export function extractOutline(view: EditorView): OutlineItem[] {
  const items: OutlineItem[] = [];
  const tree = syntaxTree(view.state);

  tree.cursor().iterate((node) => {
    if (HEADING_NAMES.has(node.name)) {
      const level = parseInt(node.name[node.name.length - 1] ?? "1");
      const raw = view.state.sliceDoc(node.from, node.to);
      const label = raw.replace(/^#+\s*/, "").split("\n")[0]?.trim() ?? "";
      const line = view.state.doc.lineAt(node.from).number;
      if (label) items.push({ label, level, line, pos: node.from });
      return false;
    }

    if (DECL_NAMES.has(node.name)) {
      let name = "";
      const inner = node.node.cursor();
      if (inner.firstChild()) {
        do {
          if (IDENT_NAMES.has(inner.name)) {
            name = view.state.sliceDoc(inner.from, inner.to);
            break;
          }
        } while (inner.nextSibling());
      }
      if (name) {
        const line = view.state.doc.lineAt(node.from).number;
        items.push({ label: name, level: 1, line, pos: node.from });
      }
      return false;
    }
  });

  return items;
}
