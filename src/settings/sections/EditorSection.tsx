import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePreferencesStore } from "@/modules/settings/preferences";
import {
  setEditorAutoSave,
  setEditorBracketMatching,
  setEditorLineNumbers,
  setEditorTabSize,
  setEditorWordWrap,
  setEditorTheme,
  EDITOR_THEMES,
  EDITOR_THEME_LABELS,
  type EditorThemeId,
} from "@/modules/settings/store";
import { SectionHeader } from "../components/SectionHeader";
import { SettingRow } from "../components/SettingRow";

export function EditorSection() {
  const editorTheme = usePreferencesStore((s) => s.editorTheme);
  const editorAutoSave = usePreferencesStore((s) => s.editorAutoSave);
  const editorTabSize = usePreferencesStore((s) => s.editorTabSize);
  const editorLineNumbers = usePreferencesStore((s) => s.editorLineNumbers);
  const editorWordWrap = usePreferencesStore((s) => s.editorWordWrap);
  const editorBracketMatching = usePreferencesStore((s) => s.editorBracketMatching);

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title="Editor"
        description="Code editor appearance and behaviour settings."
      />

      <div className="flex flex-col gap-2">
        <Label>Theme</Label>
        <SettingRow
          title="Syntax theme"
          description="Syntax highlighting color theme for the code editor."
        >
          <Select
            value={editorTheme}
            onValueChange={(v) => void setEditorTheme(v as EditorThemeId)}
          >
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
        <Label>Behaviour</Label>
        <div className="flex flex-col gap-2">
          <SettingRow
            title="Auto save"
            description="Automatically save files when idle or on focus change."
          >
            <Select
              value={editorAutoSave}
              onValueChange={(v) =>
                void setEditorAutoSave(v as "off" | "afterDelay" | "onFocusChange")
              }
            >
              <SelectTrigger className="h-7 w-44 text-[11.5px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="off" className="text-[11.5px]">Off</SelectItem>
                <SelectItem value="afterDelay" className="text-[11.5px]">After delay (5s)</SelectItem>
                <SelectItem value="onFocusChange" className="text-[11.5px]">On focus change</SelectItem>
              </SelectContent>
            </Select>
          </SettingRow>
          <SettingRow
            title="Tab size"
            description="Number of spaces per indentation level."
          >
            <Select
              value={String(editorTabSize)}
              onValueChange={(v) => void setEditorTabSize(Number(v) as 2 | 4 | 8)}
            >
              <SelectTrigger className="h-7 w-28 text-[11.5px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="2" className="text-[11.5px]">2 spaces</SelectItem>
                <SelectItem value="4" className="text-[11.5px]">4 spaces</SelectItem>
                <SelectItem value="8" className="text-[11.5px]">8 spaces</SelectItem>
              </SelectContent>
            </Select>
          </SettingRow>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Display</Label>
        <div className="flex flex-col gap-2">
          <SettingRow
            title="Line numbers"
            description="Show line numbers in the gutter of the code editor."
          >
            <Switch
              checked={editorLineNumbers}
              onCheckedChange={(v) => void setEditorLineNumbers(v)}
            />
          </SettingRow>
          <SettingRow
            title="Word wrap"
            description="Wrap long lines to fit within the editor viewport."
          >
            <Switch
              checked={editorWordWrap}
              onCheckedChange={(v) => void setEditorWordWrap(v)}
            />
          </SettingRow>
          <SettingRow
            title="Bracket matching"
            description="Highlight matching brackets and parentheses."
          >
            <Switch
              checked={editorBracketMatching}
              onCheckedChange={(v) => void setEditorBracketMatching(v)}
            />
          </SettingRow>
        </div>
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[11px] font-medium tracking-tight text-muted-foreground">
      {children}
    </span>
  );
}
