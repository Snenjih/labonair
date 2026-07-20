import { cn } from "@/lib/utils";
import { resolveHostIcon } from "../lib/icons";
import { initials } from "../lib/initials";
import type { Host } from "../types";
import { HostIconGlyph } from "./HostIconGlyph";

type PingStatus = "online" | "offline" | "checking";

const SIZE_MAP = {
  md: {
    box: "size-10 shadow-sm",
    text: "text-sm",
    star: "text-[10px]",
    dot: "size-2.5",
    glow: "bg-success [box-shadow:0_0_6px_color-mix(in_oklch,var(--color-success)_70%,transparent)]",
    glyph: 18,
  },
  sm: {
    box: "size-8",
    text: "text-[11px]",
    star: "text-[8px]",
    dot: "size-2",
    glow: "bg-success [box-shadow:0_0_4px_color-mix(in_oklch,var(--color-success)_70%,transparent)]",
    glyph: 15,
  },
} as const;

interface HostAvatarProps {
  host: Pick<Host, "name" | "icon" | "pin_to_top">;
  size: keyof typeof SIZE_MAP;
  pingStatus?: PingStatus;
  className?: string;
}

/** Shared host avatar: an assigned icon, falling back to name initials when none is set. */
export function HostAvatar({ host, size, pingStatus, className }: HostAvatarProps) {
  const cfg = SIZE_MAP[size];
  const resolved = resolveHostIcon(host.icon);

  return (
    <div
      className={cn(
        "relative flex shrink-0 items-center justify-center rounded-lg border border-border/50 bg-muted/40 font-semibold text-muted-foreground",
        cfg.box,
        cfg.text,
        className,
      )}
    >
      {host.pin_to_top && <span className={cn("absolute -top-1 -right-1 text-primary", cfg.star)}>★</span>}
      {resolved ? <HostIconGlyph icon={resolved} size={cfg.glyph} /> : initials(host.name) || "?"}
      <span
        className={cn(
          "absolute -bottom-0.5 -right-0.5 rounded-full border-2 border-background",
          cfg.dot,
          pingStatus === "online" && cfg.glow,
          pingStatus === "offline" && "bg-destructive",
          (!pingStatus || pingStatus === "checking") && "bg-muted-foreground/40 animate-pulse",
        )}
      />
    </div>
  );
}
