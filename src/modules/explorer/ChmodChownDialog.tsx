import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Fragment, useEffect, useState } from "react";
import { matrixToOctal, octalToMatrix, permStringToOctal } from "@/modules/sftp/components/PropertiesDialog";

interface ChmodChownDialogProps {
  open: boolean;
  onClose: () => void;
  path: string;
  permissions?: string;
  onChmod: (path: string, permissions: number) => Promise<void>;
  onChown: (path: string, owner: string, group: string) => Promise<void>;
}

/**
 * Minimal chmod/chown dialog for the sidebar explorer tree, gated behind
 * `capabilities.supportsChmod`/`supportsChown` (remote/SFTP only today).
 * Deliberately smaller than the dual-pane SFTP tab's `PropertiesDialog`
 * (no size calculation, no tabs) — just the two permission actions.
 */
export function ChmodChownDialog({
  open,
  onClose,
  path,
  permissions,
  onChmod,
  onChown,
}: ChmodChownDialogProps) {
  const [octalInput, setOctalInput] = useState(() => permStringToOctal(permissions ?? ""));
  const [matrix, setMatrix] = useState<boolean[][]>(() =>
    octalToMatrix(permStringToOctal(permissions ?? "")),
  );
  const [owner, setOwner] = useState("");
  const [group, setGroup] = useState("");
  const [isApplying, setIsApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      const oct = permStringToOctal(permissions ?? "");
      setOctalInput(oct);
      setMatrix(octalToMatrix(oct));
      setOwner("");
      setGroup("");
      setError(null);
    }
  }, [open, permissions]);

  function handleOctalChange(val: string) {
    setOctalInput(val);
    if (/^[0-7]{1,3}$/.test(val)) setMatrix(octalToMatrix(val));
  }

  function handleCheckbox(row: number, col: number, checked: boolean) {
    const next = matrix.map((r) => [...r]);
    next[row][col] = checked;
    setMatrix(next);
    setOctalInput(matrixToOctal(next));
  }

  async function handleApply() {
    setIsApplying(true);
    setError(null);
    try {
      const octal = parseInt(octalInput, 8);
      if (!isNaN(octal)) await onChmod(path, octal);
      if (owner.trim() || group.trim()) await onChown(path, owner.trim(), group.trim());
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setIsApplying(false);
    }
  }

  const rows = ["Owner", "Group", "Public"];
  const cols = ["Read", "Write", "Execute"];

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-sm">Permissions</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <div className="space-y-2">
            <Label htmlFor="chmod-octal" className="text-xs text-muted-foreground">
              Octal
            </Label>
            <Input
              id="chmod-octal"
              value={octalInput}
              onChange={(e) => handleOctalChange(e.target.value)}
              className="h-7 w-24 font-mono text-xs"
              maxLength={4}
            />
            <div className="grid grid-cols-4 gap-1 text-xs">
              <span />
              {cols.map((c) => (
                <span key={c} className="text-center text-muted-foreground">
                  {c}
                </span>
              ))}
              {rows.map((r, ri) => (
                <Fragment key={r}>
                  <span className="text-muted-foreground">{r}</span>
                  {cols.map((_, ci) => (
                    <div key={`${r}-${ci}`} className="flex justify-center">
                      <Checkbox
                        checked={matrix[ri][ci]}
                        onCheckedChange={(v) => handleCheckbox(ri, ci, v === true)}
                      />
                    </div>
                  ))}
                </Fragment>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="chown-owner" className="text-xs text-muted-foreground">
                Owner (leave blank to keep)
              </Label>
              <Input
                id="chown-owner"
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
                className="h-7 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="chown-group" className="text-xs text-muted-foreground">
                Group (leave blank to keep)
              </Label>
              <Input
                id="chown-group"
                value={group}
                onChange={(e) => setGroup(e.target.value)}
                className="h-7 text-xs"
              />
            </div>
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose} disabled={isApplying}>
            Cancel
          </Button>
          <Button size="sm" onClick={() => void handleApply()} disabled={isApplying}>
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
