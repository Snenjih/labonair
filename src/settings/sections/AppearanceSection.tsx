import { usePreferencesStore } from "@/modules/settings/preferences";
import {
  setAppFontFamily,
  setAppFontSize,
  setAppLineHeight,
  setBackgroundBlur,
  setBackgroundImage,
  setBackgroundOpacity,
  setSidebarPosition,
  setTabsLocation,
  setTitlebarsIconsPosition,
} from "@/modules/settings/store";
import type { ThemePref } from "@/modules/settings/store";
import { getStoragePaths } from "@/lib/paths";
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
  Add01Icon,
  Cancel01Icon,
  ComputerIcon,
  Moon02Icon,
  Sun03Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { useEffect, useState } from "react";

const TITLEBAR_ICONS_DESCRIPTIONS: Record<"auto" | "left" | "right", string> = {
  auto: "Follows platform conventions — right side on macOS (traffic lights occupy the left) and on Windows (before the window controls).",
  left: "Icons appear to the left of the tab bar, right next to the sidebar toggle.",
  right: "Icons always appear at the far right end of the titlebar.",
};

const APPEARANCE: {
  id: ThemePref;
  label: string;
  icon: typeof ComputerIcon;
}[] = [
  { id: "system", label: "System", icon: ComputerIcon },
  { id: "light", label: "Light", icon: Sun03Icon },
  { id: "dark", label: "Dark", icon: Moon02Icon },
];

type BackgroundInfo = {
  filename: string;
  path: string;
  size_bytes: number;
};

