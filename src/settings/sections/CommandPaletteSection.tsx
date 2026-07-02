import { usePreferencesStore } from "@/modules/settings/preferences";
import {
  setCommandPaletteAnimation,
  setCommandPaletteBlur,
  setCommandPaletteCloseOnOverlayClick,
  setCommandPaletteHistorySize,
  setCommandPaletteOpacity,
  setCommandPalettePosition,
  setCommandPaletteSearchMode,
  setCommandPaletteShowRecent,
} from "@/modules/settings/store";
import { SectionHeader } from "../components/SectionHeader";
import { SettingRow } from "../components/SettingRow";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function CommandPaletteSection() {
  const blur = usePreferencesStore((s) => s.commandPaletteBlur);
  const opacity = usePreferencesStore((s) => s.commandPaletteOpacity);
  const position = usePreferencesStore((s) => s.commandPalettePosition);
  const animation = usePreferencesStore((s) => s.commandPaletteAnimation);
  const showRecent = usePreferencesStore((s) => s.commandPaletteShowRecent);
  const historySize = usePreferencesStore((s) => s.commandPaletteHistorySize);
  const searchMode = usePreferencesStore((s) => s.commandPaletteSearchMode);
  const closeOnOverlay = usePreferencesStore((s) => s.commandPaletteCloseOnOverlayClick);

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title="Command Palette"
        description="Appearance and behaviour of the Cmd+K command palette."
      />

      <div className="flex flex-col gap-2">
        <Label>Appearance</Label>
        <div className="flex flex-col gap-2">
          <SettingRow
            title="Background blur"
            description="Blur strength applied to the app behind the overlay (0 = off, 20 = strong)."
          >
            <div className="flex items-center gap-3">
              <Slider
                min={0}
                max={20}
                step={1}
                value={[blur]}
                onValueChange={([v]) => void setCommandPaletteBlur(v)}
                className="w-28"
              />
              <span className="w-8 text-right text-[11.5px] tabular-nums text-muted-foreground">
                {blur}px
              </span>
            </div>
          </SettingRow>

          <SettingRow title="Palette opacity" description="Opacity of the command palette panel (60–100%).">
            <div className="flex items-center gap-3">
              <Slider
                min={60}
                max={100}
                step={1}
                value={[opacity]}
                onValueChange={([v]) => void setCommandPaletteOpacity(v)}
                className="w-28"
              />
              <span className="w-8 text-right text-[11.5px] tabular-nums text-muted-foreground">
                {opacity}%
              </span>
            </div>
          </SettingRow>

          <SettingRow title="Open position" description="Vertical position of the palette when it opens.">
            <Select
              value={position}
              onValueChange={(v) => void setCommandPalettePosition(v as "top" | "center" | "high")}
            >
              <SelectTrigger className="h-7 w-32 text-[11.5px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="top" className="text-[11.5px]">
                  Top (15%)
                </SelectItem>
                <SelectItem value="high" className="text-[11.5px]">
                  High (8%)
                </SelectItem>
                <SelectItem value="center" className="text-[11.5px]">
                  Center
                </SelectItem>
              </SelectContent>
            </Select>
          </SettingRow>

          <SettingRow title="Animation speed" description="Speed of open/close and page-slide animations.">
            <Select
              value={animation}
              onValueChange={(v) => void setCommandPaletteAnimation(v as "fast" | "normal" | "slow" | "none")}
            >
              <SelectTrigger className="h-7 w-28 text-[11.5px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fast" className="text-[11.5px]">
                  Fast
                </SelectItem>
                <SelectItem value="normal" className="text-[11.5px]">
                  Normal
                </SelectItem>
                <SelectItem value="slow" className="text-[11.5px]">
                  Slow
                </SelectItem>
                <SelectItem value="none" className="text-[11.5px]">
                  None
                </SelectItem>
              </SelectContent>
            </Select>
          </SettingRow>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Behaviour</Label>
        <div className="flex flex-col gap-2">
          <SettingRow
            title="Show recent commands"
            description="Display recently used commands at the top of the palette."
          >
            <Switch checked={showRecent} onCheckedChange={(v) => void setCommandPaletteShowRecent(v)} />
          </SettingRow>

          <SettingRow
            title="Recent history size"
            description="How many recently used commands to remember (3–20)."
          >
            <input
              type="number"
              min={3}
              max={20}
              step={1}
              value={historySize}
              onChange={(e) => void setCommandPaletteHistorySize(Number(e.target.value))}
              className="h-7 w-16 rounded-md border border-border/60 bg-transparent px-2 text-center text-[11.5px] focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </SettingRow>

          <SettingRow title="Search mode" description="How search queries are matched against command names.">
            <Select
              value={searchMode}
              onValueChange={(v) =>
                void setCommandPaletteSearchMode(v as "contains" | "startsWith" | "fuzzy")
              }
            >
              <SelectTrigger className="h-7 w-32 text-[11.5px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="contains" className="text-[11.5px]">
                  Contains
                </SelectItem>
                <SelectItem value="startsWith" className="text-[11.5px]">
                  Starts with
                </SelectItem>
                <SelectItem value="fuzzy" className="text-[11.5px]">
                  Fuzzy
                </SelectItem>
              </SelectContent>
            </Select>
          </SettingRow>

          <SettingRow
            title="Close on outside click"
            description="Close the palette when clicking the background overlay."
          >
            <Switch
              checked={closeOnOverlay}
              onCheckedChange={(v) => void setCommandPaletteCloseOnOverlayClick(v)}
            />
          </SettingRow>
        </div>
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <span className="text-[11px] font-medium tracking-tight text-muted-foreground">{children}</span>;
}
