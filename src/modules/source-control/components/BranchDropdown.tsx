import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
  Tick02Icon,
  Delete01Icon,
  ArrowDown01Icon,
  ArrowRight01Icon,
  Tag01Icon,
  PlusSignIcon,
  Cancel01Icon,
  ArrowUp01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { cn } from "@/lib/utils";
import { useSourceControlStore } from "../store/sourceControlStore";
import { git } from "../lib/gitInvoke";
import { NewBranchDialog } from "./NewBranchDialog";
import type { Branch } from "../types";

interface BranchDropdownProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: React.ReactNode;
  repoRoot: string;
  currentBranch: string;
  onRefresh: () => void;
}

// ─── Tag section ─────────────────────────────────────────────────────────────

interface TagSectionProps {
  repoRoot: string;
  tags: string[];
  onRefresh: () => void;
}

function TagSection({ repoRoot, tags, onRefresh }: TagSectionProps) {
  const [collapsed, setCollapsed] = useState(true);
  const [showNewTagForm, setShowNewTagForm] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [newTagMessage, setNewTagMessage] = useState("");
  const [newTagFrom, setNewTagFrom] = useState("");
  const [tagLoading, setTagLoading] = useState<string | null>(null);
  const [tagError, setTagError] = useState<string | null>(null);
  const [deleteTagName, setDeleteTagName] = useState<string | null>(null);

  async function handleCreateTag() {
    const trimmedName = newTagName.trim();
    if (!trimmedName) return;
    setTagLoading("create");
    setTagError(null);
    try {
      await git.createTag(
        repoRoot,
        trimmedName,
        newTagMessage.trim() || undefined,
        newTagFrom.trim() || undefined
      );
      setNewTagName("");
      setNewTagMessage("");
      setNewTagFrom("");
      setShowNewTagForm(false);
      onRefresh();
    } catch (e) {
      setTagError(String(e));
    } finally {
      setTagLoading(null);
    }
  }

  async function handlePushTag(name: string) {
    setTagLoading(`push:${name}`);
    try {
      await git.pushTag(repoRoot, name);
      onRefresh();
    } catch (e) {
      setTagError(String(e));
    } finally {
      setTagLoading(null);
    }
  }

  async function handleDeleteTag(name: string) {
    setTagLoading(`delete:${name}`);
    try {
      await git.deleteTag(repoRoot, name);
      setDeleteTagName(null);
      onRefresh();
    } catch (e) {
      setTagError(String(e));
    } finally {
      setTagLoading(null);
    }
  }

  return (
    <>
      <div className="border-t border-border/40 pt-1">
        {/* Tags header */}
        <div
          className="flex h-6 cursor-pointer items-center gap-1 px-2 hover:bg-accent/20"
          onClick={() => setCollapsed((c) => !c)}
        >
          <HugeiconsIcon
            icon={collapsed ? ArrowRight01Icon : ArrowDown01Icon}
            size={9}
            strokeWidth={2.5}
            className="shrink-0 text-muted-foreground/40"
          />
          <HugeiconsIcon
            icon={Tag01Icon}
            size={10}
            strokeWidth={2}
            className="shrink-0 text-muted-foreground/50"
          />
          <span className="flex-1 select-none text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
            Tags ({tags.length})
          </span>
          <button
            type="button"
            className="flex h-4 w-4 items-center justify-center rounded text-muted-foreground/50 hover:bg-muted hover:text-foreground"
            onClick={(e) => {
              e.stopPropagation();
              setShowNewTagForm(true);
              setCollapsed(false);
            }}
            title="New Tag"
          >
            <HugeiconsIcon icon={PlusSignIcon} size={9} strokeWidth={2} />
          </button>
        </div>

        {!collapsed && (
          <div className="pb-1">
            {/* Error */}
            {tagError && (
              <div className="mx-2 mb-1 flex items-center gap-1.5 rounded border border-red-500/30 bg-red-500/10 px-2 py-1">
                <p className="flex-1 text-[10px] text-red-400">{tagError}</p>
                <button
                  type="button"
                  onClick={() => setTagError(null)}
                  className="text-red-400/60 hover:text-red-400"
                >
                  <HugeiconsIcon icon={Cancel01Icon} size={9} strokeWidth={2} />
                </button>
              </div>
            )}

            {/* New tag form */}
            {showNewTagForm && (
              <div className="mx-2 mb-1 space-y-1 rounded border border-border/60 bg-muted/20 p-2">
                <input
                  autoFocus
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  placeholder="Tag name (required)"
                  className="w-full rounded bg-transparent px-1 py-0.5 text-[11px] outline-none ring-1 ring-border/60 placeholder:text-muted-foreground/40 focus:ring-border"
                />
                <input
                  value={newTagMessage}
                  onChange={(e) => setNewTagMessage(e.target.value)}
                  placeholder="Message (optional, for annotated tag)"
                  className="w-full rounded bg-transparent px-1 py-0.5 text-[11px] outline-none ring-1 ring-border/60 placeholder:text-muted-foreground/40 focus:ring-border"
                />
                <input
                  value={newTagFrom}
                  onChange={(e) => setNewTagFrom(e.target.value)}
                  placeholder="From (optional, default HEAD)"
                  className="w-full rounded bg-transparent px-1 py-0.5 text-[11px] outline-none ring-1 ring-border/60 placeholder:text-muted-foreground/40 focus:ring-border"
                />
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    className="h-5 flex-1 text-[10px]"
                    onClick={() => void handleCreateTag()}
                    disabled={tagLoading === "create" || !newTagName.trim()}
                  >
                    {tagLoading === "create" ? <Spinner className="size-2.5" /> : "Create"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 text-[10px]"
                    onClick={() => {
                      setShowNewTagForm(false);
                      setTagError(null);
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {tags.length === 0 && !showNewTagForm && (
              <p className="px-4 py-1 text-[11px] text-muted-foreground/50">No tags</p>
            )}

            {tags.map((tag) => {
              const isPushing = tagLoading === `push:${tag}`;
              const isDeleting = tagLoading === `delete:${tag}`;
              return (
                <div
                  key={tag}
                  className="group/tag flex h-[22px] items-center gap-1 rounded px-2 hover:bg-accent/30"
                >
                  <HugeiconsIcon
                    icon={Tag01Icon}
                    size={10}
                    strokeWidth={1.5}
                    className="shrink-0 text-muted-foreground/40"
                  />
                  <span className="flex-1 truncate text-[11px] text-foreground/80">{tag}</span>
                  <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover/tag:opacity-100">
                    <button
                      type="button"
                      className="flex h-4 w-4 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                      onClick={() => void handlePushTag(tag)}
                      title="Push tag"
                      disabled={isPushing || isDeleting}
                    >
                      {isPushing ? (
                        <Spinner className="size-2.5" />
                      ) : (
                        <HugeiconsIcon icon={ArrowUp01Icon} size={9} strokeWidth={2} />
                      )}
                    </button>
                    <button
                      type="button"
                      className="flex h-4 w-4 items-center justify-center rounded text-muted-foreground hover:bg-red-500/20 hover:text-red-500"
                      onClick={() => setDeleteTagName(tag)}
                      title="Delete tag"
                      disabled={isPushing || isDeleting}
                    >
                      {isDeleting ? (
                        <Spinner className="size-2.5" />
                      ) : (
                        <HugeiconsIcon icon={Delete01Icon} size={9} strokeWidth={2} />
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Delete tag alert dialog */}
      <AlertDialog open={deleteTagName !== null} onOpenChange={(o) => !o && setDeleteTagName(null)}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete tag?</AlertDialogTitle>
            <AlertDialogDescription>
              Delete tag{" "}
              <span className="font-mono text-foreground">'{deleteTagName}'</span>? This cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTagName && void handleDeleteTag(deleteTagName)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ─── Branch row ───────────────────────────────────────────────────────────────

interface BranchRowProps {
  branch: Branch;
  isCurrent: boolean;
  onCheckout: (name: string) => void;
  onDelete: (name: string) => void;
  isCheckingOut: boolean;
}

function BranchRow({ branch, isCurrent, onCheckout, onDelete, isCheckingOut }: BranchRowProps) {
  return (
    <div
      className={cn(
        "group/branch flex h-[22px] cursor-pointer items-center gap-1 rounded px-1.5 transition-colors",
        isCurrent ? "bg-accent/40" : "hover:bg-accent/30"
      )}
      onClick={() => !isCurrent && onCheckout(branch.name)}
      title={branch.name}
    >
      {/* Checkmark for current branch */}
      <span className="flex h-4 w-4 shrink-0 items-center justify-center">
        {isCurrent && (
          <HugeiconsIcon
            icon={Tick02Icon}
            size={10}
            strokeWidth={2.5}
            className="text-green-500"
          />
        )}
      </span>

      <span
        className={cn(
          "flex-1 truncate text-[11px]",
          isCurrent ? "font-medium text-foreground" : "text-foreground/80"
        )}
      >
        {branch.name}
      </span>

      {/* Ahead/behind indicators */}
      {branch.ahead > 0 && (
        <span className="shrink-0 rounded-full bg-green-500/15 px-1 py-0.5 text-[9px] font-medium tabular-nums text-green-500">
          ↑{branch.ahead}
        </span>
      )}
      {branch.behind > 0 && (
        <span className="shrink-0 rounded-full bg-red-500/15 px-1 py-0.5 text-[9px] font-medium tabular-nums text-red-500">
          ↓{branch.behind}
        </span>
      )}

      {/* Spinner when checking out this branch */}
      {isCheckingOut && (
        <Spinner className="size-3 shrink-0 text-muted-foreground" />
      )}

      {/* Delete button */}
      {!isCheckingOut && (
        <button
          type="button"
          className={cn(
            "flex h-4 w-4 shrink-0 items-center justify-center rounded opacity-0 transition-opacity group-hover/branch:opacity-100",
            isCurrent
              ? "cursor-not-allowed text-muted-foreground/30"
              : "text-muted-foreground hover:bg-red-500/20 hover:text-red-500"
          )}
          onClick={(e) => {
            e.stopPropagation();
            if (!isCurrent) onDelete(branch.name);
          }}
          title={isCurrent ? "Cannot delete current branch" : "Delete branch"}
          disabled={isCurrent}
        >
          <HugeiconsIcon icon={Delete01Icon} size={9} strokeWidth={2} />
        </button>
      )}
    </div>
  );
}

// ─── Main BranchDropdown ─────────────────────────────────────────────────────

export function BranchDropdown({
  open,
  onOpenChange,
  trigger,
  repoRoot,
  currentBranch,
  onRefresh,
}: BranchDropdownProps) {
  const branchList = useSourceControlStore((s) => s.branchList);
  const isBranchLoading = useSourceControlStore((s) => s.isBranchLoading);
  const tags = useSourceControlStore((s) => s.tags);

  const [filter, setFilter] = useState("");
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [checkingOut, setCheckingOut] = useState<string | null>(null);
  const [showNewBranch, setShowNewBranch] = useState(false);
  const [deleteConfirmBranch, setDeleteConfirmBranch] = useState<string | null>(null);
  const [forceDeleteBranch, setForceDeleteBranch] = useState<string | null>(null);
  const [tagsCollapsed, setTagsCollapsed] = useState(true);

  const localBranches = useMemo(
    () => branchList.filter((b) => !b.isRemote),
    [branchList]
  );
  const remoteBranches = useMemo(
    () => branchList.filter((b) => b.isRemote),
    [branchList]
  );

  const filteredLocal = useMemo(() => {
    if (!filter.trim()) return localBranches;
    const lf = filter.toLowerCase();
    return localBranches.filter((b) => b.name.toLowerCase().includes(lf));
  }, [localBranches, filter]);

  const filteredRemote = useMemo(() => {
    if (!filter.trim()) return remoteBranches;
    const lf = filter.toLowerCase();
    return remoteBranches.filter((b) => b.name.toLowerCase().includes(lf));
  }, [remoteBranches, filter]);

  async function handleCheckout(name: string) {
    setCheckoutError(null);
    setCheckingOut(name);
    try {
      await git.checkoutBranch(repoRoot, name);
      onRefresh();
      onOpenChange(false);
    } catch (e) {
      const errMsg = String(e);
      let displayMsg = `Could not checkout: ${errMsg}`;
      if (errMsg.includes("overwritten")) {
        displayMsg = `Could not checkout: uncommitted changes would be overwritten. Stash your changes first.`;
      }
      setCheckoutError(displayMsg);
    } finally {
      setCheckingOut(null);
    }
  }

  async function handleDelete(name: string, force: boolean) {
    try {
      await git.deleteBranch(repoRoot, name, force);
      setDeleteConfirmBranch(null);
      setForceDeleteBranch(null);
      onRefresh();
    } catch (e) {
      const errMsg = String(e);
      if (!force && (errMsg.includes("not fully merged") || errMsg.includes("is not fully merged"))) {
        setDeleteConfirmBranch(null);
        setForceDeleteBranch(name);
        return;
      }
      setCheckoutError(`Could not delete branch: ${errMsg}`);
      setDeleteConfirmBranch(null);
      setForceDeleteBranch(null);
    }
  }

  function handleOpenNewBranch() {
    onOpenChange(false);
    setShowNewBranch(true);
  }

  const showRemotes = filter.trim()
    ? filteredRemote.length > 0
    : !tagsCollapsed || filteredRemote.length > 0;

  return (
    <>
      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
        <PopoverContent
          className="flex w-64 max-h-[min(520px,70vh)] flex-col overflow-hidden p-0 shadow-lg shadow-black/20"
          align="start"
          style={{ borderColor: "hsl(var(--border) / 0.8)" }}
        >
          {/* Search */}
          <div className="border-b border-border/60 p-2">
            <input
              autoFocus
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter branches…"
              className="w-full bg-transparent text-[11px] text-foreground outline-none placeholder:text-muted-foreground/50"
            />
          </div>

          {/* Checkout error */}
          {checkoutError && (
            <div className="flex items-start gap-1.5 border-b border-red-500/20 bg-red-500/10 px-2 py-1.5">
              <p className="flex-1 text-[10px] text-red-400">{checkoutError}</p>
              <button
                type="button"
                onClick={() => setCheckoutError(null)}
                className="mt-0.5 text-red-400/60 hover:text-red-400"
              >
                <HugeiconsIcon icon={Cancel01Icon} size={9} strokeWidth={2} />
              </button>
            </div>
          )}

          {/* New Branch button */}
          <button
            type="button"
            onClick={handleOpenNewBranch}
            className="flex h-7 w-full items-center gap-1.5 border-b border-border/40 px-2.5 text-[11px] text-muted-foreground hover:bg-accent/30 hover:text-foreground"
          >
            <HugeiconsIcon icon={PlusSignIcon} size={10} strokeWidth={2} />
            New Branch…
          </button>

          {/* Scrollable body */}
          <div className="min-h-0 flex-1 overflow-y-auto">
            {isBranchLoading && branchList.length === 0 ? (
              <div className="flex items-center justify-center py-4">
                <Spinner className="size-4 text-muted-foreground" />
              </div>
            ) : (
              <>
                {/* Local branches */}
                <div>
                  <div className="px-2 pb-0.5 pt-1.5">
                    <span className="text-[9px] font-medium uppercase tracking-wider text-muted-foreground/50">
                      Local
                    </span>
                  </div>
                  <div className="px-1 pb-1">
                    {filteredLocal.length === 0 ? (
                      <p className="py-1 pl-2 text-[11px] text-muted-foreground/50">
                        {filter ? "No matching branches" : "No local branches"}
                      </p>
                    ) : (
                      filteredLocal.map((branch) => (
                        <BranchRow
                          key={branch.name}
                          branch={branch}
                          isCurrent={branch.name === currentBranch}
                          onCheckout={handleCheckout}
                          onDelete={(name) => setDeleteConfirmBranch(name)}
                          isCheckingOut={checkingOut === branch.name}
                        />
                      ))
                    )}
                  </div>
                </div>

                {/* Remote branches */}
                {filteredRemote.length > 0 && (
                  <div className="border-t border-border/40">
                    <div
                      className="flex h-6 cursor-pointer items-center gap-1 px-2 hover:bg-accent/20"
                      onClick={() => setTagsCollapsed((c) => !c)}
                    >
                      <HugeiconsIcon
                        icon={showRemotes && !filter ? ArrowDown01Icon : ArrowRight01Icon}
                        size={9}
                        strokeWidth={2.5}
                        className="shrink-0 text-muted-foreground/40"
                      />
                      <span className="flex-1 text-[9px] font-medium uppercase tracking-wider text-muted-foreground/50">
                        Remote ({filteredRemote.length})
                      </span>
                    </div>
                    {(showRemotes || filter) && (
                      <div className="px-1 pb-1">
                        {filteredRemote.map((branch) => (
                          <BranchRow
                            key={branch.name}
                            branch={branch}
                            isCurrent={false}
                            onCheckout={handleCheckout}
                            onDelete={(name) => setDeleteConfirmBranch(name)}
                            isCheckingOut={checkingOut === branch.name}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Tags section */}
                <TagSection repoRoot={repoRoot} tags={tags} onRefresh={onRefresh} />
              </>
            )}
          </div>
        </PopoverContent>
      </Popover>

      {/* Delete branch — normal confirm */}
      <AlertDialog
        open={deleteConfirmBranch !== null}
        onOpenChange={(o) => !o && setDeleteConfirmBranch(null)}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete branch?</AlertDialogTitle>
            <AlertDialogDescription>
              Delete branch{" "}
              <span className="font-mono text-foreground">'{deleteConfirmBranch}'</span>? This
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                deleteConfirmBranch && void handleDelete(deleteConfirmBranch, false)
              }
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Force delete — unmerged branch */}
      <AlertDialog
        open={forceDeleteBranch !== null}
        onOpenChange={(o) => !o && setForceDeleteBranch(null)}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Force delete unmerged branch?</AlertDialogTitle>
            <AlertDialogDescription>
              Branch{" "}
              <span className="font-mono text-foreground">'{forceDeleteBranch}'</span> is not
              fully merged. Force deleting will permanently discard its commits.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                forceDeleteBranch && void handleDelete(forceDeleteBranch, true)
              }
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Force Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* New branch dialog (mounted outside popover) */}
      <NewBranchDialog
        open={showNewBranch}
        onOpenChange={setShowNewBranch}
        repoRoot={repoRoot}
        currentBranch={currentBranch}
        onSuccess={() => {
          onRefresh();
          setShowNewBranch(false);
        }}
      />
    </>
  );
}