export function AppearanceSection() {
  const { theme, setTheme } = useTheme();
  const appFontFamily = usePreferencesStore((s) => s.appFontFamily);
  const appFontSize = usePreferencesStore((s) => s.appFontSize);
  const appLineHeight = usePreferencesStore((s) => s.appLineHeight);
  const sidebarPosition = usePreferencesStore((s) => s.sidebarPosition);
  const titlebarsIconsPosition = usePreferencesStore((s) => s.titlebarsIconsPosition);
  const tabsLocation = usePreferencesStore((s) => s.tabsLocation);
  const backgroundImage = usePreferencesStore((s) => s.backgroundImage);
  const backgroundOpacity = usePreferencesStore((s) => s.backgroundOpacity);
  const backgroundBlur = usePreferencesStore((s) => s.backgroundBlur);

  const [backgrounds, setBackgrounds] = useState<BackgroundInfo[]>([]);
  const [configPath, setConfigPath] = useState<string>("");

  useEffect(() => {
    invoke<BackgroundInfo[]>("backgrounds_list")
      .then(setBackgrounds)
      .catch(() => {});
    getStoragePaths()
      .then((p) => setConfigPath(p.config))
      .catch(() => {});
  }, []);

  function thumbUrl(filename: string): string {
    if (!configPath || !filename) return "";
    const sep = configPath.includes("\\") ? "\\" : "/";
    return convertFileSrc(`${configPath}${sep}backgrounds${sep}${filename}`);
  }

  async function handleImport() {
    const selected = await open({
      multiple: false,
      filters: [
        { name: "Image", extensions: ["jpg", "jpeg", "png", "gif", "webp", "avif", "bmp"] },
      ],
    });
    if (!selected) return;
    try {
      const info = await invoke<BackgroundInfo>("background_import", {
        sourcePath: selected,
      });
      setBackgrounds((prev) => [...prev, info].sort((a, b) => a.filename.localeCompare(b.filename)));
      void setBackgroundImage(info.filename);
    } catch (e) {
      console.error("Failed to import background:", e);
    }
  }

  async function handleDelete(filename: string) {
    try {
      await invoke("background_delete", { filename });
      setBackgrounds((prev) => prev.filter((b) => b.filename !== filename));
      if (backgroundImage === filename) {
        void setBackgroundImage("");
      }
    } catch (e) {
      console.error("Failed to delete background:", e);
    }
  }

  function handleSelect(filename: string) {
    void setBackgroundImage(filename);
  }

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title="Appearance"
        description="Color theme, background, typography, and layout."
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

      {/* Background image */}
      <div className="flex flex-col gap-3">
        <Label>Background image</Label>
        <div className="flex flex-wrap gap-2">
          {/* None tile */}
          <button
            type="button"
            onClick={() => handleSelect("")}
            className={cn(
              "relative h-12 w-16 shrink-0 overflow-hidden rounded-md border transition-all",
              backgroundImage === ""
                ? "border-foreground/60 ring-1 ring-foreground/20"
                : "border-border/60 hover:border-border",
            )}
            title="No background"
          >
            <div className="absolute inset-0"
              style={{
                backgroundImage:
                  "repeating-conic-gradient(hsl(var(--muted)) 0% 25%, transparent 0% 50%)",
                backgroundSize: "8px 8px",
              }}
            />
            <span className="absolute inset-0 flex items-center justify-center text-[9px] font-medium text-muted-foreground">
              None
            </span>
          </button>

          {/* Saved background thumbnails */}
          {backgrounds.map((bg) => (
            <div key={bg.filename} className="relative shrink-0">
              <button
                type="button"
                onClick={() => handleSelect(bg.filename)}
                className={cn(
                  "h-12 w-16 overflow-hidden rounded-md border transition-all",
                  backgroundImage === bg.filename
                    ? "border-foreground/60 ring-1 ring-foreground/20"
                    : "border-border/60 hover:border-border",
                )}
                title={bg.filename}
              >
                <img
                  src={thumbUrl(bg.filename)}
                  alt={bg.filename}
                  className="h-full w-full object-cover"
                  draggable={false}
                />
              </button>
              <button
                type="button"
                onClick={() => void handleDelete(bg.filename)}
                className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-background/90 border border-border/60 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100 [.group:hover_&]:opacity-100"
                title={`Delete ${bg.filename}`}
                style={{ opacity: undefined }}
                onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
                onMouseLeave={(e) => (e.currentTarget.style.opacity = "")}
              >
                <HugeiconsIcon icon={Cancel01Icon} size={9} strokeWidth={2} />
              </button>
            </div>
          ))}

          {/* Add button */}
          <button
            type="button"
            onClick={() => void handleImport()}
            className="flex h-12 w-16 shrink-0 flex-col items-center justify-center gap-0.5 rounded-md border border-dashed border-border/60 text-muted-foreground transition-all hover:border-border hover:text-foreground"
            title="Add background image"
          >
            <HugeiconsIcon icon={Add01Icon} size={14} strokeWidth={1.5} />
            <span className="text-[9px]">Add</span>
          </button>
        </div>

        {/* Opacity & blur — only shown when a background is set */}
        {backgroundImage !== "" && (
          <div className="flex flex-col gap-2 mt-1">
            <SettingRow
              title="Opacity"
              description="Intensity of the background image relative to the UI."
            >
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={10}
                  max={100}
                  step={1}
                  value={backgroundOpacity}
                  onChange={(e) => void setBackgroundOpacity(Number(e.target.value))}
                  className="w-24 accent-foreground"
                />
                <span className="w-8 text-right text-[11px] tabular-nums text-muted-foreground">
                  {backgroundOpacity}%
                </span>
              </div>
            </SettingRow>
            <SettingRow
              title="Blur"
              description="Gaussian blur applied to the background image."
            >
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={0}
                  max={20}
                  step={1}
                  value={backgroundBlur}
                  onChange={(e) => void setBackgroundBlur(Number(e.target.value))}
                  className="w-24 accent-foreground"
                />
                <span className="w-8 text-right text-[11px] tabular-nums text-muted-foreground">
                  {backgroundBlur}px
                </span>
              </div>
            </SettingRow>
          </div>
        )}
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
        <SettingRow
          title="Tab bar location"
          description="Display the tab bar in the titlebar or move it into the sidebar panel."
        >
          <Select
            value={tabsLocation}
            onValueChange={(v) => void setTabsLocation(v as "titlebar" | "sidebar")}
          >
            <SelectTrigger className="h-7 w-24 text-[11.5px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="titlebar" className="text-[11.5px]">Titlebar</SelectItem>
              <SelectItem value="sidebar" className="text-[11.5px]">Sidebar</SelectItem>
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
