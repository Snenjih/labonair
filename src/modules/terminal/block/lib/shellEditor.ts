import { EditorView, keymap, placeholder } from "@codemirror/view";
import { EditorState, Prec } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { autocompletion, completionKeymap } from "@codemirror/autocomplete";
import { StreamLanguage } from "@codemirror/language";
import { shell } from "@codemirror/legacy-modes/mode/shell";
import {
  inlineSuggestField,
  setGhostText,
  acceptGhostText,
} from "./inlineSuggest";
import { historyPopoverSource } from "./historyPopover";
import { pathCompleteSource } from "./pathComplete";
import { historySuggest, historyRecord } from "./history";
import { usePreferencesStore } from "@/modules/settings/preferences";

export type ShellEditorCallbacks = {
  onSubmit: (text: string) => void;
  onInterrupt: () => void;
  getCwd: () => string | null;
};

export type ShellEditorHandle = {
  view: EditorView;
  focus: () => void;
  setValue: (text: string) => void;
  getValue: () => string;
  destroy: () => void;
};

export function createShellEditor(
  parent: HTMLElement,
  callbacks: ShellEditorCallbacks,
): ShellEditorHandle {
  const prefs = usePreferencesStore.getState();
  const fontFamily = prefs.terminalFontFamily ?? "monospace";
  const fontSize = prefs.terminalFontSize ?? 13;

  let suggestTimer: ReturnType<typeof setTimeout> | null = null;

  const shellKeymap = Prec.highest(
    keymap.of([
      {
        key: "Enter",
        run: (view) => {
          const text = view.state.doc.toString();
          if (!text.trim()) return false;
          void historyRecord(text.trim());
          callbacks.onSubmit(text);
          view.dispatch(
            view.state.update({
              changes: { from: 0, to: view.state.doc.length, insert: "" },
            }),
          );
          return true;
        },
      },
      {
        key: "Ctrl-c",
        run: () => {
          callbacks.onInterrupt();
          return true;
        },
      },
      {
        key: "Tab",
        run: (view) => acceptGhostText(view),
      },
    ]),
  );

  const updateListener = EditorView.updateListener.of((update) => {
    if (!update.docChanged) return;
    if (suggestTimer) clearTimeout(suggestTimer);
    setGhostText(update.view, null);
    const text = update.state.doc.toString();
    if (!text.trim()) return;
    suggestTimer = setTimeout(async () => {
      const suggestion = await historySuggest(text);
      if (suggestion && update.view.state.doc.toString() === text) {
        setGhostText(update.view, suggestion);
      }
    }, 150);
  });

  const view = new EditorView({
    parent,
    state: EditorState.create({
      extensions: [
        StreamLanguage.define(shell),
        shellKeymap,
        keymap.of([...defaultKeymap, ...historyKeymap, ...completionKeymap]),
        history(),
        inlineSuggestField,
        // Single autocompletion instance — multiple instances cause "Config merge conflict for field override"
        autocompletion({
          override: [pathCompleteSource(callbacks.getCwd), historyPopoverSource()],
          activateOnTyping: true,
          closeOnBlur: false,
          maxRenderedOptions: 20,
        }),
        updateListener,
        EditorView.theme({
          "&": {
            fontFamily,
            fontSize: `${fontSize}px`,
            lineHeight: "1.4",
            background: "transparent",
            color: "var(--foreground)",
            minHeight: "28px",
            display: "flex",
            alignItems: "center",
          },
          ".cm-content": {
            padding: "0",
            caretColor: "var(--foreground)",
            width: "100%",
          },
          ".cm-cursor": { borderLeftColor: "var(--foreground)" },
          ".cm-focused": { outline: "none" },
          ".cm-scroller": { overflow: "hidden", alignItems: "center" },
          ".cm-line": { padding: "0" },
          ".cm-tooltip": {
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: "6px",
          },
          ".cm-tooltip-autocomplete ul li[aria-selected]": {
            background: "var(--muted)",
            color: "var(--foreground)",
          },
        }),
        EditorView.lineWrapping,
        placeholder("Run a command  —  ↑ history"),
      ],
    }),
  });

  return {
    view,
    focus: () => view.focus(),
    setValue: (text: string) => {
      view.dispatch(
        view.state.update({
          changes: { from: 0, to: view.state.doc.length, insert: text },
        }),
      );
    },
    getValue: () => view.state.doc.toString(),
    destroy: () => {
      if (suggestTimer) clearTimeout(suggestTimer);
      view.destroy();
    },
  };
}
