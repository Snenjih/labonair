import { cn } from "@/lib/utils";
import { useUpdaterStore } from "@/modules/updater/updaterStore";
import { Download01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

export function UpdaterButton() {
  const status = useUpdaterStore((s) => s.status);
  const openDialog = useUpdaterStore((s) => s.openDialog);

  if (
    status.kind === "idle" ||
    status.kind === "checking" ||
    status.kind === "uptodate" ||
    status.kind === "error"
  ) {
    return null;
  }

  if (status.kind === "available") {
    return (
      <button
        onClick={openDialog}
        title="Update available — click to install"
        className={cn(
          "group flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2.5",
          "border border-success/30 bg-success/8 text-success",
          "text-[11px] font-medium leading-none",
          "transition-all duration-150",
          "hover:border-success/50 hover:bg-success/15 hover:shadow-[0_0_0_2px_color-mix(in_srgb,var(--success)_12%,transparent)]",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-success/50",
        )}
      >
        <span className="relative flex size-1.5 shrink-0">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60" />
          <span className="relative inline-flex size-1.5 rounded-full bg-success" />
        </span>
        <HugeiconsIcon
          icon={Download01Icon}
          size={11}
          strokeWidth={2}
          className="shrink-0 opacity-80 group-hover:opacity-100"
        />
        <span>Update available</span>
      </button>
    );
  }

  if (status.kind === "downloading") {
    const pct =
      status.contentLength && status.contentLength > 0
        ? Math.round((status.downloaded / status.contentLength) * 100)
        : null;

    return (
      <div
        className={cn(
          "flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2.5",
          "border border-border/50 bg-muted/50 text-muted-foreground",
          "text-[11px] font-medium leading-none",
        )}
      >
        <HugeiconsIcon icon={Download01Icon} size={11} strokeWidth={2} className="shrink-0 animate-bounce" />
        <span>{pct !== null ? `Downloading ${pct}%` : "Downloading…"}</span>
      </div>
    );
  }

  // status.kind === "ready"
  return (
    <button
      onClick={openDialog}
      title="Update ready — click to restart"
      className={cn(
        "flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2.5",
        "border border-primary/30 bg-primary/8 text-primary",
        "text-[11px] font-medium leading-none",
        "transition-all duration-150",
        "hover:border-primary/50 hover:bg-primary/15",
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/50",
      )}
    >
      <span className="size-1.5 shrink-0 rounded-full bg-primary" />
      <span>Restart to update</span>
    </button>
  );
}
