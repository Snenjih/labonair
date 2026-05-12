import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { usePreferencesStore } from "@/modules/settings/preferences";
import {
  setTerminalCursorBlink,
  setTerminalCursorStyle,
  setTerminalFontFamily,
  setTerminalFontSize,
  setTerminalFontWeight,
  setTerminalLetterSpacing,
  setTerminalLineHeight,
  setTerminalScrollback,
} from "@/modules/settings/store";
import { SectionHeader } from "../components/SectionHeader";
import { SettingRow } from "../components/SettingRow";

export function TerminalSection() {
  const terminalCursorBlink = usePreferencesStore((s) => s.terminalCursorBlink);
  const terminalCursorStyle = usePreferencesStore((s) => s.terminalCursorStyle);
  const terminalFontFamily = usePreferencesStore((s) => s.terminalFontFamily);
  const terminalFontSize = usePreferencesStore((s) => s.terminalFontSize);
  const terminalFontWeight = usePreferencesStore((s) => s.terminalFontWeight);
  const terminalLetterSpacing = usePreferencesStore((s) => s.terminalLetterSpacing);
  const terminalLineHeight = usePreferencesStore((s) => s.terminalLineHeight);
  const terminalScrollback = usePreferencesStore((s) => s.terminalScrollback);

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title="Terminal"
        description="Font, cursor, and display settings for the terminal emulator."
      />

      <div className="flex flex-col gap-2">
        <Label>Font</Label>
        <div className="flex flex-col gap-2">
          <SettingRow
            title="Font family"
            description="Monospace font for the terminal emulator."
          >
            <Input
              value={terminalFontFamily}
              onChange={(e) => void setTerminalFontFamily(e.target.value)}
              className="h-7 w-52 text-[11.5px]"
            />
          </SettingRow>
          <SettingRow
            title="Font size"
            description="Font size used in the terminal (in px)."
          >
            <NumInput
              value={terminalFontSize}
              min={8}
              max={32}
              step={1}
              onChange={(v) => void setTerminalFontSize(v)}
            />
          </SettingRow>
          <SettingRow
            title="Font weight"
            description="Weight of the text rendered in the terminal."
          >
            <Select
              value={terminalFontWeight}
              onValueChange={(v) =>
                void setTerminalFontWeight(v as "normal" | "medium" | "bold")
              }
            >
              <SelectTrigger className="h-7 w-28 text-[11.5px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="normal" className="text-[11.5px]">Normal</SelectItem>
                <SelectItem value="medium" className="text-[11.5px]">Medium</SelectItem>
                <SelectItem value="bold" className="text-[11.5px]">Bold</SelectItem>
              </SelectContent>
            </Select>
          </SettingRow>
          <SettingRow
            title="Letter spacing"
            description="Horizontal spacing between characters (in px)."
          >
            <NumInput
              value={terminalLetterSpacing}
              min={-2}
              max={10}
              step={0.5}
              onChange={(v) => void setTerminalLetterSpacing(v)}
            />
          </SettingRow>
          <SettingRow
            title="Line height"
            description="Vertical spacing between lines in the terminal."
          >
            <NumInput
              value={terminalLineHeight}
              min={0.8}
              max={2}
              step={0.05}
              onChange={(v) => void setTerminalLineHeight(v)}
            />
          </SettingRow>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Cursor</Label>
        <div className="flex flex-col gap-2">
          <SettingRow
            title="Cursor style"
            description="Shape of the cursor in the terminal."
          >
            <Select
              value={terminalCursorStyle}
              onValueChange={(v) =>
                void setTerminalCursorStyle(v as "block" | "underline" | "bar")
              }
            >
              <SelectTrigger className="h-7 w-28 text-[11.5px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="block" className="text-[11.5px]">Block</SelectItem>
                <SelectItem value="underline" className="text-[11.5px]">Underline</SelectItem>
                <SelectItem value="bar" className="text-[11.5px]">Bar</SelectItem>
              </SelectContent>
            </Select>
          </SettingRow>
          <SettingRow
            title="Cursor blink"
            description="Animate the terminal cursor with a blinking effect."
          >
            <Switch
              checked={terminalCursorBlink}
              onCheckedChange={(v) => void setTerminalCursorBlink(v)}
            />
          </SettingRow>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Buffer</Label>
        <SettingRow
          title="Scrollback buffer"
          description="Number of lines kept in the terminal history."
        >
          <NumInput
            value={terminalScrollback}
            min={500}
            max={50000}
            step={500}
            onChange={(v) => void setTerminalScrollback(v)}
          />
        </SettingRow>
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

function NumInput({
  value,
  min,
  max,
  step,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <input
      type="number"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="h-7 w-20 rounded-md border border-border/60 bg-transparent px-2 text-center text-[11.5px] focus:outline-none focus:ring-1 focus:ring-ring"
    />
  );
}
