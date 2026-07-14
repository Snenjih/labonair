import { findNext, findPrevious, SearchQuery, setSearchQuery, gotoLine } from "@codemirror/search";
import { toggleComment } from "@codemirror/commands";
import { FindWidget } from "@/modules/search";
import { bracketMatching, foldCode, unfoldCode, foldAll, unfoldAll, indentUnit } from "@codemirror/language";
import { lineNumbers } from "@codemirror/view";
import { keymap, EditorView } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { usePreferencesStore } from "@/modules/settings/preferences";
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { EDITOR_THEME_EXT } from "./lib/themes";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  startTransition,
} from "react";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { Streamdown } from "streamdown";
import { Prec } from "@codemirror/state";
import { vim } from "@replit/codemirror-vim";
import {
  bracketMatchingCompartment,
  buildSharedExtensions,
  fontFamilyCompartment,
  fontSizeCompartment,
  indentGuidesCompartment,
  indentWithTabsCompartment,
  languageCompartment,
  lineHeightCompartment,
  lineNumbersCompartment,
  tabSizeCompartment,
  vimCompartment,
  wrapCompartment,
} from "./lib/extensions";
import { indentationGuides } from "./lib/indentationGuides";
import { initVimGlobals, vimHandlersExtension } from "./lib/vim";

initVimGlobals();
import { resolveLanguage } from "./lib/languageResolver";
import { useDocument } from "./lib/useDocument";
import { inlineCompletion } from "./lib/autocomplete/inlineExtension";
import { useEditorCursorStore } from "./lib/cursorStore";
import { useEditorMetaStore } from "./lib/editorMetaStore";
import { extractOutline, type OutlineItem } from "./lib/outline";
import { OutlinePanel } from "./OutlinePanel";
import { formatDocument } from "./lib/formatter";
import { useCompartmentEffect } from "./lib/useCompartmentEffect";
import { useApiKeys } from "./lib/useApiKeys";
import { useAutoSave } from "./lib/useAutoSave";
import { EditorToolbar } from "./EditorToolbar";

export type EditorPaneHandle = {
  setQuery: (q: string) => void;
  findNext: () => void;
  findPrevious: () => void;
  clearQuery: () => void;
  getSelection: () => string | null;
  getPath: () => string;
  /** Re-read the file from disk. Skips silently if the buffer is dirty. */
  reload: () => boolean;
  /** Save the current buffer (triggers save-as dialog for untitled files). */
  save: () => Promise<void>;
  focus: () => void;
  openFind: () => void;
  closeFind: () => void;
  /** Jump to a character position in the document. */
  jumpToPosition: (pos: number) => void;
  /** Format the current buffer via Prettier. */
  format: () => void;
};

