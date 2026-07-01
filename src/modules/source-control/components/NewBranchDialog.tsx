import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Spinner } from "@/components/ui/spinner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { cn } from "@/lib/utils";
import { git } from "../lib/gitInvoke";
import { useNotificationStore } from "@/modules/notifications/store/useNotificationStore";

interface NewBranchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  repoRoot: string;
  currentBranch: string;
  fromRef?: string;
  onSuccess: () => void;
}

export function NewBranchDialog({
  open,
  onOpenChange,
  repoRoot,
  currentBranch,
  fromRef,
  onSuccess,
}: NewBranchDialogProps) {
  const [name, setName] = useState("");
  const [from, setFrom] = useState(fromRef ?? currentBranch);
  const [checkout, setCheckout] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nameError, setNameError] = useState(false);

  const nameInputRef = useRef<HTMLInputElement>(null);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setName("");
      setFrom(fromRef ?? currentBranch);
      setCheckout(true);
      setIsLoading(false);
      setError(null);
      setNameError(false);
      setTimeout(() => nameInputRef.current?.focus(), 50);
    }
  }, [open, currentBranch, fromRef]);

  async function handleCreate() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setNameError(true);
      nameInputRef.current?.focus();
      return;
    }
    setNameError(false);
    setIsLoading(true);
    setError(null);
    try {
      await git.createBranch(repoRoot, trimmedName, from.trim() || undefined, checkout);
      onSuccess();
      onOpenChange(false);
    } catch (e) {
      setError(String(e));
      useNotificationStore.getState().addNotification({ type: "error", title: "Create Branch Failed", message: String(e) });
    } finally {
      setIsLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !isLoading) {
      void handleCreate();
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-sm">New Branch</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-1">
          {/* Branch name */}
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-muted-foreground">Name</label>
            <Input
              ref={nameInputRef}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (e.target.value.trim()) setNameError(false);
              }}
              onKeyDown={handleKeyDown}
              placeholder="feature/my-branch"
              className={cn(
                "h-7 text-[12px]",
                nameError && "ring-2 ring-error/50 border-error/50"
              )}
            />
            {nameError && (
              <p className="text-[10px] text-error">Branch name is required.</p>
            )}
          </div>

          {/* From ref */}
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-muted-foreground">From</label>
            <Input
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="HEAD"
              className="h-7 text-[12px]"
            />
          </div>

          {/* Checkout after create */}
          <div className="flex items-center justify-between">
            <label className="text-[11px] font-medium text-muted-foreground">
              Checkout after create
            </label>
            <Switch
              checked={checkout}
              onCheckedChange={setCheckout}
              className="scale-90"
            />
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 rounded border border-error/30 bg-error/10 px-2 py-1.5">
              <p className="flex-1 text-[10px] text-error">{error}</p>
              <button
                type="button"
                onClick={() => setError(null)}
                className="mt-0.5 shrink-0 text-error/60 hover:text-error"
              >
                <HugeiconsIcon icon={Cancel01Icon} size={10} strokeWidth={2} />
              </button>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
            className="text-xs"
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => void handleCreate()}
            disabled={isLoading}
            className="text-xs"
          >
            {isLoading && <Spinner className="mr-1.5 size-3" />}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
