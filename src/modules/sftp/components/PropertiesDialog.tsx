import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import type { FileNode } from "../types";

interface PropertiesDialogProps {
  open: boolean;
  onClose: () => void;
  file: FileNode;
  tabId: string;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function formatDate(unixSecs: number): string {
  if (!unixSecs) return "—";
  return new Date(unixSecs * 1000).toLocaleString();
}

// Parse octal string (e.g. "755") → 3×3 boolean matrix [owner,group,public][r,w,x]
function octalToMatrix(oct: string): boolean[][] {
  const n = parseInt(oct.slice(-3).padStart(3, "0"), 8);
  if (isNaN(n)) return [[false,false,false],[false,false,false],[false,false,false]];
  return [
    [!!(n & 0o400), !!(n & 0o200), !!(n & 0o100)],
    [!!(n & 0o040), !!(n & 0o020), !!(n & 0o010)],
    [!!(n & 0o004), !!(n & 0o002), !!(n & 0o001)],
  ];
}

function matrixToOctal(m: boolean[][]): string {
  const bits = [
    [0o400, 0o200, 0o100],
    [0o040, 0o020, 0o010],
    [0o004, 0o002, 0o001],
  ];
  let n = 0;
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) if (m[r][c]) n |= bits[r][c];
  return n.toString(8).padStart(3, "0");
}

