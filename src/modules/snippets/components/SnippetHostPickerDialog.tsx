import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useEffect, useState } from "react";
import { useHostsStore } from "@/modules/hosts/store/hostsStore";

interface Props {
  open: boolean;
  snippetName?: string;
  onSelect: (hostId: string) => void;
  onCancel: () => void;
}

/**
 * Shown when a snippet with `hostId === ""` ("Ask at runtime") is run. Lets
 * the user pick which host to target for this single run — the choice is not
 * persisted back to the snippet.
 */
export function SnippetHostPickerDialog({ open, snippetName, onSelect, onCancel }: Props) {
  const hosts = useHostsStore((s) => s.hosts);
  const [hostId, setHostId] = useState("");

  useEffect(() => {
    if (open) setHostId("");
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Select a host</DialogTitle>
          <DialogDescription>
            {snippetName ? `"${snippetName}"` : "This snippet"} is set to ask for a host at runtime. Choose
            which host to run it on — this choice is used for this run only.
          </DialogDescription>
        </DialogHeader>

        {hosts.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No hosts configured yet. Add one in the Host Manager first.
          </p>
        ) : (
          <Select value={hostId} onValueChange={setHostId}>
            <SelectTrigger className="h-8 text-[12px]">
              <SelectValue placeholder="Choose a host" />
            </SelectTrigger>
            <SelectContent>
              {hosts.map((h) => (
                <SelectItem key={h.id} value={h.id}>
                  {h.name} ({h.host_address})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button size="sm" disabled={!hostId} onClick={() => onSelect(hostId)}>
            Run
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
