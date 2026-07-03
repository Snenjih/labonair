import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { Download01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useUpdaterStore } from "./updaterStore";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function UpdaterDialog() {
  const status = useUpdaterStore((s) => s.status);
  const dialogOpen = useUpdaterStore((s) => s.dialogOpen);
  const install = useUpdaterStore((s) => s.install);
  const closeDialog = useUpdaterStore((s) => s.closeDialog);

  const visible =
    dialogOpen && (status.kind === "available" || status.kind === "downloading" || status.kind === "ready");

  if (!visible) return null;

  const update = status.kind === "available" ? status.update : null;
  const downloading = status.kind === "downloading";
  const ready = status.kind === "ready";
  const progress =
    downloading && status.contentLength
      ? Math.min(100, (status.downloaded / status.contentLength) * 100)
      : null;

  return (
    <Dialog
      open={visible}
      onOpenChange={(o) => {
        if (!o && status.kind === "available") closeDialog();
      }}
    >
      <DialogContent className="sm:max-w-[400px] gap-0 p-0 overflow-hidden">
        {/* Header */}
        <div className="flex items-start gap-3 border-b border-border/60 px-5 py-4">
          <div
            className={cn(
              "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg",
              ready ? "bg-primary/12 text-primary" : "bg-success/12 text-success",
            )}
          >
            <HugeiconsIcon icon={Download01Icon} size={16} strokeWidth={2} />
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground leading-snug">
              {ready
                ? "Update ready to install"
                : downloading
                  ? "Downloading update…"
                  : `Labonair ${update?.version} is available`}
            </p>
            <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">
              {ready
                ? "Labonair will restart to finish installing."
                : downloading
                  ? progress !== null
                    ? `${progress.toFixed(0)}% — ${formatBytes(status.downloaded)}`
                    : formatBytes(status.downloaded)
                  : update?.body?.trim()
                    ? update.body.length > 120
                      ? `${update.body.slice(0, 120).trimEnd()}…`
                      : update.body
                    : "A new version is ready to install."}
            </p>
          </div>
        </div>

        {/* Progress */}
        {downloading && (
          <div className="px-5 py-3 border-b border-border/40">
            {progress !== null ? (
              <Progress value={progress} className="h-1.5" />
            ) : (
              <Progress value={undefined} className="h-1.5 animate-pulse" />
            )}
          </div>
        )}

        {/* Footer */}
        <DialogFooter className="px-5 py-3">
          {status.kind === "available" && (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-3 text-[12px] text-muted-foreground hover:text-foreground"
                onClick={closeDialog}
              >
                Later
              </Button>
              <Button size="sm" className="h-7 px-3 text-[12px]" onClick={() => void install()}>
                Install &amp; restart
              </Button>
            </>
          )}
          {(downloading || ready) && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-3 text-[12px] text-muted-foreground hover:text-foreground"
              onClick={closeDialog}
              disabled={downloading}
            >
              {downloading ? "Installing…" : "Close"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
