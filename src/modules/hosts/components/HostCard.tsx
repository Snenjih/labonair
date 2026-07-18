import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { useState } from "react";
import type { Group, Host } from "../types";
import { useHostsStore } from "../store/hostsStore";
import { useCredentialsStore } from "../store/credentialsStore";
import { useTabsStore } from "@/modules/tabs/store/tabsStore";

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
  pingStatus?: "online" | "offline" | "checking";
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

export function HostCard({
  host,
  isSelected,
  isMultiSelected,
  onSelect,
  onEdit,
  group,
  dragHandleProps,
  newSshTab,
  newSftpTab,
  pingStatus,
}: HostCardProps) {
  const selectedHostIds = useHostsStore((s) => s.selectedHostIds);
  const hosts = useHostsStore((s) => s.hosts);
  const deleteHost = useHostsStore((s) => s.deleteHost);
  const credential = useCredentialsStore((s) => s.credentials.find((c) => c.id === host.credential_id));
  const deleteManyHosts = useHostsStore((s) => s.deleteManyHosts);
  const duplicateHost = useHostsStore((s) => s.duplicateHost);
  const togglePin = useHostsStore((s) => s.togglePin);
  const setSelectedHost = useHostsStore((s) => s.setSelectedHost);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  const isBulk = selectedHostIds.size > 1 && selectedHostIds.has(host.id);
  const bulkIds = Array.from(selectedHostIds);
  const highlighted = isSelected || isMultiSelected;

  const hasActiveSshTab = useTabsStore((s) =>
    s.tabs.some(
      (t) =>
        t.kind === "workspace" &&
        Object.values(t.sessions).some((sess) => sess.kind === "ssh" && sess.hostId === host.id),
    ),
  );
  const hasActiveSftpTab = useTabsStore((s) =>
    s.tabs.some((t) => t.kind === "sftp" && (t as { hostId: string }).hostId === host.id),
  );
  // Same active-connection check as above, but across the whole bulk
  // selection — used by the bulk delete dialog below.
  const bulkHasActiveTabs = useTabsStore((s) =>
    bulkIds.some((id) =>
      s.tabs.some(
        (t) =>
          (t.kind === "workspace" &&
            Object.values(t.sessions).some((sess) => sess.kind === "ssh" && sess.hostId === id)) ||
          (t.kind === "sftp" && (t as { hostId: string }).hostId === id),
      ),
    ),
  );

  const connectSsh = (e: React.MouseEvent) => {
    e.stopPropagation();
    newSshTab(host.id, host.name);
  };

  const connectSftp = (e: React.MouseEvent) => {
    e.stopPropagation();
    newSftpTab(host.id, host.name);
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
          <div
            className={cn(
              "group relative flex flex-col justify-between rounded-xl border transition-all select-none",
              highlighted
                ? "border-accent ring-1 ring-accent bg-card/60 shadow-sm"
                : "border-border/60 bg-card/40 hover:border-foreground/30 hover:bg-card",
            )}
          >
            {/* Drag handle */}
            {dragHandleProps && (
              <div
                {...dragHandleProps}
                onClick={(e) => e.stopPropagation()}
                className="absolute right-2 top-2 z-10 cursor-grab active:cursor-grabbing text-muted-foreground/20 hover:text-muted-foreground/50 touch-none"
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
            )}

            {/* ZONE A: Info Body */}
            <button
              onClick={onSelect}
              onDoubleClick={(e) => {
                e.stopPropagation();
                newSshTab(host.id, host.name);
              }}
              className="flex flex-1 items-start gap-3 p-3.5 text-left outline-none"
            >
              <div className="relative flex size-10 shrink-0 items-center justify-center rounded-lg border border-border/50 bg-muted/40 text-sm font-semibold text-muted-foreground shadow-sm">
                {host.pin_to_top ? <span className="text-[10px] text-primary">★</span> : null}
                {initials(host.name) || "?"}
                <span
                  className={cn(
                    "absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-background",
                    pingStatus === "online" &&
                      "bg-success [box-shadow:0_0_6px_color-mix(in_oklch,var(--color-success)_70%,transparent)]",
                    pingStatus === "offline" && "bg-destructive",
                    (!pingStatus || pingStatus === "checking") && "bg-muted-foreground/40 animate-pulse",
                  )}
                />
              </div>
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[13px] font-semibold tracking-tight text-foreground">
                    {host.name}
                  </span>
                  {group && (
                    <Badge
                      variant="secondary"
                      className="shrink-0 h-[18px] px-1.5 text-[9px] uppercase tracking-wider opacity-80"
                    >
                      {group.icon ?? ""} {group.name}
                    </Badge>
                  )}
                </div>
                <span className="mt-0.5 flex items-center gap-1 font-mono text-[11px] text-muted-foreground min-w-0">
                  {host.auth_method === "credential" && credential ? (
                    <>
                      <svg
                        width="10"
                        height="10"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="shrink-0"
                      >
                        <circle cx="7.5" cy="15.5" r="5.5" />
                        <path d="m21 2-9.6 9.6" />
                        <path d="m15.5 7.5 3 3L22 7l-3-3" />
                      </svg>
                      <span className="truncate">{credential.name}</span>
                      <span className="shrink-0">•</span>
                    </>
                  ) : host.auth_method === "key" ? (
                    <>
                      <svg
                        width="10"
                        height="10"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="shrink-0"
                      >
                        <circle cx="7.5" cy="15.5" r="5.5" />
                        <path d="m21 2-9.6 9.6" />
                        <path d="m15.5 7.5 3 3L22 7l-3-3" />
                      </svg>
                      <span className="shrink-0">•</span>
                    </>
                  ) : (
                    <span className="shrink-0">ssh •</span>
                  )}
                  <span className="truncate">
                    {host.username}@{host.host_address}
                  </span>
                </span>
                <span className="mt-1.5 text-[10px] text-muted-foreground/70">
                  {host.last_connected_at
                    ? `Last seen: ${relativeTime(host.last_connected_at)}`
                    : "Never connected"}
                </span>
              </div>
            </button>

            {/* ZONE B: Action Footer */}
            <div
              className={cn(
                "flex items-center gap-1.5 border-t px-2 py-2 transition-colors",
                highlighted
                  ? "border-border/80 bg-muted/20"
                  : "border-border/40 bg-muted/10 group-hover:bg-muted/20",
              )}
            >
              <Button
                variant="ghost"
                size="sm"
                onClick={connectSsh}
                className="h-9 flex-1 gap-2 text-xs text-muted-foreground hover:text-foreground hover:bg-background/50"
              >
                {hasActiveSshTab && <span className="size-1.5 rounded-full bg-success animate-pulse" />}
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 14 14"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                >
                  <rect x="1" y="3" width="12" height="8" rx="1.5" />
                  <path d="M4 7l1.5 1.5L4 10M8 9.5h2" />
                </svg>
                Terminal
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={connectSftp}
                className="h-9 flex-1 gap-2 text-xs text-muted-foreground hover:text-foreground hover:bg-background/50"
              >
                {hasActiveSftpTab && <span className="size-1.5 rounded-full bg-success animate-pulse" />}
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 14 14"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M1 4.5V11a1 1 0 001 1h10a1 1 0 001-1V5.5a1 1 0 00-1-1H7L5.5 3H2a1 1 0 00-1 1.5z" />
                </svg>
                SFTP
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => e.stopPropagation()}
                    className="h-9 w-9 shrink-0 p-0 text-muted-foreground hover:text-foreground hover:bg-background/50"
                  >
                    ⋮
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuItem onClick={() => onEdit()}>Edit</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => duplicateHost(host.id)}>Duplicate</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => togglePin(host.id)}>
                    {host.pin_to_top ? "Unpin" : "Pin to Top"}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => setDeleteOpen(true)}
                  >
                    Delete…
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </ContextMenuTrigger>

        <ContextMenuContent className="w-52">
          {isBulk ? (
            <>
              <ContextMenuItem onClick={connectSshBulk}>Connect SSH ({bulkIds.length})</ContextMenuItem>
              <ContextMenuItem onClick={connectSftpBulk}>Open SFTP ({bulkIds.length})</ContextMenuItem>
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
              <ContextMenuItem onClick={() => newSshTab(host.id, host.name)}>Connect SSH</ContextMenuItem>
              <ContextMenuItem onClick={() => newSftpTab(host.id, host.name)}>Open SFTP</ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem onClick={onEdit}>Edit</ContextMenuItem>
              <ContextMenuItem onClick={() => duplicateHost(host.id)}>Duplicate</ContextMenuItem>
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

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{host.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the host and its stored credentials.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {(hasActiveSshTab || hasActiveSftpTab) && (
            <p className="text-[12px] text-warning">
              This host has an active SSH/SFTP connection — deleting it will leave that tab disconnected.
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                void deleteHost(host.id);
                setSelectedHost(null);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {bulkIds.length} hosts?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the selected hosts and their stored credentials. This cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {bulkHasActiveTabs && (
            <p className="text-[12px] text-warning">
              One or more of these hosts has an active SSH/SFTP connection — deleting them will leave those
              tabs disconnected.
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                void deleteManyHosts(bulkIds);
              }}
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
