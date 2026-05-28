import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Settings01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  setEditorBracketMatching,
  setEditorFormatOnSave,
  setEditorIndentationGuides,
  setEditorLineNumbers,
  setEditorShowOutline,
  setEditorShowSelectionStats,
  setEditorWordWrap,
} from "@/modules/settings/store";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { useEditorCursorStore } from "./lib/cursorStore";

const LANGUAGE_LIST: { ext: string; label: string }[] = [
  { ext: "js", label: "JavaScript" },
  { ext: "jsx", label: "JavaScript (JSX)" },
  { ext: "ts", label: "TypeScript" },
  { ext: "tsx", label: "TypeScript (TSX)" },
  { ext: "mjs", label: "JavaScript (ESM)" },
  { ext: "cjs", label: "JavaScript (CJS)" },
  { ext: "rs", label: "Rust" },
  { ext: "py", label: "Python" },
  { ext: "c", label: "C" },
  { ext: "cpp", label: "C++" },
  { ext: "h", label: "C/C++ Header" },
  { ext: "hpp", label: "C++ Header" },
  { ext: "json", label: "JSON" },
  { ext: "go", label: "Go" },
  { ext: "java", label: "Java" },
  { ext: "sql", label: "SQL" },
  { ext: "php", label: "PHP" },
  { ext: "xml", label: "XML" },
  { ext: "svg", label: "SVG" },
  { ext: "md", label: "Markdown" },
  { ext: "markdown", label: "Markdown" },
  { ext: "html", label: "HTML" },
  { ext: "htm", label: "HTML" },
  { ext: "css", label: "CSS" },
  { ext: "sh", label: "Shell" },
  { ext: "bash", label: "Bash" },
  { ext: "zsh", label: "Zsh" },
  { ext: "toml", label: "TOML" },
  { ext: "yaml", label: "YAML" },
  { ext: "yml", label: "YAML" },
  { ext: "dockerfile", label: "Dockerfile" },
  { ext: "rb", label: "Ruby" },
  { ext: "swift", label: "Swift" },
  { ext: "kt", label: "Kotlin" },
  { ext: "kts", label: "Kotlin Script" },
];

const LANGUAGE_LABELS: Record<string, string> = Object.fromEntries(
  LANGUAGE_LIST.map((l) => [l.ext, l.label]),
);

// Deduplicated list for the dropdown (unique labels only, first occurrence wins)
const LANGUAGE_LIST_DEDUPED = LANGUAGE_LIST.filter(
  (l, i, arr) => arr.findIndex((x) => x.label === l.label) === i,
);

type Props = {
  fileName: string;
  dirty: boolean;
  isMarkdownFile: boolean;
  markdownPreviewOpen: boolean;
  languageOverride?: string;
  detectedLanguage: string | null;
  onMarkdownPreviewToggle: (v: boolean) => void;
  onOutlineToggle: (v: boolean) => void;
  onLanguageChange: (ext: string | undefined) => void;
};

export function EditorToolbar({
  fileName,
  dirty,
  isMarkdownFile,
  markdownPreviewOpen,
  languageOverride,
  detectedLanguage,
  onMarkdownPreviewToggle,
  onOutlineToggle,
  onLanguageChange,
}: Props) {
  const editorWordWrap = usePreferencesStore((s) => s.editorWordWrap);
  const editorLineNumbers = usePreferencesStore((s) => s.editorLineNumbers);
  const editorBracketMatching = usePreferencesStore((s) => s.editorBracketMatching);
  const editorShowSelectionStats = usePreferencesStore((s) => s.editorShowSelectionStats);
  const editorIndentationGuides = usePreferencesStore((s) => s.editorIndentationGuides);
  const editorShowOutline = usePreferencesStore((s) => s.editorShowOutline);
  const editorFormatOnSave = usePreferencesStore((s) => s.editorFormatOnSave);
  const editorShowCursorPosition = usePreferencesStore((s) => s.editorShowCursorPosition);
  const selectionChars = useEditorCursorStore((s) => s.selectionChars);
  const selectionLines = useEditorCursorStore((s) => s.selectionLines);
  const cursorLine = useEditorCursorStore((s) => s.line);
  const cursorCol = useEditorCursorStore((s) => s.col);

  const effectiveLang = languageOverride ?? detectedLanguage;
  const langLabel = effectiveLang ? (LANGUAGE_LABELS[effectiveLang] ?? effectiveLang.toUpperCase()) : "Plain Text";

  return (
    <div className="h-8 bg-card border-b border-border px-3 flex items-center justify-between shrink-0">
      <div className="flex items-center gap-2 min-w-0">
        <span className="truncate text-xs text-foreground/80 font-medium">{fileName}</span>
        {dirty && (
          <span
            className="size-2 rounded-full bg-foreground/50 shrink-0"
            title="Unsaved changes"
            aria-label="Unsaved changes"
            role="img"
          />
        )}
        {editorShowCursorPosition && (
          <span className="text-[10px] tabular-nums text-muted-foreground/50 shrink-0 select-none">
            {cursorLine}:{cursorCol}
          </span>
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
            <button
              type="button"
              className="text-[10px] text-muted-foreground/60 hover:text-foreground transition-colors px-1.5 py-0.5 rounded hover:bg-accent/50 shrink-0"
              title={languageOverride ? `Language override: ${langLabel}` : "Auto-detected language"}
            >
              {langLabel}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="max-h-60 overflow-y-auto min-w-40">
            <DropdownMenuItem
              onSelect={() => onLanguageChange(undefined)}
              className={!languageOverride ? "font-medium text-xs" : "text-xs"}
            >
              Auto-detect
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {LANGUAGE_LIST_DEDUPED.map((lang) => (
              <DropdownMenuItem
                key={lang.ext}
                onSelect={() => onLanguageChange(lang.ext)}
                className={languageOverride === lang.ext ? "font-medium text-xs" : "text-xs"}
              >
                {lang.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
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
            <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-muted-foreground/50 px-2 py-1">
              Display
            </DropdownMenuLabel>
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
              checked={editorIndentationGuides}
              onCheckedChange={(v) => void setEditorIndentationGuides(v)}
            >
              Indentation Guides
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={editorShowOutline}
              onCheckedChange={(v) => {
                void setEditorShowOutline(v);
                onOutlineToggle(v);
              }}
            >
              Outline
            </DropdownMenuCheckboxItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-muted-foreground/50 px-2 py-1">
              Editing
            </DropdownMenuLabel>
            <DropdownMenuCheckboxItem
              checked={editorBracketMatching}
              onCheckedChange={(v) => void setEditorBracketMatching(v)}
            >
              Bracket Matching
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={editorFormatOnSave}
              onCheckedChange={(v) => void setEditorFormatOnSave(v)}
            >
              Format on Save
            </DropdownMenuCheckboxItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-muted-foreground/50 px-2 py-1">
              Info
            </DropdownMenuLabel>
            <DropdownMenuCheckboxItem
              checked={editorShowSelectionStats}
              onCheckedChange={(v) => void setEditorShowSelectionStats(v)}
            >
              Selection Stats
            </DropdownMenuCheckboxItem>
            {isMarkdownFile && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuCheckboxItem
                  checked={markdownPreviewOpen}
                  onCheckedChange={onMarkdownPreviewToggle}
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
}
