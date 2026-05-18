import { usePreferencesStore } from "@/modules/settings/preferences";
import {
  setAppFontFamily,
  setAppFontSize,
  setAppLineHeight,
  setSidebarPosition,
} from "@/modules/settings/store";
import { SectionHeader } from "../components/SectionHeader";
import { SettingRow } from "../components/SettingRow";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function AppearanceSection() {
  const appFontFamily = usePreferencesStore((s) => s.appFontFamily);
  const appFontSize = usePreferencesStore((s) => s.appFontSize);
  const appLineHeight = usePreferencesStore((s) => s.appLineHeight);
  const sidebarPosition = usePreferencesStore((s) => s.sidebarPosition);

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title="Appearance"
        description="Interface typography and layout settings."
      />

      <div className="flex flex-col gap-2">
        <Label>Layout</Label>
        <SettingRow
          title="Sidebar position"
          description="Display the file explorer on the left or right side of the workspace."
        >
          <Select
            value={sidebarPosition}
            onValueChange={(v) =>
              void setSidebarPosition(v as "left" | "right")
            }
          >
            <SelectTrigger className="h-7 w-24 text-[11.5px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="left" className="text-[11.5px]">Left</SelectItem>
              <SelectItem value="right" className="text-[11.5px]">Right</SelectItem>
            </SelectContent>
          </Select>
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
