import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
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
import {
  ArrowDown01Icon,
  ArrowRight01Icon,
  PlusSignIcon,
  Delete01Icon,
  Cancel01Icon,
  GitBranchIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { cn } from "@/lib/utils";
import { useSourceControlStore } from "../store/sourceControlStore";
import { git } from "../lib/gitInvoke";
import type { StashEntry } from "../types";

interface StashPanelProps {
  repoRoot: string;
  onRefresh: () => void;
}

// ─── Stash entry row ──────────────────────────────────────────────────────────

interface StashEntryRowProps {
  entry: StashEntry;
  repoRoot: string;
  onRefresh: () => void;
}

function StashEntryRow({ entry, repoRoot, onRefresh }: StashEntryRowProps) {
  const setError = useSourceControlStore((s) => s.setStashError);
  const [actionLoading, setActionLoading] = useState<"apply" | "pop" | "drop" | null>(null);
  const [showDropConfirm, setShowDropConfirm] = useState(false);

  async function handleApply() {
    setActionLoading("apply");
    setError(null);
    try {
      await git.stashApply(repoRoot, entry.hash);
      onRefresh();
    } catch (e) {
      const msg = String(e);
      if (msg.includes("conflict") || msg.includes("CONFLICT")) {
        setError("Conflicts after stash apply — resolve before proceeding");
      } else {
        setError(msg);
      }
    } finally {
      setActionLoading(null);
    }
  }

  async function handlePop() {
    setActionLoading("pop");
    setError(null);
    try {
      await git.stashPop(repoRoot, entry.hash);
      onRefresh();
    } catch (e) {
      const msg = String(e);
      if (msg.includes("conflict") || msg.includes("CONFLICT")) {
        setError("Conflicts after stash apply — resolve before proceeding");
      } else {
        setError(msg);
      }
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDrop() {
    setActionLoading("drop");
    setError(null);
    try {
      await git.stashDrop(repoRoot, entry.hash);
      setShowDropConfirm(false);
      onRefresh();
    } catch (e) {
      setError(String(e));
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
            isLoading && "opacity-100"
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
              <span className="font-mono text-foreground">stash@{"{"}
              {entry.index}
              {"}"}</span>
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

export function StashPanel({ repoRoot, onRefresh }: StashPanelProps) {
  const stashEntries = useSourceControlStore((s) => s.stashEntries);
  const stashError = useSourceControlStore((s) => s.stashError);
  const setStashError = useSourceControlStore((s) => s.setStashError);

  const [collapsed, setCollapsed] = useState(false);
  const [showStashForm, setShowStashForm] = useState(false);
  const [stashMessage, setStashMessage] = useState("");
  const [isStashing, setIsStashing] = useState(false);

  async function doStash() {
    setIsStashing(true);
    setStashError(null);
    try {
      await git.stashPush(repoRoot, stashMessage.trim() || undefined);
      setStashMessage("");
      setShowStashForm(false);
      onRefresh();
    } catch (e) {
      setStashError(String(e));
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

      {/* Stash error banner */}
      {stashError && (
        <div className="mx-2 mb-1 flex items-start gap-1.5 rounded border border-red-500/30 bg-red-500/10 px-2 py-1.5">
          <p className="flex-1 text-[10px] text-red-400">{stashError}</p>
          <button
            type="button"
            onClick={() => setStashError(null)}
            className="mt-0.5 shrink-0 text-red-400/60 hover:text-red-400"
          >
            <HugeiconsIcon icon={Cancel01Icon} size={9} strokeWidth={2} />
          </button>
        </div>
      )}

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
      {!collapsed && (
        stashEntries.length === 0 ? (
          <div className="px-3 py-2 text-[11px] text-muted-foreground/50">No stashes</div>
        ) : (
          <div className="px-1 pb-1">
            {stashEntries.map((entry) => (
              <StashEntryRow
                key={`stash-${entry.index}-${entry.hash}`}
                entry={entry}
                repoRoot={repoRoot}
                onRefresh={onRefresh}
              />
            ))}
          </div>
        )
      )}
    </div>
  );
}
