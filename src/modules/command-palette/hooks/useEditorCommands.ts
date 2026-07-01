import { HugeiconsIcon } from "@hugeicons/react";
import { SourceCodeIcon, Edit02Icon } from "@hugeicons/core-free-icons";
import { createElement } from "react";
import { useEditorMetaStore } from "@/modules/editor/lib/editorMetaStore";
import { usePreferencesStore } from "@/modules/settings/preferences";
import {
  setEditorWordWrap,
  setEditorLineNumbers,
  setEditorBracketMatching,
  setEditorFormatOnSave,
  setEditorIndentationGuides,
  setEditorShowOutline,
} from "@/modules/settings/store";
import type { CommandAction, CommandPage, RegistryCallbacks } from "../types";

export function useEditorCommands(cb: RegistryCallbacks): {
  rootActions: CommandAction[];
  outlinePage: CommandPage;
} {
  const wordWrap = usePreferencesStore((s) => s.editorWordWrap);
  const lineNumbers = usePreferencesStore((s) => s.editorLineNumbers);
  const bracketMatching = usePreferencesStore((s) => s.editorBracketMatching);
  const formatOnSave = usePreferencesStore((s) => s.editorFormatOnSave);
  const indentGuides = usePreferencesStore((s) => s.editorIndentationGuides);
  const showOutline = usePreferencesStore((s) => s.editorShowOutline);
  const outline = useEditorMetaStore((s) => s.outline);

  const rootActions: CommandAction[] = [
    {
      id: "editor.go-to-symbol",
      title: "Go to Symbol…",
      section: "Editor",
      contexts: ["editor"],
      subPageId: "outline",
      icon: createElement(HugeiconsIcon, {
        icon: SourceCodeIcon,
        strokeWidth: 2,
        className: "size-4",
      }),
    },
    {
      id: "editor.toggle-word-wrap",
      title: "Toggle: Word Wrap",
      section: "Editor",
      contexts: ["editor"],
      rightLabel: wordWrap ? "ON" : "OFF",
      perform: () => void setEditorWordWrap(!wordWrap),
    },
    {
      id: "editor.toggle-line-numbers",
      title: "Toggle: Line Numbers",
      section: "Editor",
      contexts: ["editor"],
      rightLabel: lineNumbers ? "ON" : "OFF",
      perform: () => void setEditorLineNumbers(!lineNumbers),
    },
    {
      id: "editor.toggle-bracket-matching",
      title: "Toggle: Bracket Matching",
      section: "Editor",
      contexts: ["editor"],
      rightLabel: bracketMatching ? "ON" : "OFF",
      perform: () => void setEditorBracketMatching(!bracketMatching),
    },
    {
      id: "editor.toggle-format-on-save",
      title: "Toggle: Format on Save",
      section: "Editor",
      contexts: ["editor"],
      rightLabel: formatOnSave ? "ON" : "OFF",
      perform: () => void setEditorFormatOnSave(!formatOnSave),
    },
    {
      id: "editor.toggle-indent-guides",
      title: "Toggle: Indentation Guides",
      section: "Editor",
      contexts: ["editor"],
      rightLabel: indentGuides ? "ON" : "OFF",
      perform: () => void setEditorIndentationGuides(!indentGuides),
    },
    {
      id: "editor.toggle-outline",
      title: "Toggle: Code Outline",
      section: "Editor",
      contexts: ["editor"],
      rightLabel: showOutline ? "ON" : "OFF",
      perform: () => void setEditorShowOutline(!showOutline),
    },
    {
      id: "editor.format-document",
      title: "Format Document",
      section: "Editor",
      contexts: ["editor"],
      shortcut: ["⌘", "⇧", "F"],
      icon: createElement(HugeiconsIcon, {
        icon: Edit02Icon,
        strokeWidth: 2,
        className: "size-4",
      }),
      perform: () => cb.formatEditorDocument(),
    },
  ];

  const outlinePage: CommandPage = {
    id: "outline",
    searchPlaceholder: "Search symbols…",
    actions:
      outline.length === 0
        ? [
            {
              id: "outline.empty",
              title: "No symbols found",
              section: "Symbols",
              perform: undefined,
            },
          ]
        : outline.map((item) => ({
            id: `outline.${item.pos}`,
            title: item.label,
            subtitle: `Ln ${item.line}`,
            section: "Symbols",
            perform: () => cb.jumpToEditorPosition(item.pos),
          })),
  };

  return { rootActions, outlinePage };
}
