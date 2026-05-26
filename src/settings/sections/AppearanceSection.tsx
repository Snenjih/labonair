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
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { useEffect, useState } from "react";
import { useNotificationStore } from "@/modules/notifications/store/useNotificationStore";

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

  const addNotification = useNotificationStore((s) => s.addNotification);

  const [backgrounds, setBackgrounds] = useState<BackgroundInfo[]>([]);
  // filename → base64 data URL for thumbnails (loaded lazily)
  const [thumbUrls, setThumbUrls] = useState<Record<string, string>>({});
  // Track which thumbnail is hovered for the delete button
  const [hoveredFilename, setHoveredFilename] = useState<string | null>(null);

  useEffect(() => {
    invoke<BackgroundInfo[]>("backgrounds_list")
      .then((list) => {
        setBackgrounds(list);
        // Load data URLs for all thumbnails
        for (const bg of list) {
          invoke<string>("background_read_data_url", { filename: bg.filename })
            .then((url) => setThumbUrls((prev) => ({ ...prev, [bg.filename]: url })))
            .catch(() => {});
        }
      })
      .catch((err: unknown) => {
        const detail = err instanceof Error ? err.message : String(err);
        addNotification({
          type: "error",
          title: "Failed to load backgrounds",
          message: `Could not read the backgrounds directory. ${detail}`,
          source: "Background",
        });
      });
  }, [addNotification]);

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
      setBackgrounds((prev) =>
        [...prev, info].sort((a, b) => a.filename.localeCompare(b.filename))
      );
      // Load data URL for the new thumbnail
      void invoke<string>("background_read_data_url", { filename: info.filename })
        .then((url) => setThumbUrls((prev) => ({ ...prev, [info.filename]: url })))
        .catch(() => {});
      void setBackgroundImage(info.filename);
    } catch (err: unknown) {
      const detail = err instanceof Error ? err.message : String(err);
      addNotification({
        type: "error",
        title: "Failed to import background",
        message: `The image could not be imported. ${detail}`,
        source: "Background",
      });
    }
  }

  async function handleDelete(filename: string) {
    try {
      await invoke("background_delete", { filename });
      setBackgrounds((prev) => prev.filter((b) => b.filename !== filename));
      setThumbUrls((prev) => { const next = { ...prev }; delete next[filename]; return next; });
      if (backgroundImage === filename) {
        void setBackgroundImage("");
      }
      setHoveredFilename(null);
    } catch (err: unknown) {
      const detail = err instanceof Error ? err.message : String(err);
      addNotification({
        type: "error",
        title: "Failed to delete background",
        message: `"${filename}" could not be deleted. ${detail}`,
        source: "Background",
      });
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
              "relative h-[86px] w-[112px] shrink-0 overflow-hidden rounded-md border transition-all",
              backgroundImage === ""
                ? "border-foreground/60 ring-1 ring-foreground/20"
                : "border-border/60 hover:border-border",
            )}
            title="No background"
          >
            <div
              className="absolute inset-0"
              style={{
                backgroundImage:
                  "repeating-conic-gradient(hsl(var(--muted)) 0% 25%, transparent 0% 50%)",
                backgroundSize: "10px 10px",
              }}
            />
            <span className="absolute inset-0 flex items-center justify-center text-[10px] font-medium text-muted-foreground">
              None
            </span>
          </button>

          {/* Saved background thumbnails */}
          {backgrounds.map((bg) => (
            <div
              key={bg.filename}
              className="relative shrink-0"
              onMouseEnter={() => setHoveredFilename(bg.filename)}
              onMouseLeave={() => setHoveredFilename(null)}
            >
              <button
                type="button"
                onClick={() => handleSelect(bg.filename)}
                className={cn(
                  "h-[86px] w-[112px] overflow-hidden rounded-md border transition-all",
                  backgroundImage === bg.filename
                    ? "border-foreground/60 ring-1 ring-foreground/20"
                    : "border-border/60 hover:border-border",
                )}
                title={bg.filename}
              >
                <img
                  src={thumbUrls[bg.filename]}
                  alt={bg.filename}
                  className="h-full w-full object-cover"
                  draggable={false}
                />
              </button>
              {/* Delete button — visible on hover */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  void handleDelete(bg.filename);
                }}
                className={cn(
                  "absolute -right-1 -top-1 flex h-[18px] w-[18px] items-center justify-center rounded-full border border-border/60 bg-background/90 text-muted-foreground transition-all hover:bg-destructive/90 hover:text-white",
                  hoveredFilename === bg.filename ? "opacity-100" : "opacity-0",
                )}
                title={`Delete ${bg.filename}`}
              >
                <HugeiconsIcon icon={Cancel01Icon} size={9} strokeWidth={2.5} />
              </button>
            </div>
          ))}

          {/* Add button */}
          <button
            type="button"
            onClick={() => void handleImport()}
            className="flex h-[86px] w-[112px] shrink-0 flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border/60 text-muted-foreground transition-all hover:border-border hover:text-foreground"
            title="Add background image"
          >
            <HugeiconsIcon icon={Add01Icon} size={16} strokeWidth={1.5} />
            <span className="text-[10px]">Add image</span>
          </button>
        </div>

        {/* Opacity & blur — only shown when a background is set */}
        {backgroundImage !== "" && (
          <div className="flex flex-col gap-2 mt-1">
            <SettingRow
              title="UI opacity"
              description="How transparent UI surfaces are — higher value lets more of the background image show through."
            >
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={0}
                  max={90}
                  step={5}
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
              title="Image blur"
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
