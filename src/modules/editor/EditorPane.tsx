import {
  findNext,
  findPrevious,
  SearchQuery,
  setSearchQuery,
} from "@codemirror/search";
import { FindWidget } from "@/modules/search";
import { bracketMatching } from "@codemirror/language";
import { lineNumbers } from "@codemirror/view";
import { keymap, EditorView } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { usePreferencesStore } from "@/modules/settings/preferences";
import {
  setEditorBracketMatching,
  setEditorFormatOnSave,
  setEditorIndentationGuides,
  setEditorLineNumbers,
  setEditorShowOutline,
  setEditorShowSelectionStats,
  setEditorWordWrap,
} from "@/modules/settings/store";
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
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Settings01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { Streamdown } from "streamdown";
import { Prec } from "@codemirror/state";
import { vim } from "@replit/codemirror-vim";
import {
  bracketMatchingCompartment,
  buildSharedExtensions,
  fontSizeCompartment,
  indentGuidesCompartment,
  languageCompartment,
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
import { getKey } from "@/modules/ai/lib/keyring";
import { onKeysChanged } from "@/modules/settings/store";
import { useEditorCursorStore } from "./lib/cursorStore";
import { extractOutline, type OutlineItem } from "./lib/outline";
import { OutlinePanel } from "./OutlinePanel";
import { formatDocument } from "./lib/formatter";

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
  openFind: () => void;
  closeFind: () => void;
};

