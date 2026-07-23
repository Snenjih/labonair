import {
  Add01Icon,
  Cancel01Icon,
  CancelCircleIcon,
  ComputerIcon,
  Delete01Icon,
  EyeIcon,
  FolderOpenIcon,
  Image01Icon,
  Moon02Icon,
  Sun03Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { useEffect, useState } from "react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useNotificationStore } from "@/modules/notifications/store/useNotificationStore";
import { usePreferencesStore } from "@/modules/settings/preferences";
import type { ThemePref } from "@/modules/settings/store";
import {
  setAppCornerRadius,
  setAppDensity,
  setAppFontFamily,
  setAppFontSize,
  setAppLineHeight,
  setBackgroundBlur,
  setBackgroundImage,
  setBackgroundOpacity,
  setBackgroundTintColor,
  setBackgroundTintOpacity,
  setConfirmCloseTerminalTab,
  setConfirmQuitWithSsh,
  setHmCardScale,
  setNewTabInheritsCwd,
  setTabsLocation,
  setZenModeShowHeader,
  setZenModeShowStatusbar,
} from "@/modules/settings/store";
import { useTheme } from "@/modules/theme";
import { SectionHeader } from "../components/SectionHeader";
import { SettingRow } from "../components/SettingRow";
import { BarItemLayoutSettings } from "./LayoutSection";

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

const VALID_IMAGE_EXTS = ["jpg", "jpeg", "png", "gif", "webp", "avif", "bmp"];

export function AppearanceSection() {
  const { theme, setTheme } = useTheme();
  const appFontFamily = usePreferencesStore((s) => s.appFontFamily);
  const appFontSize = usePreferencesStore((s) => s.appFontSize);
  const appLineHeight = usePreferencesStore((s) => s.appLineHeight);
  const tabsLocation = usePreferencesStore((s) => s.tabsLocation);
  const newTabInheritsCwd = usePreferencesStore((s) => s.newTabInheritsCwd);
  const confirmCloseTerminalTab = usePreferencesStore((s) => s.confirmCloseTerminalTab);
  const confirmQuitWithSsh = usePreferencesStore((s) => s.confirmQuitWithSsh);
  const zenModeShowHeader = usePreferencesStore((s) => s.zenModeShowHeader);
  const zenModeShowStatusbar = usePreferencesStore((s) => s.zenModeShowStatusbar);
  const backgroundImage = usePreferencesStore((s) => s.backgroundImage);
  const backgroundOpacity = usePreferencesStore((s) => s.backgroundOpacity);
  const backgroundBlur = usePreferencesStore((s) => s.backgroundBlur);
  const backgroundTintColor = usePreferencesStore((s) => s.backgroundTintColor);
  const backgroundTintOpacity = usePreferencesStore((s) => s.backgroundTintOpacity);
  const appCornerRadius = usePreferencesStore((s) => s.appCornerRadius);
  const appDensity = usePreferencesStore((s) => s.appDensity);
  const hmCardScale = usePreferencesStore((s) => s.hmCardScale);

  const addNotification = useNotificationStore((s) => s.addNotification);

  const [backgrounds, setBackgrounds] = useState<BackgroundInfo[]>([]);
  const [thumbUrls, setThumbUrls] = useState<Record<string, string>>({});
  const [hoveredFilename, setHoveredFilename] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    invoke<BackgroundInfo[]>("backgrounds_list")
      .then((list) => {
        setBackgrounds(list);
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
      filters: [{ name: "Image", extensions: VALID_IMAGE_EXTS }],
    });
    if (!selected) return;
    try {
      const info = await invoke<BackgroundInfo>("background_import", {
        sourcePath: selected,
      });
      setBackgrounds((prev) => [...prev, info].sort((a, b) => a.filename.localeCompare(b.filename)));
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

  async function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (!file) return;
    // Tauri webview exposes the filesystem path on File objects from OS drag-and-drop
    const path = (file as File & { path?: string }).path;
    if (!path) return;
    const ext = path.split(".").pop()?.toLowerCase();
    if (!ext || !VALID_IMAGE_EXTS.includes(ext)) return;
    try {
      const info = await invoke<BackgroundInfo>("background_import", { sourcePath: path });
      setBackgrounds((prev) => [...prev, info].sort((a, b) => a.filename.localeCompare(b.filename)));
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
      setThumbUrls((prev) => {
        const next = { ...prev };
        delete next[filename];
        return next;
      });
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
    <div className="flex flex-col gap-[var(--ui-section-gap)]">
      <SectionHeader title="Appearance" description="Color theme, background, typography, and layout." />

      <div className="flex flex-col gap-2">
        <Label>Color scheme</Label>
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

        {/* Drop zone wrapper */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragging(false);
          }}
          onDrop={(e) => void handleDrop(e)}
          className={cn(
            "rounded-xl border-2 border-dashed p-2.5 transition-all duration-150",
            isDragging ? "border-foreground/40 bg-foreground/5" : "border-transparent",
          )}
        >
          <div className="flex flex-wrap gap-3">
            {/* None tile */}
            <TileWrapper label="None">
              <button
                type="button"
                onClick={() => handleSelect("")}
                className={cn(
                  "relative h-[100px] w-[150px] overflow-hidden rounded-lg border transition-all",
                  backgroundImage === ""
                    ? "border-foreground/50 ring-2 ring-foreground/20 ring-offset-1 ring-offset-background"
                    : "border-border/50 hover:border-border",
                )}
                title="No background"
              >
                <div
                  className="absolute inset-0"
                  style={{
                    backgroundImage: "repeating-conic-gradient(hsl(var(--muted)) 0% 25%, transparent 0% 50%)",
                    backgroundSize: "12px 12px",
                  }}
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <HugeiconsIcon
                    icon={CancelCircleIcon}
                    size={22}
                    strokeWidth={1.3}
                    className="text-muted-foreground/50"
                  />
                </div>
                {backgroundImage === "" && <SelectedBadge />}
              </button>
            </TileWrapper>

            {/* Saved background thumbnails */}
            {backgrounds.map((bg) => (
              <TileWrapper key={bg.filename} label={bg.filename.replace(/\.[^.]+$/, "")}>
                <ContextMenu>
                  <ContextMenuTrigger asChild>
                    <div
                      className="relative h-[100px] w-[150px]"
                      onMouseEnter={() => setHoveredFilename(bg.filename)}
                      onMouseLeave={() => setHoveredFilename(null)}
                    >
                      <button
                        type="button"
                        onClick={() => handleSelect(bg.filename)}
                        className={cn(
                          "h-full w-full overflow-hidden rounded-lg border transition-all",
                          backgroundImage === bg.filename
                            ? "border-foreground/50 ring-2 ring-foreground/20 ring-offset-1 ring-offset-background"
                            : "border-border/50 hover:border-border",
                        )}
                        title={bg.filename}
                      >
                        <img
                          src={thumbUrls[bg.filename]}
                          alt={bg.filename}
                          className="h-full w-full object-cover"
                          draggable={false}
                        />
                        {backgroundImage === bg.filename && <SelectedBadge />}
                      </button>

                      {/* Quick-delete badge on hover */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleDelete(bg.filename);
                        }}
                        className={cn(
                          "absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-border/60 bg-background/90 text-muted-foreground shadow-sm transition-all hover:bg-destructive/90 hover:text-white",
                          hoveredFilename === bg.filename ? "opacity-100 scale-100" : "opacity-0 scale-75",
                        )}
                        title={`Delete ${bg.filename}`}
                      >
                        <HugeiconsIcon icon={Cancel01Icon} size={10} strokeWidth={2.5} />
                      </button>
                    </div>
                  </ContextMenuTrigger>
                  <ContextMenuContent className="w-48">
                    <ContextMenuItem onClick={() => void revealItemInDir(bg.path)}>
                      <HugeiconsIcon
                        icon={FolderOpenIcon}
                        size={13}
                        strokeWidth={1.5}
                        className="mr-2 text-muted-foreground"
                      />
                      Open in Finder
                    </ContextMenuItem>
                    <ContextMenuItem
                      onClick={() =>
                        void emit("labonair:open-preview", {
                          path: bg.path,
                          title: bg.filename.replace(/\.[^.]+$/, ""),
                        })
                      }
                    >
                      <HugeiconsIcon
                        icon={EyeIcon}
                        size={13}
                        strokeWidth={1.5}
                        className="mr-2 text-muted-foreground"
                      />
                      Open in Preview
                    </ContextMenuItem>
                    <ContextMenuSeparator />
                    <ContextMenuItem variant="destructive" onClick={() => void handleDelete(bg.filename)}>
                      <HugeiconsIcon icon={Delete01Icon} size={13} strokeWidth={1.5} className="mr-2" />
                      Delete
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              </TileWrapper>
            ))}

            {/* Add button */}
            <TileWrapper label="">
              <button
                type="button"
                onClick={() => void handleImport()}
                className="flex h-[100px] w-[150px] flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-border/60 text-muted-foreground transition-all hover:border-border hover:bg-accent/30 hover:text-foreground"
                title="Add background image"
              >
                <HugeiconsIcon icon={Add01Icon} size={18} strokeWidth={1.5} />
                <span className="text-[10px]">Add image</span>
              </button>
            </TileWrapper>
          </div>

          {backgrounds.length === 0 && !isDragging && (
            <div className="flex flex-col items-center gap-2 py-4 text-muted-foreground/50">
              <HugeiconsIcon icon={Image01Icon} size={28} strokeWidth={1.3} />
              <p className="text-[10px]">No backgrounds yet — drop an image here or click "Add image"</p>
            </div>
          )}
          {isDragging && (
            <p className="mt-2 text-center text-[10.5px] font-medium text-foreground/70">Drop to import</p>
          )}
        </div>

        {/* Opacity & blur controls */}
        {backgroundImage !== "" && (
          <div className="flex flex-col gap-4 rounded-lg border border-border/50 bg-card/40 px-4 py-3.5">
            <SliderControl
              label="Wallpaper opacity"
              description="Higher values reveal more of the background"
              value={backgroundOpacity}
              min={0}
              max={100}
              step={5}
              suffix="%"
              onChange={(v) => void setBackgroundOpacity(v)}
            />
            <SliderControl
              label="Image blur"
              description="Gaussian blur applied to the wallpaper"
              value={backgroundBlur}
              min={0}
              max={20}
              step={1}
              suffix="px"
              onChange={(v) => void setBackgroundBlur(v)}
            />
            <SliderControl
              label="Color tint"
              description="Overlay color blended on top of the background image"
              value={backgroundTintOpacity}
              min={0}
              max={100}
              step={5}
              suffix="%"
              onChange={(v) => void setBackgroundTintOpacity(v)}
            />
            {backgroundTintOpacity > 0 && (
              <div className="flex items-center justify-between gap-4">
                <div className="flex flex-col gap-0.5">
                  <span className="text-[12px] font-medium">Tint color</span>
                  <span className="text-[10px] text-muted-foreground">Pick the overlay color</span>
                </div>
                <input
                  type="color"
                  value={backgroundTintColor}
                  onChange={(e) => void setBackgroundTintColor(e.target.value)}
                  className="h-7 w-12 cursor-pointer rounded border border-border/60 bg-transparent p-0.5"
                />
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Label>Interface</Label>
        <div className="flex flex-col gap-4 rounded-lg border border-border/50 bg-card/40 px-4 py-3.5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex flex-col gap-0.5">
              <span className="text-[12px] font-medium">Density</span>
              <span className="text-[10px] text-muted-foreground">Vertical spacing of UI elements</span>
            </div>
            <div className="flex gap-1">
              {(["compact", "default", "relaxed"] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => void setAppDensity(d)}
                  className={cn(
                    "h-7 rounded-md border px-3 text-[11px] capitalize transition-colors",
                    appDensity === d
                      ? "border-border bg-accent text-foreground"
                      : "border-border/40 bg-transparent text-muted-foreground hover:bg-accent/50",
                  )}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>
          <SliderControl
            label="Corner radius"
            description="Border radius for buttons, cards, and inputs"
            value={appCornerRadius}
            min={0}
            max={20}
            step={1}
            suffix="px"
            onChange={(v) => void setAppCornerRadius(v)}
          />
          <SliderControl
            label="Host card size"
            description="Scale of the host cards shown in the Host Manager grid"
            value={hmCardScale}
            min={85}
            max={150}
            step={5}
            suffix="%"
            onChange={(v) => void setHmCardScale(v)}
          />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Layout</Label>
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
              <SelectItem value="titlebar" className="text-[11.5px]">
                Titlebar
              </SelectItem>
              <SelectItem value="sidebar" className="text-[11.5px]">
                Sidebar
              </SelectItem>
            </SelectContent>
          </Select>
        </SettingRow>
        <SettingRow
          title="New tab inherits current directory"
          description="Open new terminal tabs in the working directory of the active tab instead of the home directory."
        >
          <Switch checked={newTabInheritsCwd} onCheckedChange={(v) => void setNewTabInheritsCwd(v)} />
        </SettingRow>
        <SettingRow
          title="Confirm before closing terminal tab"
          description="Show a confirmation dialog when closing a terminal tab with a running shell."
        >
          <Switch
            checked={confirmCloseTerminalTab}
            onCheckedChange={(v) => void setConfirmCloseTerminalTab(v)}
          />
        </SettingRow>
        <SettingRow
          title="Confirm quit with active SSH connections"
          description="Show a confirmation dialog before closing the app when SSH sessions are open."
        >
          <Switch checked={confirmQuitWithSsh} onCheckedChange={(v) => void setConfirmQuitWithSsh(v)} />
        </SettingRow>
        <SettingRow
          title="Show header bar"
          description="Display the header bar with tabs and window controls. Hide it to maximise vertical space."
        >
          <Switch checked={zenModeShowHeader} onCheckedChange={(v) => void setZenModeShowHeader(v)} />
        </SettingRow>
        <SettingRow
          title="Show status bar"
          description="Display the status bar at the bottom. Hide it to maximise vertical space."
        >
          <Switch checked={zenModeShowStatusbar} onCheckedChange={(v) => void setZenModeShowStatusbar(v)} />
        </SettingRow>
      </div>

      <BarItemLayoutSettings />

      <div className="flex flex-col gap-2">
        <Label>Typography</Label>
        <div className="flex flex-col gap-2">
          <SettingRow title="UI font family" description="The font used for all application UI text.">
            <Input
              value={appFontFamily}
              onChange={(e) => void setAppFontFamily(e.target.value)}
              className="h-7 w-44 text-[11.5px]"
            />
          </SettingRow>
          <SettingRow title="UI font size" description="Base font size for the interface (in px).">
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
  return <span className="text-[11px] font-medium tracking-tight text-muted-foreground">{children}</span>;
}

function TileWrapper({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      {children}
      <span className="w-[150px] truncate px-1 text-center text-[9px] text-muted-foreground">
        {label || " "}
      </span>
    </div>
  );
}

function SelectedBadge() {
  return (
    <div className="absolute bottom-1.5 right-1.5 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-foreground shadow-sm">
      <svg width="9" height="9" viewBox="0 0 9 9" fill="none" aria-hidden>
        <path
          d="M1.5 4.5L3.5 6.5L7.5 2.5"
          stroke="hsl(var(--background))"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

type SliderControlProps = {
  label: string;
  description: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix: string;
  onChange: (v: number) => void;
};

function SliderControl({ label, description, value, min, max, step, suffix, onChange }: SliderControlProps) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <span className="text-[12px] font-medium">{label}</span>
          <span className="text-[10px] text-muted-foreground">{description}</span>
        </div>
        <span className="shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
          {value}
          {suffix}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{
          background: `linear-gradient(to right, hsl(var(--foreground)) 0%, hsl(var(--foreground)) ${pct}%, hsl(var(--border)) ${pct}%, hsl(var(--border)) 100%)`,
        }}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-foreground [&::-webkit-slider-thumb]:bg-background [&::-webkit-slider-thumb]:shadow-sm [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:hover:scale-110"
      />
    </div>
  );
}
