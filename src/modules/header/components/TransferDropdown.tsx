import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { type TransferJob, type TransferStatus, useTransferStore } from "@/modules/sftp/store/transferStore";
import { Cancel01Icon, ArrowUpDownIcon, Copy01Icon, ArrowDown01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export function TransferDropdown() {
  const { jobs, clearCompleted, cancelJob, resolveConflict } = useTransferStore();

  const activeCount = jobs.filter((j) => j.status === "queued" || j.status === "running").length;
  const hasConflicts = jobs.some((j) => !isFailed(j.status) && j.status === "paused" && j.conflict);

  const conflictJob = jobs.find((j) => !isFailed(j.status) && j.status === "paused" && j.conflict);

  return (
    <>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="relative size-7 shrink-0 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
            title="Transfers"
          >
            <HugeiconsIcon icon={ArrowUpDownIcon} size={16} strokeWidth={1.75} />
            {activeCount > 0 && (
              <span
                className={cn(
                  "absolute -top-0.5 -right-0.5 min-w-[14px] h-3.5 px-0.5 rounded-full text-[9px] font-bold flex items-center justify-center text-white",
                  hasConflicts ? "bg-destructive animate-pulse" : "bg-primary",
                )}
              >
                {activeCount}
              </span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-[360px] p-0 max-h-[480px] flex flex-col">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
            <span className="text-sm font-semibold">Transfers</span>
            <button
              onClick={clearCompleted}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Clear completed
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {jobs.length === 0 ? (
              <div className="flex items-center justify-center h-20 text-sm text-muted-foreground select-none">
                No active transfers
              </div>
            ) : (
              <div className="divide-y divide-border/40">
                {jobs.map((job) => (
                  <TransferItem key={job.id} job={job} onCancel={() => cancelJob(job.id)} />
                ))}
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>

      {conflictJob && (
        <ConflictModal
          job={conflictJob}
          onResolve={(resolution, newName) => resolveConflict(conflictJob.id, resolution, newName)}
        />
      )}
    </>
  );
}

function FailedBadge({ message }: { message: string }) {
  const [tooltip, setTooltip] = useState(false);
  const [copied, setCopied] = useState(false);
  const badgeRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);

  // Close on any outside click
  useEffect(() => {
    if (!tooltip) return;
    function onPointerDown(e: PointerEvent) {
      if (!badgeRef.current?.contains(e.target as Node)) {
        setTooltip(false);
        setCopied(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [tooltip]);

  function handleClick() {
    void navigator.clipboard.writeText(message).then(() => setCopied(true));
    if (badgeRef.current) {
      const r = badgeRef.current.getBoundingClientRect();
      // Position the tooltip above the badge, right-aligned to it
      setPos({ top: r.top - 8, right: window.innerWidth - r.right });
    }
    setTooltip(true);
  }

  const tooltipEl =
    tooltip && pos
      ? createPortal(
          <div
            style={{
              position: "fixed",
              top: pos.top,
              right: pos.right,
              zIndex: 9999,
              transform: "translateY(-100%)",
            }}
            className={cn(
              "min-w-[200px] max-w-[280px]",
              "bg-popover border border-border rounded-lg shadow-xl px-3 py-2.5",
              "flex flex-col gap-1.5 pointer-events-none",
            )}
          >
            <div className="flex items-center gap-1.5">
              <HugeiconsIcon icon={Copy01Icon} size={11} className="shrink-0 text-muted-foreground" />
              <span className="text-[10px] font-medium text-muted-foreground">
                {copied ? "Copied to clipboard ✓" : "Error message"}
              </span>
            </div>
            <p className="text-[11px] font-mono text-destructive break-all leading-snug">{message}</p>
            {/* Arrow pointing down toward the badge */}
            <div
              style={{ position: "absolute", bottom: -5, right: 8, width: 10, height: 10 }}
              className="bg-popover border-r border-b border-border rotate-45"
            />
          </div>,
          document.body,
        )
      : null;

  return (
    <span className="shrink-0">
      <button
        ref={badgeRef}
        onClick={handleClick}
        onBlur={() => {
          setTooltip(false);
          setCopied(false);
        }}
        className={cn(
          "text-[10px] font-semibold px-1.5 py-0.5 rounded-full transition-colors",
          "bg-destructive/20 text-destructive hover:bg-destructive/30 cursor-pointer",
        )}
        title="Click to copy error"
      >
        failed
      </button>
      {tooltipEl}
    </span>
  );
}

function TransferItem({ job, onCancel }: { job: TransferJob; onCancel: () => void }) {
  const fileName = job.dest_path.split("/").pop() ?? job.dest_path;
  const pct = job.bytes_total > 0 ? Math.round((job.bytes_transferred / job.bytes_total) * 100) : 0;
  const isActive = job.status === "running" || job.status === "queued";
  const failedMsg = isFailed(job.status) ? job.status.failed : null;
  const steps = useTransferStore((s) => s.stepsByJob[job.id]);
  const [logOpen, setLogOpen] = useState(false);

  return (
    <div className="px-3 py-2 flex flex-col gap-1.5">
      <div className="flex items-center gap-2 min-w-0">
        <span className="shrink-0 text-[13px]">{job.direction === "download" ? "⬇" : "⬆"}</span>
        <span className="flex-1 text-sm font-medium truncate min-w-0">{fileName}</span>
        {steps && steps.length > 0 && (
          <button
            onClick={() => setLogOpen((v) => !v)}
            className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
            title="Show transfer log"
          >
            <HugeiconsIcon
              icon={ArrowDown01Icon}
              size={12}
              strokeWidth={2}
              className={cn("transition-transform", logOpen && "rotate-180")}
            />
          </button>
        )}
        {failedMsg !== null ? (
          <FailedBadge message={failedMsg} />
        ) : (
          <span
            className={cn(
              "shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full",
              statusColorClass(job.status),
            )}
          >
            {statusLabel(job.status)}
          </span>
        )}
        {isActive && (
          <button
            onClick={onCancel}
            className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
            title="Cancel"
          >
            <HugeiconsIcon icon={Cancel01Icon} size={13} strokeWidth={2} />
          </button>
        )}
      </div>

      <div className="h-1 bg-muted rounded-full overflow-hidden">
        <div
          style={{ width: `${pct}%` }}
          className={cn("h-full rounded-full transition-all duration-300", statusProgressClass(job.status))}
        />
      </div>

      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground truncate">
          {job.src_path.split("/").slice(-2).join("/")} → {job.dest_path.split("/").slice(-2).join("/")}
        </span>
        <div className="shrink-0 ml-2 flex flex-col items-end gap-0.5">
          {job.status === "running" && (
            <span className="text-[10px] text-muted-foreground tabular-nums">
              {formatBytes(job.bytes_transferred)} / {formatBytes(job.bytes_total)}
            </span>
          )}
          {job.status === "running" && job.speed_bps > 0 && (
            <span className="text-[10px] text-muted-foreground tabular-nums">{formatBytes(job.speed_bps)}/s</span>
          )}
          {job.status === "completed" && (
            <span className="text-[10px] text-muted-foreground tabular-nums">{formatBytes(job.bytes_total)}</span>
          )}
        </div>
      </div>

      {logOpen && steps && steps.length > 0 && (
        <div className="mt-0.5 max-h-32 overflow-y-auto rounded bg-muted/30 px-2 py-1.5 flex flex-col gap-0.5">
          {steps.map((step, i) => (
            <div
              key={`${step.ts}-${i}`}
              className="text-[10px] font-mono text-muted-foreground leading-relaxed"
            >
              <span className="text-muted-foreground/60">{formatTimestamp(step.ts)}</span> {step.message}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ConflictModal({
  job,
  onResolve,
}: {
  job: TransferJob;
  onResolve: (resolution: "overwrite" | "skip" | "rename", newName?: string) => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState(job.dest_path.split("/").pop() ?? "file");

  const fileName = job.dest_path.split("/").pop() ?? job.dest_path;

  return (
    <Dialog open>
      <DialogContent className="sm:max-w-md" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>File Already Exists</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            The file{" "}
            <span className="font-mono text-foreground text-xs bg-muted px-1 py-0.5 rounded">{fileName}</span>{" "}
            already exists at{" "}
            <span className="font-mono text-xs text-muted-foreground">{job.conflict?.dest_path}</span>. What
            would you like to do?
          </p>

          {renaming ? (
            <div className="flex gap-2">
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="flex-1 h-8 text-sm bg-background border border-border rounded px-2 outline-none focus:ring-1 focus:ring-primary"
                placeholder="New file name"
              />
              <Button size="sm" onClick={() => onResolve("rename", newName)} disabled={!newName.trim()}>
                Rename
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setRenaming(false)}>
                Back
              </Button>
            </div>
          ) : (
            <div className="flex gap-2 flex-wrap">
              <Button size="sm" onClick={() => onResolve("overwrite")}>
                Overwrite
              </Button>
              <Button size="sm" variant="outline" onClick={() => onResolve("skip")}>
                Skip
              </Button>
              <Button size="sm" variant="outline" onClick={() => setRenaming(true)}>
                Rename…
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function isFailed(status: TransferStatus): status is { failed: string } {
  return typeof status === "object" && "failed" in status;
}

function statusLabel(status: TransferStatus): string {
  if (isFailed(status)) return "failed";
  return status;
}

function statusColorClass(status: TransferStatus): string {
  if (isFailed(status)) return "bg-destructive/20 text-destructive";
  switch (status) {
    case "running":
      return "bg-info/20 text-info";
    case "completed":
      return "bg-success/20 text-success";
    case "paused":
      return "bg-warning/20 text-warning";
    case "queued":
      return "bg-muted text-muted-foreground";
    case "cancelled":
      return "bg-muted text-muted-foreground line-through";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function statusProgressClass(status: TransferStatus): string {
  if (isFailed(status)) return "bg-destructive";
  switch (status) {
    case "running":
      return "bg-primary";
    case "completed":
      return "bg-success";
    case "paused":
      return "bg-warning";
    default:
      return "bg-muted-foreground";
  }
}

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, { hour12: false });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
