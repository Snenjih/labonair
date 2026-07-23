import {
  ArrowDown01Icon,
  ArrowRight01Icon,
  Delete01Icon,
  GitBranchIcon,
  PlusSignIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { useNotificationStore } from "@/modules/notifications/store/useNotificationStore";
import { git } from "../lib/gitInvoke";
import { useSourceControlStore } from "../store/sourceControlStore";
import type { StashEntry } from "../types";

interface StashPanelProps {
  repoRoot: string;
  sessionId?: string;
  onRefresh: () => void;
}

// ─── Stash entry row ──────────────────────────────────────────────────────────

interface StashEntryRowProps {
  entry: StashEntry;
  repoRoot: string;
  sessionId?: string;
  onRefresh: () => void;
}

function StashEntryRow({ entry, repoRoot, sessionId, onRefresh }: StashEntryRowProps) {
  const [actionLoading, setActionLoading] = useState<"apply" | "pop" | "drop" | null>(null);
  const [showDropConfirm, setShowDropConfirm] = useState(false);

  async function handleApply() {
    setActionLoading("apply");
    try {
      await git.stashApply(repoRoot, entry.hash, sessionId);
      onRefresh();
    } catch (e) {
      const msg = String(e);
      const isConflict = msg.includes("conflict") || msg.includes("CONFLICT");
      useNotificationStore.getState().addActionResultNotification({
        type: "error",
        title: "Stash Apply Failed",
        message: isConflict ? "Conflicts after stash apply — resolve before proceeding" : msg,
      });
    } finally {
      setActionLoading(null);
    }
  }

  async function handlePop() {
    setActionLoading("pop");
    try {
      await git.stashPop(repoRoot, entry.hash, sessionId);
      onRefresh();
    } catch (e) {
      const msg = String(e);
      const isConflict = msg.includes("conflict") || msg.includes("CONFLICT");
      useNotificationStore.getState().addActionResultNotification({
        type: "error",
        title: "Stash Pop Failed",
        message: isConflict ? "Conflicts after stash apply — resolve before proceeding" : msg,
      });
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDrop() {
    setActionLoading("drop");
    try {
      await git.stashDrop(repoRoot, entry.hash, sessionId);
      setShowDropConfirm(false);
      onRefresh();
    } catch (e) {
      useNotificationStore
        .getState()
        .addActionResultNotification({ type: "error", title: "Stash Drop Failed", message: String(e) });
    } finally {
      setActionLoading(null);
    }
  }

  const displayMessage = entry.message.trim() || "WIP";
  const isLoading = actionLoading !== null;

  return (
    <>
      <div className="group/stash flex h-[22px] cursor-default items-center gap-1 rounded px-1 transition-colors hover:bg-accent/30">
        {/* Index badge */}
        <span className="shrink-0 rounded bg-muted/60 px-1 text-[9px] font-mono text-muted-foreground/60">
          {entry.index}
        </span>

        {/* Message */}
        <span className="flex-1 truncate text-[11px] text-foreground/80" title={displayMessage}>
          {displayMessage}
        </span>

        {/* Branch chip */}
        {entry.branch && (
          <span className="flex shrink-0 items-center gap-0.5 rounded bg-muted/40 px-1 text-[9px] text-muted-foreground/50">
            <HugeiconsIcon icon={GitBranchIcon} size={8} strokeWidth={2} />
            <span className="max-w-[60px] truncate">{entry.branch}</span>
          </span>
        )}

        {/* Action buttons — visible on hover */}
        <div
          className={cn(
            "flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover/stash:opacity-100",
            isLoading && "opacity-100",
          )}
        >
          {/* Apply */}
          <button
            type="button"
            className="flex h-4 w-4 items-center justify-center rounded text-[9px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={() => void handleApply()}
            disabled={isLoading}
            title="Apply (keep stash)"
          >
            {actionLoading === "apply" ? (
              <Spinner className="size-2.5" />
            ) : (
              <span className="text-[8px] font-bold">A</span>
            )}
          </button>

          {/* Pop */}
          <button
            type="button"
            className="flex h-4 w-4 items-center justify-center rounded text-[9px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={() => void handlePop()}
            disabled={isLoading}
            title="Pop (apply and drop)"
          >
            {actionLoading === "pop" ? (
              <Spinner className="size-2.5" />
            ) : (
              <span className="text-[8px] font-bold">P</span>
            )}
          </button>

          {/* Drop */}
          <button
            type="button"
            className="flex h-4 w-4 items-center justify-center rounded text-muted-foreground hover:bg-red-500/20 hover:text-red-500"
            onClick={() => setShowDropConfirm(true)}
            disabled={isLoading}
            title="Drop stash"
          >
            {actionLoading === "drop" ? (
              <Spinner className="size-2.5" />
            ) : (
              <HugeiconsIcon icon={Delete01Icon} size={9} strokeWidth={2} />
            )}
          </button>
        </div>
      </div>

      {/* Drop confirm dialog */}
      <AlertDialog open={showDropConfirm} onOpenChange={setShowDropConfirm}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Drop stash?</AlertDialogTitle>
            <AlertDialogDescription>
              Drop{" "}
              <span className="font-mono text-foreground">
                stash@{"{"}
                {entry.index}
                {"}"}
              </span>
              ? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void handleDrop()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Drop
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ─── StashPanel ───────────────────────────────────────────────────────────────

export function StashPanel({ repoRoot, sessionId, onRefresh }: StashPanelProps) {
  const stashEntries = useSourceControlStore((s) => s.stashEntries);

  const [collapsed, setCollapsed] = useState(false);
  const [showStashForm, setShowStashForm] = useState(false);
  const [stashMessage, setStashMessage] = useState("");
  const [isStashing, setIsStashing] = useState(false);

  async function doStash() {
    setIsStashing(true);
    try {
      await git.stashPush(repoRoot, stashMessage.trim() || undefined, undefined, sessionId);
      setStashMessage("");
      setShowStashForm(false);
      onRefresh();
    } catch (e) {
      useNotificationStore
        .getState()
        .addActionResultNotification({ type: "error", title: "Stash Failed", message: String(e) });
    } finally {
      setIsStashing(false);
    }
  }

  function handleNewStashClick(e: React.MouseEvent) {
    e.stopPropagation();
    setShowStashForm(true);
    setCollapsed(false);
  }

  return (
    <div className="mb-1">
      {/* Section header */}
      <div
        className="group/hdr flex h-6 cursor-pointer items-center gap-1 px-2 transition-colors hover:bg-muted/20"
        onClick={() => setCollapsed((c) => !c)}
      >
        <HugeiconsIcon
          icon={collapsed ? ArrowRight01Icon : ArrowDown01Icon}
          size={9}
          strokeWidth={2.5}
          className="shrink-0 text-muted-foreground/40"
        />
        <span className="flex-1 select-none text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60 group-hover/hdr:text-muted-foreground">
          Stashes
        </span>
        <span className="shrink-0 font-mono text-[9px] tabular-nums text-muted-foreground/40">
          {stashEntries.length}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="ml-0.5 size-4 opacity-0 transition-opacity group-hover/hdr:opacity-100"
          title="New Stash"
          onClick={handleNewStashClick}
        >
          <HugeiconsIcon icon={PlusSignIcon} size={9} strokeWidth={2} />
        </Button>
      </div>

      {/* Inline new stash form */}
      {showStashForm && !collapsed && (
        <div className="px-2 pb-1">
          <input
            autoFocus
            value={stashMessage}
            onChange={(e) => setStashMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void doStash();
              if (e.key === "Escape") setShowStashForm(false);
            }}
            placeholder="Stash message (optional)"
            className="w-full rounded border border-border/60 bg-background/60 px-2 py-0.5 text-[11px] outline-none placeholder:text-muted-foreground/40 focus:border-border focus:ring-0"
          />
          <div className="mt-1 flex gap-1">
            <Button
              size="sm"
              className="h-6 flex-1 text-xs"
              onClick={() => void doStash()}
              disabled={isStashing}
            >
              {isStashing ? <Spinner className="size-3" /> : "Stash"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs"
              onClick={() => {
                setShowStashForm(false);
                setStashMessage("");
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Stash entries */}
      {!collapsed &&
        (stashEntries.length === 0 ? (
          <div className="px-3 py-2 text-[11px] text-muted-foreground/50">No stashes</div>
        ) : (
          <div className="px-1 pb-1">
            {stashEntries.map((entry) => (
              <StashEntryRow
                key={`stash-${entry.index}-${entry.hash}`}
                entry={entry}
                repoRoot={repoRoot}
                sessionId={sessionId}
                onRefresh={onRefresh}
              />
            ))}
          </div>
        ))}
    </div>
  );
}
