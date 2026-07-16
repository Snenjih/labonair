import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { usePreferencesStore } from "@/modules/settings/preferences";
import {
  setEditorAutoSave,
  setEditorAutoSaveDelay,
  setEditorBracketMatching,
  setEditorFormatOnSave,
  setEditorIndentationGuides,
  setEditorLineNumbers,
  setEditorShowCursorPosition,
  setEditorShowOutline,
  setEditorShowSelectionStats,
  setEditorTabSize,
  setEditorWordWrap,
  setEditorTheme,
  setEditorFontFamily,
  setEditorLineHeight,
  setEditorIndentWithTabs,
  setEditorTrimTrailingWhitespace,
  setEditorInsertFinalNewline,
  setEditorAutocompleteDebounceMs,
  setEditorMaxFileSizeMb,
  EDITOR_THEMES,
  EDITOR_THEME_LABELS,
  type EditorThemeId,
} from "@/modules/settings/store";
import { NumInput } from "../components/NumInput";
import { SectionHeader } from "../components/SectionHeader";
import { SettingRow } from "../components/SettingRow";

export function EditorSection() {
  const editorTheme = usePreferencesStore((s) => s.editorTheme);
  const editorFontFamily = usePreferencesStore((s) => s.editorFontFamily);
  const editorLineHeight = usePreferencesStore((s) => s.editorLineHeight);
  const editorAutoSave = usePreferencesStore((s) => s.editorAutoSave);
  const editorAutoSaveDelay = usePreferencesStore((s) => s.editorAutoSaveDelay);
  const editorTabSize = usePreferencesStore((s) => s.editorTabSize);
  const editorIndentWithTabs = usePreferencesStore((s) => s.editorIndentWithTabs);
  const editorLineNumbers = usePreferencesStore((s) => s.editorLineNumbers);
  const editorWordWrap = usePreferencesStore((s) => s.editorWordWrap);
  const editorBracketMatching = usePreferencesStore((s) => s.editorBracketMatching);
  const editorShowCursorPosition = usePreferencesStore((s) => s.editorShowCursorPosition);
  const editorShowSelectionStats = usePreferencesStore((s) => s.editorShowSelectionStats);
  const editorShowOutline = usePreferencesStore((s) => s.editorShowOutline);
  const editorFormatOnSave = usePreferencesStore((s) => s.editorFormatOnSave);
  const editorIndentationGuides = usePreferencesStore((s) => s.editorIndentationGuides);
  const editorTrimTrailingWhitespace = usePreferencesStore((s) => s.editorTrimTrailingWhitespace);
  const editorInsertFinalNewline = usePreferencesStore((s) => s.editorInsertFinalNewline);
  const editorAutocompleteDebounceMs = usePreferencesStore((s) => s.editorAutocompleteDebounceMs);
  const editorMaxFileSizeMb = usePreferencesStore((s) => s.editorMaxFileSizeMb);

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader title="Editor" description="Code editor appearance and behaviour settings." />

      <div className="flex flex-col gap-2">
        <Label>Theme</Label>
        <SettingRow title="Syntax theme" description="Syntax highlighting color theme for the code editor.">
          <Select value={editorTheme} onValueChange={(v) => void setEditorTheme(v as EditorThemeId)}>
            <SelectTrigger className="h-7 w-36 text-[11.5px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EDITOR_THEMES.map((t) => (
                <SelectItem key={t} value={t} className="text-[11.5px]">
                  {EDITOR_THEME_LABELS[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingRow>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Font</Label>
        <div className="flex flex-col gap-2">
          <SettingRow title="Font family" description="Monospace font used in the code editor.">
            <Input
              value={editorFontFamily}
              onChange={(e) => void setEditorFontFamily(e.target.value)}
              className="h-7 w-52 text-[11.5px]"
            />
          </SettingRow>
          <SettingRow
            title="Line height"
            description="Vertical spacing between lines in the code editor (1.0 – 3.0)."
          >
            <NumInput
              value={editorLineHeight}
              min={1.0}
              max={3.0}
              step={0.05}
              onChange={(v) => void setEditorLineHeight(v)}
            />
          </SettingRow>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Behaviour</Label>
        <div className="flex flex-col gap-2">
          <SettingRow
            title="Format on Save"
            description="Automatically format the document with Prettier when saving (Cmd+S). Also triggered by Cmd+Shift+F."
          >
            <Switch checked={editorFormatOnSave} onCheckedChange={(v) => void setEditorFormatOnSave(v)} />
          </SettingRow>
          <SettingRow title="Auto save" description="Automatically save files when idle or on focus change.">
            <Select
              value={editorAutoSave}
              onValueChange={(v) => void setEditorAutoSave(v as "off" | "afterDelay" | "onFocusChange")}
            >
              <SelectTrigger className="h-7 w-44 text-[11.5px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="off" className="text-[11.5px]">
                  Off
                </SelectItem>
                <SelectItem value="afterDelay" className="text-[11.5px]">
                  After delay
                </SelectItem>
                <SelectItem value="onFocusChange" className="text-[11.5px]">
                  On focus change
                </SelectItem>
              </SelectContent>
            </Select>
          </SettingRow>
          {editorAutoSave === "afterDelay" && (
            <SettingRow
              title="Auto save delay"
              description="Milliseconds of inactivity before the file is auto-saved (100 – 60 000 ms)."
            >
              <input
                type="number"
                min={100}
                max={60000}
                step={100}
                value={editorAutoSaveDelay}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (!Number.isNaN(v)) void setEditorAutoSaveDelay(v);
                }}
                className="h-7 w-24 rounded-md border border-border/60 bg-transparent px-2 text-center text-[11.5px] [appearance:textfield] focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </SettingRow>
          )}
          <SettingRow title="Tab size" description="Number of spaces per indentation level.">
            <Select
              value={String(editorTabSize)}
              onValueChange={(v) => void setEditorTabSize(Number(v) as 2 | 4 | 8)}
            >
              <SelectTrigger className="h-7 w-28 text-[11.5px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="2" className="text-[11.5px]">
                  2 spaces
                </SelectItem>
                <SelectItem value="4" className="text-[11.5px]">
                  4 spaces
                </SelectItem>
                <SelectItem value="8" className="text-[11.5px]">
                  8 spaces
                </SelectItem>
              </SelectContent>
            </Select>
          </SettingRow>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Indentation</Label>
        <SettingRow
          title="Indent with tabs"
          description="Use tab characters for indentation instead of spaces."
        >
          <Switch checked={editorIndentWithTabs} onCheckedChange={(v) => void setEditorIndentWithTabs(v)} />
        </SettingRow>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Files</Label>
        <SettingRow
          title="Max file size (MB)"
          description="Largest local file the editor (and AI file-read tools) will open (1–100 MB)."
        >
          <NumInput
            value={editorMaxFileSizeMb}
            min={1}
            max={100}
            step={1}
            onChange={(v) => void setEditorMaxFileSizeMb(v)}
          />
        </SettingRow>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Display</Label>
        <div className="flex flex-col gap-2">
          <SettingRow title="Line numbers" description="Show line numbers in the gutter of the code editor.">
            <Switch checked={editorLineNumbers} onCheckedChange={(v) => void setEditorLineNumbers(v)} />
          </SettingRow>
          <SettingRow title="Word wrap" description="Wrap long lines to fit within the editor viewport.">
            <Switch checked={editorWordWrap} onCheckedChange={(v) => void setEditorWordWrap(v)} />
          </SettingRow>
          <SettingRow title="Bracket matching" description="Highlight matching brackets and parentheses.">
            <Switch
              checked={editorBracketMatching}
              onCheckedChange={(v) => void setEditorBracketMatching(v)}
            />
          </SettingRow>
          <SettingRow
            title="Cursor position"
            description="Display the current line and column in the status bar while editing."
          >
            <Switch
              checked={editorShowCursorPosition}
              onCheckedChange={(v) => void setEditorShowCursorPosition(v)}
            />
          </SettingRow>
          <SettingRow
            title="Selection stats"
            description="Show selected character and line count in the editor toolbar."
          >
            <Switch
              checked={editorShowSelectionStats}
              onCheckedChange={(v) => void setEditorShowSelectionStats(v)}
            />
          </SettingRow>
          <SettingRow
            title="Outline panel"
            description="Show a document outline panel with headings and symbol names."
          >
            <Switch checked={editorShowOutline} onCheckedChange={(v) => void setEditorShowOutline(v)} />
          </SettingRow>
          <SettingRow
            title="Indentation guides"
            description="Show vertical guide lines at each indentation level."
          >
            <Switch
              checked={editorIndentationGuides}
              onCheckedChange={(v) => void setEditorIndentationGuides(v)}
            />
          </SettingRow>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label>On Save</Label>
        <div className="flex flex-col gap-2">
          <SettingRow
            title="Trim trailing whitespace"
            description="Remove trailing whitespace from each line when saving."
          >
            <Switch
              checked={editorTrimTrailingWhitespace}
              onCheckedChange={(v) => void setEditorTrimTrailingWhitespace(v)}
            />
          </SettingRow>
          <SettingRow
            title="Insert final newline"
            description="Ensure files end with a newline character when saving."
          >
            <Switch
              checked={editorInsertFinalNewline}
              onCheckedChange={(v) => void setEditorInsertFinalNewline(v)}
            />
          </SettingRow>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label>AI Completion</Label>
        <SettingRow
          title="Autocomplete debounce (ms)"
          description="Delay in milliseconds before autocomplete suggestions are triggered (50 – 2000 ms)."
        >
          <NumInput
            value={editorAutocompleteDebounceMs}
            min={50}
            max={2000}
            step={50}
            onChange={(v) => void setEditorAutocompleteDebounceMs(v)}
          />
        </SettingRow>
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <span className="text-[11px] font-medium tracking-tight text-muted-foreground">{children}</span>;
}
