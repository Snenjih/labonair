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
  newSshTab: (hostId: string, title: string) => void;
  newSftpTab: (hostId: string, title: string) => void;
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

// SSH icon
function SshIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
      <rect x="1" y="3" width="12" height="8" rx="1.5" />
      <path d="M4 7l1.5 1.5L4 10M8 9.5h2" />
    </svg>
  );
}

// SFTP / folder icon
function SftpIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 4.5V11a1 1 0 001 1h10a1 1 0 001-1V5.5a1 1 0 00-1-1H7L5.5 3H2a1 1 0 00-1 1.5z" />
    </svg>
  );
}

// Edit / pencil icon
function EditIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.5 2.5l2 2L4 12H2v-2L9.5 2.5z" />
    </svg>
  );
}

export function HostCard({ host, isSelected, isMultiSelected, onSelect, onEdit, group, dragHandleProps, newSshTab, newSftpTab }: HostCardProps) {
  const selectedHostIds = useHostsStore((s) => s.selectedHostIds);
  const hosts = useHostsStore((s) => s.hosts);
  const deleteHost = useHostsStore((s) => s.deleteHost);
  const deleteManyHosts = useHostsStore((s) => s.deleteManyHosts);
  const duplicateHost = useHostsStore((s) => s.duplicateHost);
  const togglePin = useHostsStore((s) => s.togglePin);
  const setSelectedHost = useHostsStore((s) => s.setSelectedHost);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  const isBulk = selectedHostIds.size > 1 && selectedHostIds.has(host.id);
  const bulkIds = Array.from(selectedHostIds);

  const highlighted = isSelected || isMultiSelected;

  const connectSsh = (e: React.MouseEvent) => {
    e.stopPropagation();
    newSshTab(host.id, host.name);
  };

  const connectSftp = (e: React.MouseEvent) => {
    e.stopPropagation();
    newSftpTab(host.id, host.name);
  };

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    onEdit();
  };

  const connectSshBulk = () => {
    bulkIds.forEach((id) => {
      const h = hosts.find((x) => x.id === id);
      if (h) newSshTab(id, h.name);
    });
  };

  const connectSftpBulk = () => {
    bulkIds.forEach((id) => {
      const h = hosts.find((x) => x.id === id);
      if (h) newSftpTab(id, h.name);
    });
  };

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <motion.div
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
            onClick={onSelect}
            className={cn(
              "group flex cursor-pointer flex-col gap-3 rounded-xl border border-border bg-card p-4 transition-all select-none",
              highlighted
                ? "ring-2 ring-primary bg-accent/40 border-primary/30"
                : "hover:bg-accent/20",
            )}
          >
            {/* Top row: drag handle + avatar + name + action buttons */}
            <div className="flex items-start gap-3">
              {/* Drag handle */}
              <div
                {...dragHandleProps}
                onClick={(e) => e.stopPropagation()}
                className="shrink-0 cursor-grab active:cursor-grabbing text-muted-foreground/30 hover:text-muted-foreground mt-1 touch-none"
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

              {/* Avatar */}
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-sm font-semibold text-muted-foreground">
                {initials(host.name) || "?"}
              </div>

              {/* Name + address */}
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

              {/* Action icon buttons — visible on hover */}
              <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={connectSsh}
                  title="Connect SSH"
                  className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                >
                  <SshIcon />
                </button>
                <button
                  onClick={connectSftp}
                  title="Open SFTP"
                  className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                >
                  <SftpIcon />
                </button>
                <button
                  onClick={handleEdit}
                  title="Edit"
                  className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
                >
                  <EditIcon />
                </button>
              </div>
            </div>

            {/* Tags row */}
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
              <ContextMenuItem onClick={connectSshBulk}>
                Connect SSH ({bulkIds.length})
              </ContextMenuItem>
              <ContextMenuItem onClick={connectSftpBulk}>
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
              onClick={() => { void deleteHost(host.id); setSelectedHost(null); }}
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
              onClick={() => { void deleteManyHosts(bulkIds); }}
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
