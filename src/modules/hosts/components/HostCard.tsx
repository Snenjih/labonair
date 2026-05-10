import { cn } from "@/lib/utils";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
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
import { useTabs } from "@/modules/tabs";
import { motion } from "motion/react";
import { useState } from "react";
import type { Group, Host } from "../types";
import { useHostsStore } from "../store/hostsStore";

interface HostCardProps {
  host: Host;
  isSelected: boolean;
  isMultiSelected: boolean;
  onSelect: (e: React.MouseEvent) => void;
  onEdit: () => void;
  group?: Group;
  dragHandleProps?: React.HTMLAttributes<HTMLElement>;
}

function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return "just now";
}

function initials(name: string): string {
  return name
    .split(/[\s\-_]+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

export function HostCard({ host, isSelected, isMultiSelected, onSelect, onEdit, group, dragHandleProps }: HostCardProps) {
  const selectedHostIds = useHostsStore((s) => s.selectedHostIds);
  const deleteHost = useHostsStore((s) => s.deleteHost);
  const deleteManyHosts = useHostsStore((s) => s.deleteManyHosts);
  const duplicateHost = useHostsStore((s) => s.duplicateHost);
  const togglePin = useHostsStore((s) => s.togglePin);
  const setSelectedHost = useHostsStore((s) => s.setSelectedHost);
  const { newSshTab, newSftpTab } = useTabs();

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  const isBulk = selectedHostIds.size > 1 && selectedHostIds.has(host.id);
  const bulkIds = Array.from(selectedHostIds);

  const highlighted = isSelected || isMultiSelected;

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <motion.div
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
            onClick={onSelect}
            className={cn(
              "flex cursor-pointer flex-col gap-3 rounded-xl border border-border bg-card p-4 transition-all select-none",
              highlighted
                ? "ring-2 ring-primary bg-accent/40 border-primary/30"
                : "hover:bg-accent/20",
            )}
          >
            <div className="flex items-start gap-3">
              {/* Drag handle */}
              <div
                {...dragHandleProps}
                onClick={(e) => e.stopPropagation()}
                className="shrink-0 cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground mt-1 touch-none"
              >
                <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor">
                  <circle cx="3" cy="2" r="1.2" />
                  <circle cx="7" cy="2" r="1.2" />
                  <circle cx="3" cy="6" r="1.2" />
                  <circle cx="7" cy="6" r="1.2" />
                  <circle cx="3" cy="10" r="1.2" />
                  <circle cx="7" cy="10" r="1.2" />
                </svg>
              </div>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-sm font-semibold text-muted-foreground">
                {initials(host.name) || "?"}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  {host.pin_to_top && (
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" className="text-primary shrink-0">
                      <path d="M5 1l1.2 3h3l-2.4 1.8.9 3L5 7.2 2.3 8.8l.9-3L.8 4H3.8z"/>
                    </svg>
                  )}
                  <p className="truncate font-semibold text-foreground leading-tight">{host.name}</p>
                </div>
                <p className="truncate text-xs text-muted-foreground mt-0.5">
                  {host.username}@{host.host_address}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-mono text-muted-foreground">
                :{host.port}
              </span>
              {group && (
                <span className="flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                  <span>{group.icon ?? "📁"}</span>
                  <span>{group.name}</span>
                </span>
              )}
              {host.auth_method === "key" && (
                <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">key</span>
              )}
              {host.auth_method === "none" && (
                <span className="rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">no auth</span>
              )}
              {host.last_connected_at && (
                <span className="ml-auto text-[11px] text-muted-foreground/60">
                  {relativeTime(host.last_connected_at)}
                </span>
              )}
            </div>
          </motion.div>
        </ContextMenuTrigger>

        <ContextMenuContent className="w-52">
          {isBulk ? (
            <>
              <ContextMenuItem onClick={() => bulkIds.forEach((id) => { const h = useHostsStore.getState().hosts.find((x) => x.id === id); if (h) newSshTab(id, h.name); })}>
                Connect SSH ({bulkIds.length})
              </ContextMenuItem>
              <ContextMenuItem onClick={() => bulkIds.forEach((id) => { const h = useHostsStore.getState().hosts.find((x) => x.id === id); if (h) newSftpTab(id, h.name); })}>
                Open SFTP ({bulkIds.length})
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem onClick={() => Promise.all(bulkIds.map((id) => duplicateHost(id)))}>
                Duplicate Selected
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => setBulkDeleteOpen(true)}
              >
                Delete {bulkIds.length} Hosts…
              </ContextMenuItem>
            </>
          ) : (
            <>
              <ContextMenuItem onClick={() => newSshTab(host.id, host.name)}>
                Connect SSH
              </ContextMenuItem>
              <ContextMenuItem onClick={() => newSftpTab(host.id, host.name)}>
                Open SFTP
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem onClick={onEdit}>
                Edit
              </ContextMenuItem>
              <ContextMenuItem onClick={() => duplicateHost(host.id)}>
                Duplicate
              </ContextMenuItem>
              <ContextMenuItem onClick={() => togglePin(host.id)}>
                {host.pin_to_top ? "Unpin" : "Pin to Top"}
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => setDeleteOpen(true)}
              >
                Delete…
              </ContextMenuItem>
            </>
          )}
        </ContextMenuContent>
      </ContextMenu>

      {/* Single delete confirm */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{host.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the host and its stored credentials.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { deleteHost(host.id); setSelectedHost(null); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk delete confirm */}
      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {bulkIds.length} hosts?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the selected hosts and their stored credentials. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { deleteManyHosts(bulkIds); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete {bulkIds.length} Hosts
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
