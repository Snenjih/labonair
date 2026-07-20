import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useMemo, useState } from "react";
import { ALL_HOST_ICONS, HOST_ICON_CATEGORIES, resolveHostIcon } from "../lib/icons";
import { initials } from "../lib/initials";
import { HostIconGlyph } from "./HostIconGlyph";

interface HostIconPickerProps {
  /** Persisted icon id, or null/undefined when the host still uses the initials avatar. */
  value: string | null | undefined;
  onChange: (iconId: string | null) => void;
  /** Host name, used for the initials fallback shown on the trigger button. */
  name: string;
}

/**
 * Icon-picker button + popover for the Host edit panel header. Selecting an
 * icon (or resetting) calls onChange only — callers wire that into their own
 * form state so it flows through the existing autosave, never invoking the
 * backend directly here.
 */
export function HostIconPicker({ value, onChange, name }: HostIconPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<(typeof HOST_ICON_CATEGORIES)[number]["id"]>("os");

  const selected = resolveHostIcon(value);

  const visibleIcons = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q) {
      return ALL_HOST_ICONS.filter(
        (icon) => icon.label.toLowerCase().includes(q) || icon.keywords?.some((k) => k.includes(q)),
      );
    }
    return HOST_ICON_CATEGORIES.find((c) => c.id === category)?.icons ?? [];
  }, [query, category]);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          title="Choose icon"
          className="relative flex size-9 shrink-0 items-center justify-center rounded-lg border border-border/50 bg-muted/40 text-sm font-semibold text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          {selected ? <HostIconGlyph icon={selected} size={17} /> : initials(name) || "?"}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        onOpenAutoFocus={(e) => e.preventDefault()}
        className="w-72 overflow-hidden rounded-lg border border-border/60 bg-popover p-0 shadow-xl"
      >
        <div className="border-b border-border/60 p-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search icons…"
            className="h-8 text-xs"
            autoFocus
          />
        </div>

        {!query.trim() && (
          <Tabs value={category} onValueChange={(v) => setCategory(v as typeof category)}>
            <TabsList className="mx-2 mt-2 mb-0 grid grid-cols-4">
              {HOST_ICON_CATEGORIES.map((c) => (
                <TabsTrigger key={c.id} value={c.id} className="text-[11px]">
                  {c.label.split(" ")[0]}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        )}

        <div className="grid max-h-56 grid-cols-6 gap-1 overflow-y-auto p-2">
          {visibleIcons.length === 0 && (
            <p className="col-span-6 py-4 text-center text-[11px] text-muted-foreground">No matches</p>
          )}
          {visibleIcons.map((icon) => (
            <button
              key={icon.id}
              type="button"
              title={icon.label}
              onClick={() => {
                onChange(icon.id);
                setOpen(false);
              }}
              className={cn(
                "flex size-9 items-center justify-center rounded-md border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                icon.id === selected?.id ? "border-accent bg-accent text-foreground" : "border-transparent",
              )}
            >
              <HostIconGlyph icon={icon} size={16} />
            </button>
          ))}
        </div>

        <div className="border-t border-border/60 p-2">
          <button
            type="button"
            onClick={() => {
              onChange(null);
              setOpen(false);
            }}
            className="w-full rounded-md px-2 py-1.5 text-left text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            Reset to initials
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