export function PropertiesDialog({ open, onClose, file, tabId }: PropertiesDialogProps) {
  const [calculatedSize, setCalculatedSize] = useState<string | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [sizeError, setSizeError] = useState<string | null>(null);

  // Permissions state
  function permStringToOctal(perm: string): string {
    const chars = perm.slice(0, 9).padEnd(9, "-");
    let n = 0;
    const weights = [0o400,0o200,0o100,0o040,0o020,0o010,0o004,0o002,0o001];
    for (let i = 0; i < 9; i++) if (chars[i] !== "-") n |= weights[i];
    return n.toString(8).padStart(3,"0");
  }

  const [octalInput, setOctalInput] = useState(() => permStringToOctal(file.permissions ?? ""));
  const [matrix, setMatrix] = useState<boolean[][]>(() => octalToMatrix(permStringToOctal(file.permissions ?? "")));
  const [owner, setOwner] = useState("");
  const [group, setGroup] = useState("");
  const [applyError, setApplyError] = useState<string | null>(null);
  const [applySuccess, setApplySuccess] = useState(false);
  const [isApplying, setIsApplying] = useState(false);

  useEffect(() => {
    if (open) {
      setCalculatedSize(null);
      setSizeError(null);
      setApplyError(null);
      setApplySuccess(false);
      const oct = permStringToOctal(file.permissions ?? "");
      setOctalInput(oct);
      setMatrix(octalToMatrix(oct));
      setOwner("");
      setGroup("");
    }
  }, [open, file.path]);

  const octalWarning = /^[0-7]{4}$/.test(octalInput)
    ? "Special bits (setuid/setgid/sticky) are not supported here. Only the last 3 digits apply."
    : null;

  function handleOctalChange(val: string) {
    setOctalInput(val);
    // Sync checkboxes only for standard 3-digit octal (9 permission bits).
    // 4-digit input with special bits is accepted but checkboxes show only the lower 3.
    if (/^[0-7]{1,3}$/.test(val)) {
      setMatrix(octalToMatrix(val));
    }
  }

  function handleCheckbox(row: number, col: number, checked: boolean) {
    const next = matrix.map((r) => [...r]);
    next[row][col] = checked;
    setMatrix(next);
    setOctalInput(matrixToOctal(next));
  }

  async function calculateSize() {
    setIsCalculating(true);
    setSizeError(null);
    try {
      const size = await invoke<string>("sftp_calculate_size", { tabId, path: file.path });
      setCalculatedSize(size);
    } catch (e) {
      setSizeError(String(e));
    } finally {
      setIsCalculating(false);
    }
  }

  async function applyPermissions() {
    setIsApplying(true);
    setApplyError(null);
    setApplySuccess(false);
    try {
      const octal = parseInt(octalInput, 8);
      if (!isNaN(octal)) {
        await invoke("sftp_chmod", { tabId, path: file.path, permissions: octal });
      }
      // Only chown when at least one field is filled. Empty = leave unchanged.
      if (owner.trim() || group.trim()) {
        await invoke("sftp_chown", {
          tabId,
          path: file.path,
          owner: owner.trim(),
          group: group.trim(),
        });
      }
      setApplySuccess(true);
    } catch (e) {
      setApplyError(String(e));
    } finally {
      setIsApplying(false);
    }
  }

  const fileType = file.is_dir ? "Directory" : file.is_symlink ? `Symlink → ${file.symlink_target ?? "?"}` : "File";

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="w-[480px] max-w-full">
        <DialogHeader>
          <DialogTitle className="text-sm font-semibold truncate">
            Properties — {file.name}
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="general" className="mt-1">
          <TabsList className="w-full">
            <TabsTrigger value="general" className="flex-1 text-xs">General</TabsTrigger>
            <TabsTrigger value="permissions" className="flex-1 text-xs">Permissions</TabsTrigger>
          </TabsList>

          {/* GENERAL TAB */}
          <TabsContent value="general" className="mt-3 space-y-2">
            <InfoRow label="Name" value={file.name} mono />
            <InfoRow label="Path" value={file.path} mono />
            <InfoRow label="Type" value={fileType} />
            <InfoRow
              label="Size"
              value={
                file.is_dir
                  ? calculatedSize ?? "—"
                  : formatBytes(file.size)
              }
            />
            {file.is_dir && (
              <div className="flex items-center gap-2 pl-24">
                <button
                  disabled={isCalculating}
                  onClick={calculateSize}
                  className="h-6 px-3 text-xs rounded bg-muted/40 border border-border text-foreground hover:bg-muted/60 disabled:opacity-50"
                >
                  {isCalculating ? "Calculating…" : calculatedSize ? "Recalculate" : "Calculate Size"}
                </button>
                {sizeError && (
                  <span className="text-xs text-destructive truncate">{sizeError}</span>
                )}
              </div>
            )}
            <InfoRow label="Modified" value={formatDate(file.modified_at)} />
            {file.is_symlink && file.symlink_target && (
              <InfoRow label="Target" value={file.symlink_target} mono />
            )}
          </TabsContent>

          {/* PERMISSIONS TAB */}
          <TabsContent value="permissions" className="mt-3 space-y-4">
            {/* Octal input */}
            <div className="flex items-center gap-3">
              <span className="w-24 text-xs text-muted-foreground text-right shrink-0">Octal</span>
              <div className="flex flex-col gap-1">
                <input
                  value={octalInput}
                  onChange={(e) => handleOctalChange(e.target.value)}
                  maxLength={4}
                  placeholder="755"
                  className="w-20 h-7 px-2 text-sm font-mono rounded bg-muted/30 border border-border text-foreground focus:outline-none focus:border-primary"
                />
                {octalWarning && (
                  <p className="text-[10px] text-yellow-500/80 max-w-52">{octalWarning}</p>
                )}
              </div>
            </div>

            {/* Checkbox grid */}
            <div className="ml-24">
              <div className="grid grid-cols-4 gap-x-2 gap-y-1.5 text-xs text-muted-foreground mb-1">
                <span />
                <span className="text-center font-semibold">Read</span>
                <span className="text-center font-semibold">Write</span>
                <span className="text-center font-semibold">Execute</span>
                {(["Owner","Group","Public"] as const).map((label, row) => (
                  <>
                    <span key={`lbl-${row}`} className="flex items-center text-foreground">{label}</span>
                    {[0,1,2].map((col) => (
                      <div key={`cb-${row}-${col}`} className="flex justify-center items-center">
                        <Checkbox
                          checked={matrix[row]?.[col] ?? false}
                          onCheckedChange={(checked) => handleCheckbox(row, col, !!checked)}
                        />
                      </div>
                    ))}
                  </>
                ))}
              </div>
            </div>

            {/* Owner/Group */}
            <div className="space-y-2 pt-1 border-t border-border">
              <p className="text-xs font-semibold text-muted-foreground pt-1">Ownership</p>
              <div className="flex items-center gap-3">
                <span className="w-24 text-xs text-muted-foreground text-right shrink-0">Owner</span>
                <input
                  value={owner}
                  onChange={(e) => setOwner(e.target.value)}
                  placeholder="unchanged"
                  className="flex-1 h-7 px-2 text-sm rounded bg-muted/30 border border-border text-foreground focus:outline-none focus:border-primary"
                />
              </div>
              <div className="flex items-center gap-3">
                <span className="w-24 text-xs text-muted-foreground text-right shrink-0">Group</span>
                <input
                  value={group}
                  onChange={(e) => setGroup(e.target.value)}
                  placeholder="unchanged"
                  className="flex-1 h-7 px-2 text-sm rounded bg-muted/30 border border-border text-foreground focus:outline-none focus:border-primary"
                />
              </div>
            </div>

            {applyError && (
              <p className="text-xs text-destructive">{applyError}</p>
            )}
            {applySuccess && (
              <p className="text-xs text-primary">Applied successfully.</p>
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter className="mt-2">
          <button
            onClick={onClose}
            className="h-7 px-3 text-xs rounded bg-muted/30 text-muted-foreground hover:text-foreground"
          >
            Close
          </button>
          <button
            onClick={applyPermissions}
            disabled={isApplying}
            className="h-7 px-4 text-xs rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {isApplying ? "Applying…" : "Apply"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function InfoRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start gap-3">
      <span className="w-24 text-xs text-muted-foreground text-right shrink-0 pt-0.5">{label}</span>
      <span className={`flex-1 text-xs text-foreground break-all ${mono ? "font-mono" : ""}`}>
        {value || "—"}
      </span>
    </div>
  );
}
