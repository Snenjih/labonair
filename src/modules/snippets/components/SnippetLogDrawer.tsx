import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  Cancel01Icon,
  Delete02Icon,
  CheckmarkCircle02Icon,
  Alert02Icon,
  Loading03Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { useCommandSnippetsStore } from "../store/commandSnippetsStore";
import type { SnippetRunLog } from "../types";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function SnippetLogDrawer({ open, onClose }: Props) {
  const runLogs = useCommandSnippetsStore((s) => s.runLogs);
  const clearRunLogs = useCommandSnippetsStore((s) => s.clearRunLogs);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  // Auto-select the most recent run
  useEffect(() => {
    if (runLogs.length > 0 && (!selectedRunId || !runLogs.find((l) => l.runId === selectedRunId))) {
      setSelectedRunId(runLogs[0].runId);
    }
  }, [runLogs, selectedRunId]);

  const selectedLog = runLogs.find((l) => l.runId === selectedRunId);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ scaleY: 0, opacity: 0 }}
          animate={{ scaleY: 1, opacity: 1 }}
          exit={{ scaleY: 0, opacity: 0 }}
          transition={{ duration: 0.15, ease: "easeOut" }}
          style={{ transformOrigin: "bottom", height: 260, willChange: "transform, opacity" }}
          className="overflow-hidden border-t border-border/60 bg-card"
        >
          <div className="flex h-full flex-col">
            {/* Header */}
            <div className="flex h-9 shrink-0 items-center justify-between gap-2 border-b border-border/60 px-3">
              <span className="text-xs font-semibold text-muted-foreground">Snippet Logs</span>
              <div className="flex items-center gap-1">
                {runLogs.length > 0 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    title="Clear all logs"
                    onClick={clearRunLogs}
                  >
                    <HugeiconsIcon icon={Delete02Icon} size={12} strokeWidth={1.5} />
                  </Button>
                )}
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
                  <HugeiconsIcon icon={Cancel01Icon} size={13} strokeWidth={2} />
                </Button>
              </div>
            </div>

            {runLogs.length === 0 ? (
              <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
                No runs yet
              </div>
            ) : (
              <div className="flex min-h-0 flex-1">
                {/* Run list */}
                <div className="flex w-44 shrink-0 flex-col gap-px overflow-y-auto border-r border-border/60 p-1">
                  {runLogs.map((log) => (
                    <RunTab
                      key={log.runId}
                      log={log}
                      active={log.runId === selectedRunId}
                      onClick={() => setSelectedRunId(log.runId)}
                    />
                  ))}
                </div>

                {/* Log output */}
                <div className="min-w-0 flex-1">
                  {selectedLog ? (
                    <LogOutput log={selectedLog} />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                      Select a run
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function RunTab({ log, active, onClick }: { log: SnippetRunLog; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded px-2 py-1 text-left text-xs transition-colors",
        active ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/50"
      )}
    >
      <StatusIcon status={log.status} />
      <span className="min-w-0 flex-1 truncate">{log.snippetName}</span>
    </button>
  );
}

function StatusIcon({ status }: { status: SnippetRunLog["status"] }) {
  if (status === "running") {
    return (
      <HugeiconsIcon
        icon={Loading03Icon}
        size={12}
        strokeWidth={2}
        className="shrink-0 animate-spin text-muted-foreground"
      />
    );
  }
  if (status === "done") {
    return (
      <HugeiconsIcon
        icon={CheckmarkCircle02Icon}
        size={12}
        strokeWidth={2}
        className="shrink-0 text-success"
      />
    );
  }
  return (
    <HugeiconsIcon
      icon={Alert02Icon}
      size={12}
      strokeWidth={2}
      className="shrink-0 text-destructive"
    />
  );
}

function LogOutput({ log }: { log: SnippetRunLog }) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [log.lines.length]);

  return (
    <ScrollArea className="h-full">
      <pre className="p-2 font-mono text-[11px] leading-relaxed">
        {log.lines.length === 0 && log.status === "running" ? (
          <span className="text-muted-foreground">Running…</span>
        ) : null}
        {log.lines.map((line, i) => (
          <span
            key={i}
            className={cn(
              line.stream === "stderr" ? "text-error" : "text-foreground/90"
            )}
          >
            {line.data}
          </span>
        ))}
        {log.status !== "running" && log.exitCode !== undefined && (
          <span
            className={cn(
              "mt-1 block border-t border-border/40 pt-1 text-muted-foreground",
              log.exitCode !== 0 && "text-error"
            )}
          >
            {`[exit ${log.exitCode}]`}
          </span>
        )}
        <div ref={bottomRef} />
      </pre>
    </ScrollArea>
  );
}
