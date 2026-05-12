import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  applyThemeColors,
  revertThemeColors,
  type ThemeMeta,
} from "@/lib/useThemeEngine";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { setAppTheme } from "@/modules/settings/store";
import {
  ArrowDown01Icon,
  Delete02Icon,
  Download02Icon,
  Upload02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { useRef, useState } from "react";

type Props = {
  themes: ThemeMeta[];
  onRefresh: () => void;
};

const DEFAULT_ENTRY_ID = "default";

export function ThemePicker({ themes, onRefresh }: Props) {
  const activeId = usePreferencesStore((s) => s.appTheme);
  const [open_, setOpen] = useState(false);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeLabel =
    activeId === DEFAULT_ENTRY_ID
      ? "Default (System)"
      : (themes.find((t) => t.id === activeId)?.name ?? activeId);

  const handleSelect = async (id: string) => {
    await setAppTheme(id);
    if (id === DEFAULT_ENTRY_ID) {
      revertThemeColors();
    } else {
      const meta = themes.find((t) => t.id === id);
      if (meta) applyThemeColors(meta);
    }
    setOpen(false);
  };

  const handleHoverIn = (meta: ThemeMeta | null) => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => {
      if (meta) applyThemeColors(meta);
      else revertThemeColors();
    }, 80);
  };

  const handleHoverOut = () => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    // Restore the actively selected theme
    if (activeId === DEFAULT_ENTRY_ID) {
      revertThemeColors();
    } else {
      const current = themes.find((t) => t.id === activeId);
      if (current) applyThemeColors(current);
      else revertThemeColors();
    }
  };

  const handleImport = async () => {
    const selected = await open({
      multiple: false,
      filters: [{ name: "JSON Theme", extensions: ["json"] }],
    });
    if (!selected) return;
    const path = typeof selected === "string" ? selected : selected;
    try {
      await invoke("theme_import", { sourcePath: path });
      onRefresh();
    } catch (e) {
      console.error("Theme import failed:", e);
    }
  };

  const handleExport = async (id: string) => {
    const dest = await save({
      defaultPath: `${id}.json`,
      filters: [{ name: "JSON Theme", extensions: ["json"] }],
    });
    if (!dest) return;
    try {
      await invoke("theme_export", { id, destPath: dest });
    } catch (e) {
      console.error("Theme export failed:", e);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await invoke("theme_delete", { id });
      if (activeId === id) {
        await setAppTheme(DEFAULT_ENTRY_ID);
        revertThemeColors();
      }
      onRefresh();
    } catch (e) {
      console.error("Theme delete failed:", e);
    }
  };

  return (
    <Popover open={open_} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="h-9 justify-between gap-2 px-2.5 text-[12px]"
        >
          <span>{activeLabel}</span>
          <HugeiconsIcon icon={ArrowDown01Icon} size={12} strokeWidth={2} className="opacity-70" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-72 p-1.5"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <div className="mb-1.5 flex items-center justify-between px-1">
          <span className="text-[10.5px] font-medium text-muted-foreground">Themes</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 gap-1 px-2 text-[10.5px]"
            onClick={handleImport}
          >
            <HugeiconsIcon icon={Upload02Icon} size={11} strokeWidth={2} />
            Import
          </Button>
        </div>

        <div className="flex flex-col gap-0.5">
          {/* Hard-coded Default entry */}
          <div
            onMouseEnter={() => handleHoverIn(null)}
            onMouseLeave={handleHoverOut}
            className={cn(
              "group flex cursor-pointer items-center justify-between rounded-md px-2 py-1.5 text-[12px] transition-colors",
              activeId === DEFAULT_ENTRY_ID
                ? "bg-accent/60 text-accent-foreground"
                : "hover:bg-accent/40",
            )}
            onClick={() => void handleSelect(DEFAULT_ENTRY_ID)}
          >
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="font-medium">Default (System)</span>
              <span className="text-[10px] text-muted-foreground">Uses the built-in globals.css theme</span>
            </div>
          </div>

          {/* JSON themes from Rust */}
          {themes.map((t) => (
            <div
              key={t.id}
              onMouseEnter={() => handleHoverIn(t)}
              onMouseLeave={handleHoverOut}
              className={cn(
                "group flex cursor-pointer items-center justify-between rounded-md px-2 py-1.5 text-[12px] transition-colors",
                t.id === activeId
                  ? "bg-accent/60 text-accent-foreground"
                  : "hover:bg-accent/40",
              )}
              onClick={() => void handleSelect(t.id)}
            >
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="font-medium">{t.name}</span>
                {t.author && (
                  <span className="text-[10px] text-muted-foreground">{t.author}</span>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                <button
                  type="button"
                  title="Export"
                  className="flex h-6 w-6 items-center justify-center rounded hover:bg-muted"
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleExport(t.id);
                  }}
                >
                  <HugeiconsIcon icon={Download02Icon} size={12} strokeWidth={2} />
                </button>
                {!t.builtin && (
                  <button
                    type="button"
                    title="Delete"
                    className="flex h-6 w-6 items-center justify-center rounded text-destructive hover:bg-destructive/10"
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleDelete(t.id);
                    }}
                  >
                    <HugeiconsIcon icon={Delete02Icon} size={12} strokeWidth={2} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
