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

type Props = {
  fileName: string;
  dirty: boolean;
  isMarkdownFile: boolean;
  markdownPreviewOpen: boolean;
  onMarkdownPreviewToggle: (v: boolean) => void;
  onOutlineToggle: (v: boolean) => void;
};

export function EditorToolbar({
  fileName,
  dirty,
  isMarkdownFile,
  markdownPreviewOpen,
  onMarkdownPreviewToggle,
  onOutlineToggle,
}: Props) {
  const editorWordWrap = usePreferencesStore((s) => s.editorWordWrap);
  const editorLineNumbers = usePreferencesStore((s) => s.editorLineNumbers);
  const editorBracketMatching = usePreferencesStore((s) => s.editorBracketMatching);
  const editorShowSelectionStats = usePreferencesStore((s) => s.editorShowSelectionStats);
  const editorIndentationGuides = usePreferencesStore((s) => s.editorIndentationGuides);
  const editorShowOutline = usePreferencesStore((s) => s.editorShowOutline);
  const editorFormatOnSave = usePreferencesStore((s) => s.editorFormatOnSave);
  const selectionChars = useEditorCursorStore((s) => s.selectionChars);
  const selectionLines = useEditorCursorStore((s) => s.selectionLines);

  return (
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
                onOutlineToggle(v);
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