type Props = {
  path: string;
  isUntitled?: boolean;
  isActive?: boolean;
  languageOverride?: string;
  onDirtyChange?: (dirty: boolean) => void;
  onSaved?: () => void;
  onSaveAs?: (newPath: string) => void;
  onClose?: () => void;
  onLanguageChange?: (lang: string | undefined) => void;
};

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export const EditorPane = forwardRef<EditorPaneHandle, Props>(function EditorPane(
  {
    path,
    isUntitled,
    isActive = false,
    languageOverride,
    onDirtyChange,
    onSaved,
    onSaveAs,
    onClose,
    onLanguageChange,
  },
  ref,
) {
  const {
    doc,
    dirty,
    editVersion,
    onChange: _onChange,
    save,
    reload,
  } = useDocument({ path, isUntitled, onDirtyChange, onSaveAs });
  const isMarkdownRef = useRef(false);
  const reloadRef = useRef(reload);
  reloadRef.current = reload;
  const cmRef = useRef<ReactCodeMirrorRef>(null);
  const editorThemeId = usePreferencesStore((s) => s.editorTheme);
  const vimMode = usePreferencesStore((s) => s.vimMode);
  const editorAutoSave = usePreferencesStore((s) => s.editorAutoSave);
  const editorAutoSaveDelay = usePreferencesStore((s) => s.editorAutoSaveDelay);
  const editorLineNumbers = usePreferencesStore((s) => s.editorLineNumbers);
  const editorWordWrap = usePreferencesStore((s) => s.editorWordWrap);
  const editorTabSize = usePreferencesStore((s) => s.editorTabSize);
  const editorBracketMatching = usePreferencesStore((s) => s.editorBracketMatching);
  const editorShowOutline = usePreferencesStore((s) => s.editorShowOutline);
  const editorFormatOnSave = usePreferencesStore((s) => s.editorFormatOnSave);
  const editorIndentationGuides = usePreferencesStore((s) => s.editorIndentationGuides);
  const editorFontFamily = usePreferencesStore((s) => s.editorFontFamily);
  const editorLineHeight = usePreferencesStore((s) => s.editorLineHeight);
  const editorIndentWithTabs = usePreferencesStore((s) => s.editorIndentWithTabs);
  const editorTrimTrailingWhitespace = usePreferencesStore((s) => s.editorTrimTrailingWhitespace);
  const editorInsertFinalNewline = usePreferencesStore((s) => s.editorInsertFinalNewline);
  const languageRef = useRef<string | null>(null);

  const fileName = path.split("/").pop() ?? (isUntitled ? "Untitled" : path);
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  const isMarkdownFile = ext === "md" || ext === "markdown";
  isMarkdownRef.current = isMarkdownFile;
  const [markdownPreviewOpen, setMarkdownPreviewOpen] = useState(false);
  const [previewContent, setPreviewContent] = useState("");
  const [findOpen, setFindOpen] = useState(false);
  const [showReplaceInFind, setShowReplaceInFind] = useState(false);
  const [outline, setOutline] = useState<OutlineItem[]>([]);
  const [detectedLanguage, setDetectedLanguage] = useState<string | null>(null);
  const languageOverrideRef = useRef<string | null>(null);
  const previewDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const outlineDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isActive) {
      useEditorMetaStore.getState().setOutline(outline);
    }
  }, [isActive, outline]);

  // Keep isActive in a ref so listener closures never capture stale value
  const isActiveRef = useRef(isActive);
  useEffect(() => {
    isActiveRef.current = isActive;
    // When becoming active, do an immediate cursor read
    if (isActive) {
      const view = cmRef.current?.view;
      if (view) {
        const sel = view.state.selection.main;
        const pos = sel.head;
        const line = view.state.doc.lineAt(pos);
        const col = pos - line.from + 1;
        const chars = sel.empty ? 0 : Math.abs(sel.to - sel.from);
        const lines = sel.empty
          ? 0
          : view.state.doc.lineAt(sel.to).number - view.state.doc.lineAt(sel.from).number + 1;
        useEditorCursorStore.getState().set(line.number, col, chars, lines);
      }
    }
  }, [isActive]);

  const onChange = useCallback(
    (value: string) => {
      _onChange(value);
      if (isMarkdownRef.current) {
        if (previewDebounceRef.current) clearTimeout(previewDebounceRef.current);
        previewDebounceRef.current = setTimeout(() => {
          startTransition(() => setPreviewContent(value));
        }, 150);
      }
    },
    [_onChange],
  );

  const { apiKeyRef, openaiCompatibleKeyRef } = useApiKeys();

  const themeExt = EDITOR_THEME_EXT[editorThemeId] ?? EDITOR_THEME_EXT.atomone;

  // Stabilize save + onSaved via refs so the extensions array never changes
  // identity — a new identity makes @uiw/react-codemirror reconfigure the
  // whole state, wiping the language compartment.
  const saveRef = useRef(save);
  saveRef.current = save;
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const pathRef = useRef(path);
  pathRef.current = path;

  useCompartmentEffect(
    cmRef,
    lineNumbersCompartment,
    editorLineNumbers ? lineNumbers() : [],
    editorLineNumbers,
  );
  useCompartmentEffect(cmRef, wrapCompartment, editorWordWrap ? EditorView.lineWrapping : [], editorWordWrap);
  useCompartmentEffect(cmRef, tabSizeCompartment, EditorState.tabSize.of(editorTabSize), editorTabSize);
  useCompartmentEffect(
    cmRef,
    bracketMatchingCompartment,
    editorBracketMatching ? bracketMatching() : [],
    editorBracketMatching,
  );
  useCompartmentEffect(
    cmRef,
    indentGuidesCompartment,
    editorIndentationGuides ? indentationGuides : [],
    editorIndentationGuides,
  );
  useCompartmentEffect(
    cmRef,
    fontFamilyCompartment,
    EditorView.theme({ ".cm-scroller": { fontFamily: editorFontFamily } }),
    editorFontFamily,
  );
  useCompartmentEffect(
    cmRef,
    lineHeightCompartment,
    EditorView.theme({ ".cm-scroller": { lineHeight: String(editorLineHeight) } }),
    editorLineHeight,
  );
  useCompartmentEffect(
    cmRef,
    indentWithTabsCompartment,
    indentUnit.of(editorIndentWithTabs ? "\t" : "  "),
    editorIndentWithTabs,
  );

  // Seed previewContent when doc first loads
  useEffect(() => {
    if (doc.status === "ready" && isMarkdownFile) {
      setPreviewContent(doc.content);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.status]);

  // Seed outline when doc first loads
  useEffect(() => {
    if (doc.status === "ready" && editorShowOutline) {
      const view = cmRef.current?.view;
      if (view) {
        const items = extractOutline(view);
        setOutline(items);
        if (isActive) {
          useEditorMetaStore.getState().setOutline(items);
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc.status]);

  const editorFormatOnSaveRef = useRef(editorFormatOnSave);
  editorFormatOnSaveRef.current = editorFormatOnSave;
  const editorTrimTrailingWhitespaceRef = useRef(editorTrimTrailingWhitespace);
  editorTrimTrailingWhitespaceRef.current = editorTrimTrailingWhitespace;
  const editorInsertFinalNewlineRef = useRef(editorInsertFinalNewline);
  editorInsertFinalNewlineRef.current = editorInsertFinalNewline;
  const editorShowOutlineRef = useRef(editorShowOutline);
  editorShowOutlineRef.current = editorShowOutline;

  /** Format the current buffer via Prettier and apply to the editor. Returns whether formatting ran. */
  const runFormat = useCallback(async (): Promise<boolean> => {
    const view = cmRef.current?.view;
    if (!view) return false;
    const content = view.state.doc.toString();
    const formatted = await formatDocument(content, pathRef.current);
    if (formatted === null || formatted === content) return false;
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: formatted },
    });
    return true;
  }, []);

  const performSaveRef = useRef<() => Promise<void>>(async () => {});
  const performSave = useCallback(async () => {
    if (editorFormatOnSaveRef.current) await runFormat();
    // Apply on-save transforms (trim whitespace, insert final newline)
    const view = cmRef.current?.view;
    if (view && (editorTrimTrailingWhitespaceRef.current || editorInsertFinalNewlineRef.current)) {
      const current = view.state.doc.toString();
      let processed = current;
      if (editorTrimTrailingWhitespaceRef.current) {
        processed = processed
          .split("\n")
          .map((l) => l.trimEnd())
          .join("\n");
      }
      if (editorInsertFinalNewlineRef.current && !processed.endsWith("\n")) {
        processed += "\n";
      }
      if (processed !== current) {
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: processed } });
      }
    }
    await saveRef.current();
    onSavedRef.current?.();
  }, [runFormat]);
  performSaveRef.current = performSave;

  useAutoSave({ performSaveRef, doc, dirty, editVersion, editorAutoSave, editorAutoSaveDelay, isUntitled });

  // Auto-save: onFocusChange — attach blur listener to CodeMirror's DOM.
  const handleBlur = useCallback(async () => {
    if (editorAutoSave !== "onFocusChange") return;
    if (isUntitled) return;
    await performSaveRef.current();
  }, [editorAutoSave, isUntitled]);

  const extensions = useMemo(
    () => {
      const prefs = usePreferencesStore.getState();
      return [
        // basicSetup is added before user extensions by @uiw/react-codemirror,
        // so we must elevate vim's precedence to win the keymap.
        vimCompartment.of(prefs.vimMode ? Prec.highest(vim()) : []),
        vimHandlersExtension(() => ({
          save: () => {
            void performSaveRef.current();
          },
          close: () => onCloseRef.current?.(),
        })),
        ...buildSharedExtensions(prefs.editorFontSize, prefs.editorFontFamily, prefs.editorLineHeight),
        lineNumbersCompartment.of(prefs.editorLineNumbers ? lineNumbers() : []),
        bracketMatchingCompartment.of(prefs.editorBracketMatching ? bracketMatching() : []),
        tabSizeCompartment.of(EditorState.tabSize.of(prefs.editorTabSize)),
        wrapCompartment.of(prefs.editorWordWrap ? EditorView.lineWrapping : []),
        indentGuidesCompartment.of(prefs.editorIndentationGuides ? indentationGuides : []),
        languageCompartment.of([]),
        inlineCompletion({
          getPrefs: () => {
            const s = usePreferencesStore.getState();
            return {
              enabled: s.autocompleteEnabled,
              provider: s.autocompleteProvider,
              modelId: s.autocompleteModelId,
              apiKey: apiKeyRef.current,
              lmstudioBaseURL: s.lmstudioBaseURL,
              openaiCompatibleBaseURL: s.openaiCompatibleBaseURL,
              openaiCompatibleApiKey: openaiCompatibleKeyRef.current,
              debounceMs: s.editorAutocompleteDebounceMs,
            };
          },
          getPath: () => pathRef.current,
          getLanguage: () => languageRef.current,
        }),
        // Update cursor/selection store and outline on every editor change
        EditorView.updateListener.of((update) => {
          if (!isActiveRef.current) return;
          const sel = update.state.selection.main;
          const pos = sel.head;
          const line = update.state.doc.lineAt(pos);
          const col = pos - line.from + 1;
          const chars = sel.empty ? 0 : Math.abs(sel.to - sel.from);
          const lines = sel.empty
            ? 0
            : update.state.doc.lineAt(sel.to).number - update.state.doc.lineAt(sel.from).number + 1;
          useEditorCursorStore.getState().set(line.number, col, chars, lines);

          if (update.docChanged && editorShowOutlineRef.current) {
            if (outlineDebounceRef.current) clearTimeout(outlineDebounceRef.current);
            outlineDebounceRef.current = setTimeout(() => {
              const items = extractOutline(update.view);
              setOutline(items);
              if (isActiveRef.current) {
                useEditorMetaStore.getState().setOutline(items);
              }
            }, 250);
          }
        }),
        keymap.of([
          {
            key: "Mod-s",
            preventDefault: true,
            run: () => {
              void performSaveRef.current();
              return true;
            },
          },
          {
            key: "Mod-Shift-f",
            preventDefault: true,
            run: () => {
              void runFormat();
              return true;
            },
          },
          {
            key: "Mod-f",
            preventDefault: true,
            run: () => {
              setFindOpen(true);
              setShowReplaceInFind(false);
              return true;
            },
          },
          {
            key: "Mod-Alt-f",
            preventDefault: true,
            run: () => {
              setFindOpen(true);
              setShowReplaceInFind(true);
              return true;
            },
          },
          { key: "Mod-g", run: gotoLine, preventDefault: true },
          { key: "Mod-[", run: foldCode, preventDefault: true },
          { key: "Mod-]", run: unfoldCode, preventDefault: true },
          { key: "Mod-Shift-[", run: foldAll, preventDefault: true },
          { key: "Mod-Shift-]", run: unfoldAll, preventDefault: true },
          { key: "Mod-/", run: toggleComment, preventDefault: true },
        ]),
      ];
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [runFormat],
  );

  useEffect(() => {
    const view = cmRef.current?.view;
    if (!view) return;
    view.dispatch({
      effects: vimCompartment.reconfigure(vimMode ? Prec.highest(vim()) : []),
    });
  }, [vimMode]);

  // Reconfigure font size compartment when editorFontSize pref changes.
  useEffect(() => {
    return usePreferencesStore.subscribe((state, prev) => {
      if (state.editorFontSize === prev.editorFontSize) return;
      const view = cmRef.current?.view;
      if (!view) return;
      view.dispatch({
        effects: fontSizeCompartment.reconfigure(
          EditorView.theme({ ".cm-scroller": { fontSize: `${state.editorFontSize}px` } }),
        ),
      });
    });
  }, []);

  // Reconfigure font family compartment when editorFontFamily pref changes.
  useEffect(() => {
    return usePreferencesStore.subscribe((state, prev) => {
      if (state.editorFontFamily === prev.editorFontFamily) return;
      const view = cmRef.current?.view;
      if (!view) return;
      view.dispatch({
        effects: fontFamilyCompartment.reconfigure(
          EditorView.theme({ ".cm-scroller": { fontFamily: state.editorFontFamily } }),
        ),
      });
    });
  }, []);

  // Reconfigure line height compartment when editorLineHeight pref changes.
  useEffect(() => {
    return usePreferencesStore.subscribe((state, prev) => {
      if (state.editorLineHeight === prev.editorLineHeight) return;
      const view = cmRef.current?.view;
      if (!view) return;
      view.dispatch({
        effects: lineHeightCompartment.reconfigure(
          EditorView.theme({ ".cm-scroller": { lineHeight: String(state.editorLineHeight) } }),
        ),
      });
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    const extStr = path.split(".").pop()?.toLowerCase() ?? null;
    languageRef.current = languageOverride ?? extStr;
    languageOverrideRef.current = null;
    setDetectedLanguage(extStr ?? null);
    const langSource = languageOverride ? `file.${languageOverride}` : path;
    resolveLanguage(langSource).then((ext) => {
      if (cancelled) return;
      const view = cmRef.current?.view;
      if (!view) return;
      view.dispatch({
        effects: languageCompartment.reconfigure(ext ?? []),
      });
      // Wait one frame so Lezer can reparse with the new language before
      // we extract the outline (ensureSyntaxTree inside handles the rest).
      if (editorShowOutlineRef.current) {
        requestAnimationFrame(() => {
          if (cancelled) return;
          const v = cmRef.current?.view;
          if (v) setOutline(extractOutline(v));
        });
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, doc.status, languageOverride]);

  useImperativeHandle(
    ref,
    () => ({
      setQuery: (q: string) => {
        const view = cmRef.current?.view;
        if (!view) return;
        view.dispatch({
          effects: setSearchQuery.of(new SearchQuery({ search: q, caseSensitive: false })),
        });
        if (q) findNext(view);
      },
      findNext: () => {
        const view = cmRef.current?.view;
        if (view) findNext(view);
      },
      findPrevious: () => {
        const view = cmRef.current?.view;
        if (view) findPrevious(view);
      },
      clearQuery: () => {
        const view = cmRef.current?.view;
        if (!view) return;
        view.dispatch({
          effects: setSearchQuery.of(new SearchQuery({ search: "" })),
        });
      },
      getSelection: () => {
        const view = cmRef.current?.view;
        if (!view) return null;
        const { from, to } = view.state.selection.main;
        if (from === to) return null;
        return view.state.sliceDoc(from, to);
      },
      getPath: () => path,
      reload: () => reloadRef.current(),
      save: () => performSaveRef.current(),
      focus: () => {
        const view = cmRef.current?.view;
        if (view) view.focus();
      },
      openFind: () => {
        setFindOpen(true);
        setShowReplaceInFind(false);
      },
      closeFind: () => setFindOpen(false),
      jumpToPosition: (pos: number) => {
        const view = cmRef.current?.view;
        if (!view) return;
        view.dispatch({ selection: { anchor: pos }, scrollIntoView: true });
        view.focus();
      },
      format: () => {
        void runFormat();
      },
    }),
    [path, runFormat],
  );

  const handleJump = useCallback((pos: number) => {
    const view = cmRef.current?.view;
    if (!view) return;
    view.dispatch({ selection: { anchor: pos }, scrollIntoView: true });
    view.focus();
  }, []);

  const handleOutlineToggle = useCallback((v: boolean) => {
    if (v) {
      requestAnimationFrame(() => {
        const view = cmRef.current?.view;
        if (view) setOutline(extractOutline(view));
      });
    }
  }, []);

  if (doc.status === "loading") {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">Loading…</div>
    );
  }
  if (doc.status === "error") {
    return (
      <div className="flex h-full items-center justify-center px-6 text-center text-xs text-destructive">
        {doc.message}
      </div>
    );
  }
  if (doc.status === "binary") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1 px-6 text-center">
        <div className="text-sm text-foreground">Binary file</div>
        <div className="text-xs text-muted-foreground">{formatBytes(doc.size)} · preview not supported</div>
      </div>
    );
  }
  if (doc.status === "toolarge") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1 px-6 text-center">
        <div className="text-sm text-foreground">File too large</div>
        <div className="text-xs text-muted-foreground">
          {formatBytes(doc.size)} exceeds the {formatBytes(doc.limit)} limit.
        </div>
      </div>
    );
  }

  const codeMirrorEl = (
    <CodeMirror
      ref={cmRef}
      value={doc.content}
      onChange={onChange}
      theme={themeExt}
      extensions={extensions}
      height="100%"
      className="flex-1 min-h-0 overflow-hidden h-full"
      basicSetup={{
        lineNumbers: false,
        highlightActiveLineGutter: true,
        foldGutter: true,
        bracketMatching: false,
        closeBrackets: true,
        autocompletion: true,
        highlightActiveLine: true,
        highlightSelectionMatches: true,
        searchKeymap: true,
      }}
    />
  );

  const showOutlinePanel = editorShowOutline && outline.length > 0;

  // Always render ResizablePanelGroup with a stable id so CodeMirror never
  // unmounts when the outline panel is toggled (avoids losing syntax highlighting).
  const editorWithOutline = (
    <ResizablePanelGroup orientation="horizontal" className="flex-1 min-h-0">
      <ResizablePanel id="editor-cm" defaultSize={showOutlinePanel ? 78 : 100} minSize={40}>
        <div className="h-full flex flex-col">{codeMirrorEl}</div>
      </ResizablePanel>
      {showOutlinePanel && (
        <>
          <ResizableHandle withHandle />
          <ResizablePanel id="editor-outline" defaultSize={22} minSize={15} maxSize={40}>
            <OutlinePanel items={outline} onJump={handleJump} />
          </ResizablePanel>
        </>
      )}
    </ResizablePanelGroup>
  );

  return (
    <div className="flex h-full min-h-0 flex-col" onBlur={handleBlur}>
      <EditorToolbar
        fileName={fileName}
        dirty={dirty}
        isMarkdownFile={isMarkdownFile}
        markdownPreviewOpen={markdownPreviewOpen}
        languageOverride={languageOverride}
        onMarkdownPreviewToggle={setMarkdownPreviewOpen}
        onOutlineToggle={handleOutlineToggle}
        detectedLanguage={detectedLanguage}
        onLanguageChange={onLanguageChange ?? (() => {})}
      />
      <FindWidget
        isOpen={findOpen}
        onClose={() => setFindOpen(false)}
        editorView={cmRef.current?.view ?? null}
        showReplace={showReplaceInFind}
      />
      {isMarkdownFile && markdownPreviewOpen ? (
        <ResizablePanelGroup orientation="horizontal" className="flex-1 min-h-0">
          <ResizablePanel defaultSize={50} minSize={20}>
            <div className="h-full flex flex-col">{codeMirrorEl}</div>
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={50} minSize={20}>
            <div className="h-full overflow-y-auto bg-card p-4 text-[13px] leading-relaxed text-foreground [&_h1]:text-lg [&_h1]:font-bold [&_h1]:mb-3 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:mb-2 [&_h3]:font-semibold [&_h3]:mb-2 [&_p]:mb-3 [&_a]:text-info [&_a]:underline [&_code]:bg-muted/50 [&_code]:px-1 [&_code]:rounded [&_pre]:bg-muted/50 [&_pre]:p-3 [&_pre]:rounded [&_pre]:overflow-x-auto [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:mb-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:mb-1 [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground">
              <Streamdown>{previewContent}</Streamdown>
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      ) : (
        editorWithOutline
      )}
    </div>
  );
});
