import { Button } from "@/components/ui/button";
import { useUpdaterStore } from "@/modules/updater/updaterStore";

export function UpdaterButton() {
  const status = useUpdaterStore((s) => s.status);
  const install = useUpdaterStore((s) => s.install);

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
      <Button
        size="sm"
        variant="outline"
        className="h-6 shrink-0 gap-1.5 border-emerald-500/40 px-2 text-[11px] text-emerald-500 hover:border-emerald-500/60 hover:bg-emerald-500/10 hover:text-emerald-400"
        onClick={() => void install()}
      >
        <span className="size-1.5 shrink-0 rounded-full bg-emerald-500" />
        Update and restart
      </Button>
    );
  }

  if (status.kind === "downloading") {
    const pct =
      status.contentLength && status.contentLength > 0
        ? Math.round((status.downloaded / status.contentLength) * 100)
        : null;
    return (
      <Button
        size="sm"
        variant="outline"
        disabled
        className="h-6 shrink-0 px-2 text-[11px]"
      >
        {pct !== null ? `Downloading… ${pct}%` : "Downloading…"}
      </Button>
    );
  }

  // status.kind === "ready"
  return (
    <Button
      size="sm"
      variant="outline"
      disabled
      className="h-6 shrink-0 px-2 text-[11px]"
    >
      Restarting…
    </Button>
  );
}