type Props = {
  path: string;
  isUntitled?: boolean;
  isActive?: boolean;
  onDirtyChange?: (dirty: boolean) => void;
  onSaved?: () => void;
  onSaveAs?: (newPath: string) => void;
  onClose?: () => void;
};

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export const EditorPane = forwardRef<EditorPaneHandle, Props>(
  function EditorPane({ path, isUntitled, isActive = false, onDirtyChange, onSaved, onSaveAs, onClose }, ref) {
    const { doc, dirty, onChange: _onChange, save, reload } = useDocument({ path, isUntitled, onDirtyChange, onSaveAs });
    const isMarkdownRef = useRef(false);
    const reloadRef = useRef(reload);
    reloadRef.current = reload;
    const cmRef = useRef<ReactCodeMirrorRef>(null);
    const editorThemeId = usePreferencesStore((s) => s.editorTheme);
    const vimMode = usePreferencesStore((s) => s.vimMode);
    const editorAutoSave = usePreferencesStore((s) => s.editorAutoSave);
    const editorLineNumbers = usePreferencesStore((s) => s.editorLineNumbers);
    const editorWordWrap = usePreferencesStore((s) => s.editorWordWrap);
    const editorTabSize = usePreferencesStore((s) => s.editorTabSize);
    const editorBracketMatching = usePreferencesStore((s) => s.editorBracketMatching);
    const editorShowSelectionStats = usePreferencesStore((s) => s.editorShowSelectionStats);
    const editorShowOutline = usePreferencesStore((s) => s.editorShowOutline);
    const editorFormatOnSave = usePreferencesStore((s) => s.editorFormatOnSave);
    const editorIndentationGuides = usePreferencesStore((s) => s.editorIndentationGuides);
    const languageRef = useRef<string | null>(null);

    const fileName = path.split("/").pop() ?? (isUntitled ? "Untitled" : path);
    const ext = fileName.toLowerCase().split(".").pop() ?? "";
    const isMarkdownFile = ext === "md" || ext === "markdown";
    isMarkdownRef.current = isMarkdownFile;
    const [markdownPreviewOpen, setMarkdownPreviewOpen] = useState(false);
    const [previewContent, setPreviewContent] = useState("");
    const [findOpen, setFindOpen] = useState(false);
    const [outline, setOutline] = useState<OutlineItem[]>([]);
    const previewDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const outlineDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

    const onChange = useCallback((value: string) => {
      _onChange(value);
      if (isMarkdownRef.current) {
        if (previewDebounceRef.current) clearTimeout(previewDebounceRef.current);
        previewDebounceRef.current = setTimeout(() => {
          startTransition(() => setPreviewContent(value));
        }, 150);
      }
    }, [_onChange]);
    const apiKeyRef = useRef<string | null>(null);

    useEffect(() => {
      let cancelled = false;
      const refresh = async () => {
        const provider = usePreferencesStore.getState().autocompleteProvider;
        if (provider === "lmstudio") {
          apiKeyRef.current = null;
          return;
        }
        const k = await getKey(provider);
        if (!cancelled) apiKeyRef.current = k;
      };
      void refresh();
      let unlistenKeys: (() => void) | undefined;
      void onKeysChanged(() => void refresh()).then((un) => {
        unlistenKeys = un;
      });
      const unsubPrefs = usePreferencesStore.subscribe((state, prev) => {
        if (state.autocompleteProvider !== prev.autocompleteProvider) {
          void refresh();
        }
      });
      return () => {
        cancelled = true;
        unlistenKeys?.();
        unsubPrefs();
      };
    }, []);
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

    // Reconfigure line numbers compartment when pref changes.
    useEffect(() => {
      const view = cmRef.current?.view;
      if (!view) return;
      view.dispatch({
        effects: lineNumbersCompartment.reconfigure(
          editorLineNumbers ? lineNumbers() : [],
        ),
      });
    }, [editorLineNumbers]);

    // Reconfigure word wrap compartment when pref changes.
    useEffect(() => {
      const view = cmRef.current?.view;
      if (!view) return;
      view.dispatch({
        effects: wrapCompartment.reconfigure(
          editorWordWrap ? EditorView.lineWrapping : [],
        ),
      });
    }, [editorWordWrap]);

    // Reconfigure tab size compartment when pref changes.
    useEffect(() => {
      const view = cmRef.current?.view;
      if (!view) return;
      view.dispatch({
        effects: tabSizeCompartment.reconfigure(
          EditorState.tabSize.of(editorTabSize),
        ),
      });
    }, [editorTabSize]);

    // Reconfigure bracket matching compartment when pref changes.
    useEffect(() => {
      const view = cmRef.current?.view;
      if (!view) return;
      view.dispatch({
        effects: bracketMatchingCompartment.reconfigure(
          editorBracketMatching ? bracketMatching() : [],
        ),
      });
    }, [editorBracketMatching]);

    // Reconfigure indentation guides compartment when pref changes.
    useEffect(() => {
      const view = cmRef.current?.view;
      if (!view) return;
      view.dispatch({
        effects: indentGuidesCompartment.reconfigure(
          editorIndentationGuides ? indentationGuides : [],
        ),
      });
    }, [editorIndentationGuides]);

    // Auto-save: afterDelay — debounced 5 s after doc changes.
    const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const docContentRef = useRef(doc.status === "ready" ? doc.content : "");
    if (doc.status === "ready") docContentRef.current = doc.content;

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
        if (view) setOutline(extractOutline(view));
      }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [doc.status]);

    const editorFormatOnSaveRef = useRef(editorFormatOnSave);
    editorFormatOnSaveRef.current = editorFormatOnSave;

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

    useEffect(() => {
      if (editorAutoSave !== "afterDelay") return;
      if (doc.status !== "ready") return;
      if (isUntitled) return;
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = setTimeout(async () => {
        autoSaveTimerRef.current = null;
        if (editorFormatOnSaveRef.current) await runFormat();
        await saveRef.current();
        onSavedRef.current?.();
      }, 5000);
      return () => {
        if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
      };
    }, [editorAutoSave, doc, isUntitled, runFormat]);

    // Auto-save: onFocusChange — attach blur listener to CodeMirror's DOM.
    const handleBlur = useCallback(async () => {
      if (editorAutoSave !== "onFocusChange") return;
      if (isUntitled) return;
      if (editorFormatOnSaveRef.current) await runFormat();
      await saveRef.current();
      onSavedRef.current?.();
    }, [editorAutoSave, isUntitled, runFormat]);

    const extensions = useMemo(
      () => {
        const prefs = usePreferencesStore.getState();
        return [
          // basicSetup is added before user extensions by @uiw/react-codemirror,
          // so we must elevate vim's precedence to win the keymap.
          vimCompartment.of(
            prefs.vimMode ? Prec.highest(vim()) : [],
          ),
          vimHandlersExtension(() => ({
            save: () => {
              void (async () => {
                if (editorFormatOnSaveRef.current) await runFormat();
                await saveRef.current();
                onSavedRef.current?.();
              })();
            },
            close: () => onCloseRef.current?.(),
          })),
          ...buildSharedExtensions(prefs.editorFontSize),
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
              : update.state.doc.lineAt(sel.to).number -
                update.state.doc.lineAt(sel.from).number + 1;
            useEditorCursorStore.getState().set(line.number, col, chars, lines);

            if (update.docChanged) {
              if (outlineDebounceRef.current) clearTimeout(outlineDebounceRef.current);
              outlineDebounceRef.current = setTimeout(() => {
                setOutline(extractOutline(update.view));
              }, 250);
            }
          }),
          keymap.of([
            {
              key: "Mod-s",
              preventDefault: true,
              run: () => {
                void (async () => {
                  if (editorFormatOnSaveRef.current) await runFormat();
                  await saveRef.current();
                  onSavedRef.current?.();
                })();
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
        effects: vimCompartment.reconfigure(
          vimMode ? Prec.highest(vim()) : [],
        ),
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

    useEffect(() => {
      let cancelled = false;
      const extStr = path.split(".").pop()?.toLowerCase() ?? null;
      languageRef.current = extStr;
      resolveLanguage(path).then((ext) => {
        if (cancelled) return;
        const view = cmRef.current?.view;
        if (!view) return;
        view.dispatch({
          effects: languageCompartment.reconfigure(ext ?? []),
        });
        // Re-extract outline after language is resolved
        if (editorShowOutline) {
          setOutline(extractOutline(view));
        }
      });
      return () => {
        cancelled = true;
      };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [path, doc.status]);

    const selectionChars = useEditorCursorStore((s) => s.selectionChars);
    const selectionLines = useEditorCursorStore((s) => s.selectionLines);

    useImperativeHandle(
      ref,
      () => ({
        setQuery: (q: string) => {
          const view = cmRef.current?.view;
          if (!view) return;
          view.dispatch({
            effects: setSearchQuery.of(
              new SearchQuery({ search: q, caseSensitive: false }),
            ),
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
        save: async () => {
          if (editorFormatOnSaveRef.current) await runFormat();
          await saveRef.current();
          onSavedRef.current?.();
        },
        openFind: () => setFindOpen(true),
        closeFind: () => setFindOpen(false),
      }),
      [path, runFormat],
    );

    if (doc.status === "loading") {
      return (
        <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
          Loading…
        </div>
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
          <div className="text-xs text-muted-foreground">
            {formatBytes(doc.size)} · preview not supported
          </div>
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


    const toolbar = (
      <div className="h-8 bg-card border-b border-border px-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="truncate text-xs text-foreground/80 font-medium">{fileName}</span>
          {dirty && (
            <span className="size-2 rounded-full bg-foreground/60 animate-pulse shrink-0" title="Unsaved changes" />
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {editorShowSelectionStats && selectionChars > 0 && (
            <span className="text-[10px] text-muted-foreground/60 tabular-nums">
              {selectionChars} chars · {selectionLines} lines
            </span>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-6 shrink-0 text-muted-foreground hover:text-foreground"
              >
                <HugeiconsIcon icon={Settings01Icon} size={13} strokeWidth={1.75} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-44">
              <DropdownMenuCheckboxItem
                checked={editorWordWrap}
                onCheckedChange={(v) => void setEditorWordWrap(v)}
              >
                Word Wrap
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={editorLineNumbers}
                onCheckedChange={(v) => void setEditorLineNumbers(v)}
              >
                Line Numbers
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={editorBracketMatching}
                onCheckedChange={(v) => void setEditorBracketMatching(v)}
              >
                Bracket Matching
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={editorShowSelectionStats}
                onCheckedChange={(v) => void setEditorShowSelectionStats(v)}
              >
                Selection Stats
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={editorIndentationGuides}
                onCheckedChange={(v) => void setEditorIndentationGuides(v)}
              >
                Indentation Guides
              </DropdownMenuCheckboxItem>
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem
                checked={editorShowOutline}
                onCheckedChange={(v) => {
                  void setEditorShowOutline(v);
                  if (v) {
                    const view = cmRef.current?.view;
                    if (view) setOutline(extractOutline(view));
                  }
                }}
              >
                Outline
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                checked={editorFormatOnSave}
                onCheckedChange={(v) => void setEditorFormatOnSave(v)}
              >
                Format on Save
              </DropdownMenuCheckboxItem>
              {isMarkdownFile && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuCheckboxItem
                    checked={markdownPreviewOpen}
                    onCheckedChange={setMarkdownPreviewOpen}
                  >
                    Markdown Preview
                  </DropdownMenuCheckboxItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    );

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

    const handleJump = useCallback((pos: number) => {
      const view = cmRef.current?.view;
      if (!view) return;
      view.dispatch({ selection: { anchor: pos }, scrollIntoView: true });
      view.focus();
    }, []);

    // Determine if outline panel should be shown alongside the editor
    const showOutlinePanel = editorShowOutline && outline.length >= 0;

    // Build the editor area (possibly wrapped with outline)
    const editorWithOutline = showOutlinePanel ? (
      <ResizablePanelGroup orientation="horizontal" className="flex-1 min-h-0">
        <ResizablePanel defaultSize={78} minSize={40}>
          <div className="h-full flex flex-col">{codeMirrorEl}</div>
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={22} minSize={15} maxSize={40}>
          <OutlinePanel items={outline} onJump={handleJump} />
        </ResizablePanel>
      </ResizablePanelGroup>
    ) : (
      <div className="flex-1 min-h-0 flex flex-col">{codeMirrorEl}</div>
    );

    return (
      <div className="flex h-full min-h-0 flex-col" onBlur={handleBlur}>
        {toolbar}
        <FindWidget
          isOpen={findOpen}
          onClose={() => setFindOpen(false)}
          editorView={cmRef.current?.view ?? null}
          showReplace={true}
        />
        {isMarkdownFile && markdownPreviewOpen ? (
          <ResizablePanelGroup orientation="horizontal" className="flex-1 min-h-0">
            <ResizablePanel defaultSize={50} minSize={20}>
              <div className="h-full flex flex-col">{codeMirrorEl}</div>
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={50} minSize={20}>
              <div className="h-full overflow-y-auto bg-card p-4 text-[13px] leading-relaxed text-foreground [&_h1]:text-lg [&_h1]:font-bold [&_h1]:mb-3 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:mb-2 [&_h3]:font-semibold [&_h3]:mb-2 [&_p]:mb-3 [&_a]:text-blue-500 [&_a]:underline [&_code]:bg-muted/50 [&_code]:px-1 [&_code]:rounded [&_pre]:bg-muted/50 [&_pre]:p-3 [&_pre]:rounded [&_pre]:overflow-x-auto [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:mb-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:mb-1 [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground">
                <Streamdown>{previewContent}</Streamdown>
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        ) : (
          editorWithOutline
        )}
      </div>
    );
  },
);
