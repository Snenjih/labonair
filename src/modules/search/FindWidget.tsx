import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Toggle } from "@/components/ui/toggle";
import {
  findNext,
  findPrevious,
  replaceAll,
  replaceNext,
  SearchQuery,
  setSearchQuery,
} from "@codemirror/search";
import type { EditorView } from "@codemirror/view";
import {
  ArrowDown01Icon,
  ArrowUp01Icon,
  Cancel01Icon,
  ReplaceIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { SearchAddon } from "@xterm/addon-search";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";

function getTermDecorations() {
  const style = getComputedStyle(document.documentElement);
  const muted = style.getPropertyValue("--muted-foreground").trim() || "#515c6a";
  const primary = style.getPropertyValue("--primary").trim() || "#d18616";
  return {
    matchBackground: muted,
    activeMatchBackground: primary,
    matchOverviewRuler: primary,
    activeMatchColorOverviewRuler: primary,
  };
}

const MAX_MATCH_COUNT = 999;

type Props = {
  isOpen: boolean;
  onClose: () => void;
  searchAddon?: SearchAddon;
  editorView?: EditorView | null;
  showReplace?: boolean;
};

export function FindWidget({ isOpen, onClose, searchAddon, editorView, showReplace }: Props) {
    const [query, setQuery] = useState("");
    const [replaceText, setReplaceText] = useState("");
    const [caseSensitive, setCaseSensitive] = useState(false);
    const [wholeWord, setWholeWord] = useState(false);
    const [useRegex, setUseRegex] = useState(false);
    const [replaceOpen, setReplaceOpen] = useState(false);
    // matchIndex for editor is approximate (CM6 has no built-in match-index event).
    // It increments/decrements with goNext/goPrev but can desync on direct clicks.
    const [matchIndex, setMatchIndex] = useState(0);
    const [matchCount, setMatchCount] = useState(0);
    const [matchCountCapped, setMatchCountCapped] = useState(false);
    const [regexError, setRegexError] = useState(false);

    const inputRef = useRef<HTMLInputElement>(null);
    const replaceRef = useRef<HTMLInputElement>(null);

    // Focus input when widget opens
    useEffect(() => {
      if (isOpen) requestAnimationFrame(() => inputRef.current?.focus());
    }, [isOpen]);

    // ── Terminal search ───────────────────────────────────────────────────────

    useEffect(() => {
      if (!searchAddon) return;
      const disp = searchAddon.onDidChangeResults((r) => {
        if (r) {
          setMatchIndex(r.resultIndex + 1);
          setMatchCount(r.resultCount);
        } else {
          setMatchIndex(0);
          setMatchCount(0);
        }
      });
      return () => disp.dispose();
    }, [searchAddon]);

    const applyTerminalSearch = useCallback(
      (q: string, cs: boolean, ww: boolean, rx: boolean) => {
        if (!searchAddon) return;
        if (!q) {
          searchAddon.clearDecorations();
          setMatchIndex(0);
          setMatchCount(0);
          return;
        }
        if (rx) {
          try {
            new RegExp(q);
            setRegexError(false);
          } catch {
            setRegexError(true);
            return;
          }
        } else {
          setRegexError(false);
        }
        searchAddon.findNext(q, {
          caseSensitive: cs,
          wholeWord: ww,
          regex: rx,
          incremental: true,
          decorations: getTermDecorations(),
        });
      },
      [searchAddon],
    );

    // ── Editor search ─────────────────────────────────────────────────────────

    const applyEditorSearch = useCallback(
      (q: string, cs: boolean, ww: boolean, rx: boolean, replace = replaceText) => {
        const view = editorView;
        if (!view) return;
        if (rx) {
          try {
            new RegExp(q);
            setRegexError(false);
          } catch {
            setRegexError(true);
            view.dispatch({ effects: setSearchQuery.of(new SearchQuery({ search: "" })) });
            setMatchIndex(0);
            setMatchCount(0);
            return;
          }
        } else {
          setRegexError(false);
        }
        view.dispatch({
          effects: setSearchQuery.of(
            new SearchQuery({ search: q, caseSensitive: cs, wholeWord: ww, regexp: rx, replace }),
          ),
        });
        if (q) {
          findNext(view);
          setMatchIndex(1); // approximate — CM6 doesn't expose current match index
          try {
            const sq = new SearchQuery({ search: q, caseSensitive: cs, wholeWord: ww, regexp: rx });
            const cursor = sq.getCursor(view.state.doc);
            let count = 0;
            while (cursor.next() && count < MAX_MATCH_COUNT) count++;
            setMatchCount(count);
            setMatchCountCapped(count >= MAX_MATCH_COUNT);
          } catch {
            setMatchCount(0);
            setMatchCountCapped(false);
          }
        } else {
          setMatchIndex(0);
          setMatchCount(0);
          setMatchCountCapped(false);
        }
      },
      [editorView, replaceText],
    );

    // ── Shared search trigger ─────────────────────────────────────────────────

    const runSearch = useCallback(
      (q: string, cs: boolean, ww: boolean, rx: boolean) => {
        if (searchAddon) applyTerminalSearch(q, cs, ww, rx);
        else applyEditorSearch(q, cs, ww, rx);
      },
      [searchAddon, applyTerminalSearch, applyEditorSearch],
    );

    const handleQueryChange = (next: string) => {
      setQuery(next);
      runSearch(next, caseSensitive, wholeWord, useRegex);
    };

    const handleToggle = (
      setter: (v: boolean) => void,
      nextVal: boolean,
      field: "cs" | "ww" | "rx",
    ) => {
      setter(nextVal);
      const cs = field === "cs" ? nextVal : caseSensitive;
      const ww = field === "ww" ? nextVal : wholeWord;
      const rx = field === "rx" ? nextVal : useRegex;
      runSearch(query, cs, ww, rx);
    };

    const goNext = useCallback(() => {
      if (!query) return;
      if (searchAddon) {
        searchAddon.findNext(query, {
          caseSensitive,
          wholeWord,
          regex: useRegex,
          decorations: getTermDecorations(),
        });
      } else if (editorView) {
        findNext(editorView);
        setMatchIndex((i) => (matchCount > 0 ? (i % matchCount) + 1 : 0));
      }
    }, [query, searchAddon, editorView, caseSensitive, wholeWord, useRegex, matchCount]);

    const goPrev = useCallback(() => {
      if (!query) return;
      if (searchAddon) {
        searchAddon.findPrevious(query, {
          caseSensitive,
          wholeWord,
          regex: useRegex,
          decorations: getTermDecorations(),
        });
      } else if (editorView) {
        findPrevious(editorView);
        setMatchIndex((i) => (matchCount > 0 ? ((i - 2 + matchCount) % matchCount) + 1 : 0));
      }
    }, [query, searchAddon, editorView, caseSensitive, wholeWord, useRegex, matchCount]);

    const handleClose = useCallback(() => {
      if (searchAddon) searchAddon.clearDecorations();
      else if (editorView) {
        editorView.dispatch({ effects: setSearchQuery.of(new SearchQuery({ search: "" })) });
      }
      setQuery("");
      setReplaceText("");
      setRegexError(false);
      setMatchIndex(0);
      setMatchCount(0);
      setReplaceOpen(false);
      onClose();
    }, [searchAddon, editorView, onClose]);

    const handleReplace = () => {
      if (!editorView || !query) return;
      editorView.dispatch({
        effects: setSearchQuery.of(
          new SearchQuery({
            search: query,
            replace: replaceText,
            caseSensitive,
            wholeWord,
            regexp: useRegex,
          }),
        ),
      });
      replaceNext(editorView);
    };

    const handleReplaceAll = () => {
      if (!editorView || !query) return;
      editorView.dispatch({
        effects: setSearchQuery.of(
          new SearchQuery({
            search: query,
            replace: replaceText,
            caseSensitive,
            wholeWord,
            regexp: useRegex,
          }),
        ),
      });
      replaceAll(editorView);
      setMatchIndex(0);
      setMatchCount(0);
    };

    const counterText =
      matchCount === 0
        ? query
          ? "0/0"
          : ""
        : matchCountCapped
          ? `${matchIndex}/999+`
          : `${matchIndex}/${matchCount}`;

    return (
      <AnimatePresence>
        {isOpen && (
          <motion.div
            key="find-widget"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 36 }}
            className="overflow-hidden"
          >
            <div className="border-b border-border bg-card px-2 py-1">
              {/* ── Search row ── */}
              <div className="flex items-center gap-1">
                {/* Search input */}
                <div className="relative flex min-w-0 flex-1 items-center">
                  <Input
                    ref={inputRef}
                    value={query}
                    placeholder="Find"
                    className={`h-7 w-full bg-muted/60 pr-6 pl-2.5 text-xs placeholder:text-muted-foreground/60 focus-visible:ring-0 ${
                      regexError ? "border-destructive/60 text-destructive" : ""
                    }`}
                    onChange={(e) => handleQueryChange(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        e.shiftKey ? goPrev() : goNext();
                      } else if (e.key === "Escape") {
                        e.preventDefault();
                        handleClose();
                      } else if (e.key === "Tab" && replaceOpen && showReplace) {
                        e.preventDefault();
                        replaceRef.current?.focus();
                      }
                    }}
                  />
                  {query && (
                    <button
                      type="button"
                      onClick={() => {
                        setQuery("");
                        runSearch("", caseSensitive, wholeWord, useRegex);
                        inputRef.current?.focus();
                      }}
                      className="absolute right-1 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
                      aria-label="Clear"
                    >
                      <HugeiconsIcon icon={Cancel01Icon} size={10} strokeWidth={2} />
                    </button>
                  )}
                </div>

                {/* Option toggles */}
                <div className="flex items-center gap-0.5">
                  <Toggle
                    size="sm"
                    pressed={caseSensitive}
                    onPressedChange={(v) => handleToggle(setCaseSensitive, v, "cs")}
                    className="h-7 w-7 px-0 text-[11px] font-semibold"
                    title="Match case"
                    aria-label="Match case"
                  >
                    Aa
                  </Toggle>
                  <Toggle
                    size="sm"
                    pressed={wholeWord}
                    onPressedChange={(v) => handleToggle(setWholeWord, v, "ww")}
                    className="h-7 w-7 px-0 text-[10px] font-semibold"
                    title="Match whole word"
                    aria-label="Match whole word"
                  >
                    wd
                  </Toggle>
                  <Toggle
                    size="sm"
                    pressed={useRegex}
                    onPressedChange={(v) => handleToggle(setUseRegex, v, "rx")}
                    className="h-7 w-7 px-0 text-[11px] font-mono"
                    title="Use regular expression"
                    aria-label="Use regular expression"
                  >
                    .*
                  </Toggle>
                </div>

                {/* Replace toggle (editor only) */}
                {showReplace && (
                  <Toggle
                    size="sm"
                    pressed={replaceOpen}
                    onPressedChange={setReplaceOpen}
                    className="h-7 w-7 px-0 text-muted-foreground"
                    title="Toggle replace"
                    aria-label="Toggle replace"
                  >
                    <HugeiconsIcon icon={ReplaceIcon} size={13} strokeWidth={1.75} />
                  </Toggle>
                )}

                <div className="mx-1 h-4 w-px shrink-0 bg-border/60" />

                {/* Prev / Next */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground disabled:opacity-40"
                  onClick={goPrev}
                  disabled={!query}
                  title="Previous match (Shift+Enter)"
                  aria-label="Previous match"
                >
                  <HugeiconsIcon icon={ArrowUp01Icon} size={13} strokeWidth={2} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground disabled:opacity-40"
                  onClick={goNext}
                  disabled={!query}
                  title="Next match (Enter)"
                  aria-label="Next match"
                >
                  <HugeiconsIcon icon={ArrowDown01Icon} size={13} strokeWidth={2} />
                </Button>

                {/* Counter */}
                <span className="w-10 shrink-0 text-center text-[11px] text-muted-foreground tabular-nums">
                  {counterText}
                </span>

                {/* Close */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
                  onClick={handleClose}
                  title="Close (Escape)"
                  aria-label="Close find"
                >
                  <HugeiconsIcon icon={Cancel01Icon} size={13} strokeWidth={2} />
                </Button>
              </div>

              {/* ── Replace row (editor only) ── */}
              <AnimatePresence>
                {showReplace && replaceOpen && (
                  <motion.div
                    key="replace-row"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ type: "spring", stiffness: 420, damping: 38 }}
                    className="overflow-hidden"
                  >
                    <div className="flex items-center gap-1 pt-1">
                      <Input
                        ref={replaceRef}
                        value={replaceText}
                        placeholder="Replace"
                        className="h-7 flex-1 bg-muted/60 px-2.5 text-xs placeholder:text-muted-foreground/60 focus-visible:ring-0"
                        onChange={(e) => setReplaceText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            handleReplace();
                          } else if (e.key === "Escape") {
                            e.preventDefault();
                            handleClose();
                          } else if (e.key === "Tab") {
                            e.preventDefault();
                            inputRef.current?.focus();
                          }
                        }}
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2.5 text-xs"
                        onClick={handleReplace}
                        disabled={!query}
                      >
                        Replace
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2.5 text-xs"
                        onClick={handleReplaceAll}
                        disabled={!query}
                      >
                        All
                      </Button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    );
}
