import { cn } from "@/lib/utils";
import { motion } from "motion/react";
import type { Group, Host } from "../types";

interface HostCardProps {
  host: Host;
  isSelected: boolean;
  onClick: () => void;
  group?: Group;
}

function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return "just now";
}

function initials(name: string): string {
  return name
    .split(/[\s\-_]+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

export function HostCard({ host, isSelected, onClick, group }: HostCardProps) {
  return (
    <motion.div
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
      onClick={onClick}
      className={cn(
        "flex cursor-pointer flex-col gap-3 rounded-xl border border-border bg-card p-4 transition-all select-none",
        isSelected
          ? "ring-2 ring-primary bg-accent/40 border-primary/30"
          : "hover:bg-accent/20",
      )}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-sm font-semibold text-muted-foreground">
          {initials(host.name) || "?"}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-foreground leading-tight">{host.name}</p>
          <p className="truncate text-xs text-muted-foreground mt-0.5">
            {host.username}@{host.host_address}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-mono text-muted-foreground">
          :{host.port}
        </span>
        {group && (
          <span className="flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
            <span>{group.icon ?? "📁"}</span>
            <span>{group.name}</span>
          </span>
        )}
        {host.auth_method === "key" && (
          <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
            key
          </span>
        )}
        {host.last_connected_at && (
          <span className="ml-auto text-[11px] text-muted-foreground/60">
            {relativeTime(host.last_connected_at)}
          </span>
        )}
      </div>
    </motion.div>
  );
}
