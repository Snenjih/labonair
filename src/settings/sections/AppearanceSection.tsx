import { usePreferencesStore } from "@/modules/settings/preferences";
import {
  setAppFontFamily,
  setAppFontSize,
  setAppLineHeight,
} from "@/modules/settings/store";
import { type ThemeMeta } from "@/lib/useThemeEngine";
import { SectionHeader } from "../components/SectionHeader";
import { SettingRow } from "../components/SettingRow";
import { ThemePicker } from "../components/ThemePicker";
import { Input } from "@/components/ui/input";

type Props = {
  themes: ThemeMeta[];
  onThemesRefresh: () => void;
};

export function AppearanceSection({ themes, onThemesRefresh }: Props) {
  const appFontFamily = usePreferencesStore((s) => s.appFontFamily);
  const appFontSize = usePreferencesStore((s) => s.appFontSize);
  const appLineHeight = usePreferencesStore((s) => s.appLineHeight);

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title="Appearance"
        description="Color themes and interface typography."
      />

      <div className="flex flex-col gap-2">
        <Label>Theme</Label>
        <SettingRow
          title="Color theme"
          description="Choose or import a JSON color theme for the application."
        >
          <ThemePicker themes={themes} onRefresh={onThemesRefresh} />
        </SettingRow>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Typography</Label>
        <div className="flex flex-col gap-2">
          <SettingRow
            title="UI font family"
            description="The font used for all application UI text."
          >
            <Input
              value={appFontFamily}
              onChange={(e) => void setAppFontFamily(e.target.value)}
              className="h-7 w-44 text-[11.5px]"
            />
          </SettingRow>
          <SettingRow
            title="UI font size"
            description="Base font size for the interface (in px)."
          >
            <input
              type="number"
              min={10}
              max={20}
              step={1}
              value={appFontSize}
              onChange={(e) => void setAppFontSize(Number(e.target.value))}
              className="h-7 w-16 rounded-md border border-border/60 bg-transparent px-2 text-center text-[11.5px] focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </SettingRow>
          <SettingRow
            title="UI line height"
            description="Line height multiplier for the application interface."
          >
            <input
              type="number"
              min={1}
              max={2}
              step={0.05}
              value={appLineHeight}
              onChange={(e) => void setAppLineHeight(Number(e.target.value))}
              className="h-7 w-16 rounded-md border border-border/60 bg-transparent px-2 text-center text-[11.5px] focus:outline-none focus:ring-1 focus:ring-ring"
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
