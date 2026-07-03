import { cn } from "@/lib/utils";

type ThemeThumbnailProps = {
  colors: Record<string, string>;
  className?: string;
};

export function ThemeThumbnail({ colors, className }: ThemeThumbnailProps) {
  const hasColors = Object.keys(colors).length > 0;

  const bg = hasColors ? (colors["background"] ?? "var(--background, #0f111a)") : "var(--background)";
  const sidebar = hasColors
    ? (colors["sidebar"] ??
      colors["secondary"] ??
      colors["muted"] ??
      "var(--sidebar, var(--secondary, #1e2130))")
    : "var(--sidebar, var(--secondary))";
  const primary = hasColors ? (colors["primary"] ?? "var(--primary, #6366f1)") : "var(--primary)";
  const border = hasColors ? (colors["border"] ?? "var(--border, #252836)") : "var(--border)";

  return (
    <div
      className={cn("relative flex h-[38px] w-[52px] shrink-0 overflow-hidden rounded border", className)}
      style={{ borderColor: border, backgroundColor: bg }}
    >
      {/* Sidebar strip */}
      <div className="h-full w-[13px]" style={{ backgroundColor: sidebar }} />

      {/* Content area */}
      <div className="flex flex-1 flex-col justify-end gap-[3px] p-[5px]">
        {/* Top bar hint */}
        <div
          className="mb-[2px] h-[3px] w-full rounded-[1px]"
          style={{ backgroundColor: primary, opacity: 0.15 }}
        />
        {/* Button-like blocks */}
        <div className="flex gap-[3px]">
          <div
            className="h-[4px] w-[14px] rounded-[1px]"
            style={{ backgroundColor: primary, opacity: 0.8 }}
          />
          <div
            className="h-[4px] w-[8px] rounded-[1px]"
            style={{ backgroundColor: primary, opacity: 0.35 }}
          />
        </div>
        <div className="h-[3px] w-[20px] rounded-[1px]" style={{ backgroundColor: primary, opacity: 0.2 }} />
      </div>
    </div>
  );
}
