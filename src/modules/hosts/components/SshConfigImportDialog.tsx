import { invoke } from "@tauri-apps/api/core";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useHostsStore } from "../store/hostsStore";

interface SshConfigEntry {
  alias: string;
  host_address: string;
  port: number;
  username: string | null;
  auth_method: string;
  private_key_path: string | null;
  proxy_jump: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}

export function SshConfigImportDialog({ open, onClose, onImported }: Props) {
  const [entries, setEntries] = useState<SshConfigEntry[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existingAddresses, setExistingAddresses] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;

    setError(null);
    setEntries([]);
    setSelected(new Set());
    setLoading(true);

    const hosts = useHostsStore.getState().hosts;
    const addrSet = new Set(hosts.map((h) => `${h.host_address}:${h.port}`));
    setExistingAddresses(addrSet);

    invoke<SshConfigEntry[]>("parse_ssh_config_cmd")
      .then((result) => {
        setEntries(result);
        setSelected(new Set(result.map((e) => e.alias)));
      })
      .catch((e) => {
        setError(String(e));
      })
      .finally(() => {
        setLoading(false);
      });
  }, [open]);

  const handleSelectAll = () => {
    setSelected(new Set(entries.map((e) => e.alias)));
  };

  const handleDeselectAll = () => {
    setSelected(new Set());
  };

  const handleToggle = (alias: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(alias)) {
        next.delete(alias);
      } else {
        next.add(alias);
      }
      return next;
    });
  };

  const handleImport = async () => {
    const selectedEntries = entries.filter((e) => selected.has(e.alias));
    if (selectedEntries.length === 0) return;

    setImporting(true);
    setError(null);

    try {
      await invoke<string[]>("import_ssh_config_entries", { entries: selectedEntries });
      onImported();
      onClose();
    } catch (e) {
      setError(String(e));
      setImporting(false);
    }
  };

  const selectedCount = selected.size;
  const totalCount = entries.length;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Import from ~/.ssh/config</DialogTitle>
          <DialogDescription>Select hosts to import from your SSH config file.</DialogDescription>
        </DialogHeader>

        {/* Entry list area */}
        <div className="max-h-[400px] overflow-y-auto rounded-lg border border-border">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              {/* Spinner */}
              <svg className="animate-spin h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z"
                />
              </svg>
              Reading ~/.ssh/config…
            </div>
          ) : error ? (
            <div className="px-4 py-4 text-sm text-destructive">{error}</div>
          ) : entries.length === 0 ? (
            <div className="flex flex-col items-center gap-1 px-4 py-10 text-center">
              <p className="text-sm text-muted-foreground">No hosts found in ~/.ssh/config.</p>
              <p className="text-xs text-muted-foreground/60">Make sure the file exists at ~/.ssh/config</p>
            </div>
          ) : (
            <>
              {/* Select All / Deselect All */}
              <div className="flex items-center gap-2 border-b border-border px-3 py-2">
                <button onClick={handleSelectAll} className="text-xs text-primary hover:underline">
                  Select All
                </button>
                <span className="text-xs text-muted-foreground/40">·</span>
                <button onClick={handleDeselectAll} className="text-xs text-primary hover:underline">
                  Deselect All
                </button>
              </div>

              {/* Entry rows */}
              <div className="divide-y divide-border/40">
                {entries.map((entry) => {
                  const isDuplicate = existingAddresses.has(`${entry.host_address}:${entry.port}`);
                  const isSelected = selected.has(entry.alias);

                  return (
                    <button
                      key={entry.alias}
                      onClick={() => handleToggle(entry.alias)}
                      className={cn(
                        "flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors hover:bg-accent",
                        isSelected && "bg-accent/40",
                      )}
                    >
                      {/* Checkbox */}
                      <span
                        className={cn(
                          "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
                          isSelected ? "border-primary bg-primary" : "border-border bg-background",
                        )}
                      >
                        {isSelected && (
                          <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
                            <path
                              d="M1 3.5L3.5 6L8 1"
                              stroke="white"
                              strokeWidth="1.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        )}
                      </span>

                      {/* Main content */}
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {/* Alias */}
                          <span className="text-sm font-medium text-foreground truncate">{entry.alias}</span>

                          {/* Address:port */}
                          <span className="font-mono text-xs text-muted-foreground shrink-0">
                            {entry.host_address}:{entry.port}
                          </span>

                          {/* Username */}
                          {entry.username && (
                            <span className="text-xs text-muted-foreground/70 shrink-0">
                              {entry.username}
                            </span>
                          )}

                          {/* Auth method badge */}
                          <span
                            className={cn(
                              "inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] font-medium shrink-0",
                              entry.auth_method === "key"
                                ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                                : "bg-muted text-muted-foreground",
                            )}
                          >
                            {entry.auth_method === "key" ? "🔑 key" : "🔒 password"}
                          </span>

                          {/* Duplicate warning */}
                          {isDuplicate && (
                            <span className="inline-flex items-center gap-0.5 rounded bg-amber-500/10 px-1 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400 shrink-0">
                              ⚠️ Already exists
                            </span>
                          )}
                        </div>

                        {/* ProxyJump */}
                        {entry.proxy_jump && (
                          <span className="text-[11px] text-muted-foreground/60">
                            ↪ via {entry.proxy_jump}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Error from import attempt */}
        {error && !loading && entries.length > 0 && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{error}</p>
        )}

        <DialogFooter>
          {/* Selection count hint */}
          {!loading && entries.length > 0 && (
            <span className="mr-auto self-center text-xs text-muted-foreground">
              {selectedCount} of {totalCount} selected
            </span>
          )}

          <Button variant="outline" size="sm" onClick={onClose} disabled={importing}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleImport} disabled={selectedCount === 0 || importing}>
            {importing ? "Importing…" : `Import Selected`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
