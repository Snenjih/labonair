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
import { invoke } from "@tauri-apps/api/core";
import { save as dialogSave } from "@tauri-apps/plugin-dialog";
import { handleApiError } from "@/lib/errors";
import { useNotificationStore } from "@/modules/notifications/store/useNotificationStore";
import type { Group, Host } from "../types";
import { useHostsStore } from "../store/hostsStore";
import { useCredentialsStore } from "../store/credentialsStore";
import { useTabsStore } from "@/modules/tabs/store/tabsStore";
import { HostAvatar } from "./HostAvatar";

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
  /** Uniform scale factor for the card (1 = default), driven by the
   *  "Host card size" preference. */
  cardScale?: number;
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
  cardScale = 1,
}: HostCardProps) {
  const scalePx = (px: number) => px * cardScale;
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

  const handleExportSshConfig = async () => {
    try {
      const configText = await invoke<string>("export_ssh_config", { hostIds: [host.id] });
      const target = await dialogSave({
        defaultPath: `${host.name}_ssh_config`,
        filters: [{ name: "All Files", extensions: ["*"] }],
      });
      if (!target) return;
      await invoke("fs_write_file", { path: target, content: configText });
      useNotificationStore.getState().addNotification({
        type: "success",
        title: "SSH config exported",
        message:
          `Exported "${host.name}" to ${target}.` +
          (host.jump_host_id
            ? " Note: its jump host isn't included in this export — the ProxyJump line is included by name only."
            : ""),
        source: "Hosts",
      });
    } catch (e) {
      handleApiError(e, "Export failed", "Hosts");
    }
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
              className="flex flex-1 items-start text-left outline-none"
              style={{ gap: scalePx(12), padding: scalePx(14) }}
            >
              <HostAvatar host={host} size="md" pingStatus={pingStatus} scale={cardScale} />
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className="truncate font-semibold tracking-tight text-foreground"
                    style={{ fontSize: scalePx(13) }}
                  >
                    {host.name}
                  </span>
                  {group && (
                    <Badge
                      variant="secondary"
                      className="shrink-0 uppercase tracking-wider opacity-80"
                      style={{
                        height: scalePx(18),
                        paddingLeft: scalePx(6),
                        paddingRight: scalePx(6),
                        fontSize: scalePx(9),
                      }}
                    >
                      {group.icon ?? ""} {group.name}
                    </Badge>
                  )}
                </div>
                <span
                  className="mt-0.5 flex items-center gap-1 font-mono text-muted-foreground min-w-0"
                  style={{ fontSize: scalePx(11) }}
                >
                  {host.auth_method === "credential" && credential ? (
                    <>
                      <svg
                        width={scalePx(10)}
                        height={scalePx(10)}
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
                        width={scalePx(10)}
                        height={scalePx(10)}
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
                <span className="mt-1.5 text-muted-foreground/70" style={{ fontSize: scalePx(10) }}>
                  {host.last_connected_at
                    ? `Last seen: ${relativeTime(host.last_connected_at)}`
                    : "Never connected"}
                </span>
              </div>
            </button>

            {/* ZONE B: Action Footer */}
            <div
              className={cn(
                "flex items-center gap-1.5 border-t transition-colors",
                highlighted
                  ? "border-border/80 bg-muted/20"
                  : "border-border/40 bg-muted/10 group-hover:bg-muted/20",
              )}
              style={{
                paddingLeft: scalePx(8),
                paddingRight: scalePx(8),
                paddingTop: scalePx(8),
                paddingBottom: scalePx(8),
              }}
            >
              <Button
                variant="ghost"
                size="sm"
                onClick={connectSsh}
                className="flex-1 gap-2 text-muted-foreground hover:text-foreground hover:bg-background/50"
                style={{ height: scalePx(36), fontSize: scalePx(12) }}
              >
                {hasActiveSshTab && <span className="size-1.5 rounded-full bg-success animate-pulse" />}
                <svg
                  width={scalePx(15)}
                  height={scalePx(15)}
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
                className="flex-1 gap-2 text-muted-foreground hover:text-foreground hover:bg-background/50"
                style={{ height: scalePx(36), fontSize: scalePx(12) }}
              >
                {hasActiveSftpTab && <span className="size-1.5 rounded-full bg-success animate-pulse" />}
                <svg
                  width={scalePx(15)}
                  height={scalePx(15)}
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
                    className="shrink-0 p-0 text-muted-foreground hover:text-foreground hover:bg-background/50"
                    style={{ height: scalePx(36), width: scalePx(36) }}
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
                  <DropdownMenuItem onClick={() => void handleExportSshConfig()}>
                    Export SSH Config
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
              <ContextMenuItem onClick={() => void handleExportSshConfig()}>
                Export SSH Config
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
