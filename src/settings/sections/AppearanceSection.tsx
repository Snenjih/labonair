import { usePreferencesStore } from "@/modules/settings/preferences";
import {
  setAppFontFamily,
  setAppFontSize,
  setAppLineHeight,
  setSidebarPosition,
  setTitlebarsIconsPosition,
} from "@/modules/settings/store";
import type { ThemePref } from "@/modules/settings/store";

const TITLEBAR_ICONS_DESCRIPTIONS: Record<"auto" | "left" | "right", string> = {
  auto: "Follows platform conventions — right side on macOS (traffic lights occupy the left) and on Windows (before the window controls).",
  left: "Icons appear to the left of the tab bar, right next to the sidebar toggle.",
  right: "Icons always appear at the far right end of the titlebar.",
};
import { useTheme } from "@/modules/theme";
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
import { cn } from "@/lib/utils";
import {
  ComputerIcon,
  Moon02Icon,
  Sun03Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

const APPEARANCE: {
  id: ThemePref;
  label: string;
  icon: typeof ComputerIcon;
}[] = [
  { id: "system", label: "System", icon: ComputerIcon },
  { id: "light", label: "Light", icon: Sun03Icon },
  { id: "dark", label: "Dark", icon: Moon02Icon },
];

export function AppearanceSection() {
  const { theme, setTheme } = useTheme();
  const appFontFamily = usePreferencesStore((s) => s.appFontFamily);
  const appFontSize = usePreferencesStore((s) => s.appFontSize);
  const appLineHeight = usePreferencesStore((s) => s.appLineHeight);
  const sidebarPosition = usePreferencesStore((s) => s.sidebarPosition);
  const titlebarsIconsPosition = usePreferencesStore((s) => s.titlebarsIconsPosition);

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title="Appearance"
        description="Color theme, typography, and layout."
      />

      <div className="flex flex-col gap-2">
        <Label>Color theme</Label>
        <div className="grid grid-cols-3 gap-2">
          {APPEARANCE.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => setTheme(o.id)}
              className={cn(
                "group flex h-20 flex-col items-center justify-center gap-1.5 rounded-lg border bg-card transition-all",
                theme === o.id
                  ? "border-foreground/60 ring-1 ring-foreground/20"
                  : "border-border/60 hover:border-border",
              )}
            >
              <HugeiconsIcon icon={o.icon} size={18} strokeWidth={1.5} />
              <span className="text-[11.5px]">{o.label}</span>
            </button>
          ))}
        </div>
      </div>

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
        <SettingRow
          title="Titlebar icons position"
          description={TITLEBAR_ICONS_DESCRIPTIONS[titlebarsIconsPosition]}
        >
          <Select
            value={titlebarsIconsPosition}
            onValueChange={(v) =>
              void setTitlebarsIconsPosition(v as "auto" | "left" | "right")
            }
          >
            <SelectTrigger className="h-7 w-24 text-[11.5px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto" className="text-[11.5px]">Auto</SelectItem>
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
