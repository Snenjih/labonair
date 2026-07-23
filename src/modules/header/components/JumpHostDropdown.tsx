import {
  CloudServerIcon,
  ComputerTerminal02Icon,
  FolderTreeIcon,
  Route01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useLazySessionStore } from "@/modules/explorer/lib/useLazyExplorerSession";
import { type ConnectionEntry, useConnectionStatusStore, useHostsStore } from "@/modules/hosts";
import { getPopoverPlacement } from "@/modules/settings/lib/getPopoverPlacement";
import { usePreferencesStore } from "@/modules/settings/preferences";
import type { SidebarPanel } from "@/modules/statusbar";
import { useTabsStore } from "@/modules/tabs/store/tabsStore";
import { buildHostGroups, type HostGroup } from "../lib/jumpHostGroups";

type PillStatus = "connecting" | "connected" | "error" | "auth_required";

function useJumpHostGroups(): HostGroup[] {
  const connections = useConnectionStatusStore((s) => s.connections);
  const lazySessions = useLazySessionStore((s) => s.sessions);
  const hosts = useHostsStore((s) => s.hosts);
  const tabs = useTabsStore((s) => s.tabs);
  return useMemo(
    () => buildHostGroups(connections, lazySessions, hosts, tabs),
    [connections, lazySessions, hosts, tabs],
  );
}

function terminalPillStatus(entries: ConnectionEntry[]): PillStatus {
  if (entries.some((e) => e.status === "error")) return "error";
  if (entries.some((e) => e.status === "connecting")) return "connecting";
  return "connected";
}

function dotClass(status: PillStatus): string {
  switch (status) {
    case "connecting":
      return "bg-warning animate-pulse";
    case "connected":
      return "bg-success";
    case "auth_required":
      return "bg-warning";
    case "error":
      return "bg-destructive";
  }
}

function pillClass(status: PillStatus): string {
  switch (status) {
    case "connecting":
      return "bg-warning/15 text-warning hover:bg-warning/25";
    case "connected":
      return "bg-success/15 text-success hover:bg-success/25";
    case "auth_required":
      return "bg-warning/15 text-warning hover:bg-warning/25";
    case "error":
      return "bg-destructive/15 text-destructive hover:bg-destructive/25";
  }
}

interface PillProps {
  icon: typeof Route01Icon;
  label: string;
  status: PillStatus;
  onClick: () => void;
  title: string;
}

function ConnectionPill({ icon, label, status, onClick, title }: PillProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        "flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
        "transition-colors active:scale-95",
        pillClass(status),
      )}
    >
      <span className={cn("size-1.5 shrink-0 rounded-full", dotClass(status))} />
      <HugeiconsIcon icon={icon} size={10} strokeWidth={2} className="shrink-0" />
      {label}
    </button>
  );
}

function HostGroupRow({
  group,
  onPanelToggle,
}: {
  group: HostGroup;
  onPanelToggle?: (panel: SidebarPanel) => void;
}) {
  const focusPane = (workspaceTabId: number, paneId: string) => {
    useTabsStore.getState().setActiveId(workspaceTabId);
    useTabsStore.getState().setActivePaneId(workspaceTabId, paneId);
  };

  // Terminal/SFTP connection entries always carry their tab/pane ids by
  // construction (set by SshTerminalPane/SftpPane's upsert() call) — these
  // narrowing checks exist only to satisfy the type (workspaceTabId/paneId/
  // sftpTabId are optional on ConnectionEntry because they don't apply to
  // every `kind`), not because the values can actually be missing here.
  const mostRecent = group.terminalConnections[0];
  const terminalTarget =
    mostRecent && mostRecent.workspaceTabId !== undefined && mostRecent.paneId !== undefined
      ? { workspaceTabId: mostRecent.workspaceTabId, paneId: mostRecent.paneId }
      : null;
  const sftpTarget =
    group.sftpConnection && group.sftpConnection.sftpTabId !== undefined
      ? { sftpTabId: group.sftpConnection.sftpTabId, status: group.sftpConnection.status }
      : null;

  return (
    <div className="flex flex-col gap-1.5 px-3 py-2 hover:bg-accent/30 transition-colors">
      <div className="flex items-center gap-1.5 min-w-0 text-xs">
        <span className="font-medium text-foreground truncate">{group.hostLabel}</span>
        <HugeiconsIcon
          icon={Route01Icon}
          size={11}
          strokeWidth={1.75}
          className="shrink-0 text-muted-foreground"
        />
        <span className="text-muted-foreground truncate">{group.jumpHostName}</span>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        {terminalTarget && (
          <ConnectionPill
            icon={ComputerTerminal02Icon}
            label={
              group.terminalConnections.length > 1
                ? `Terminal ×${group.terminalConnections.length}`
                : "Terminal"
            }
            status={terminalPillStatus(group.terminalConnections)}
            title={`Jump to ${group.hostLabel} terminal`}
            onClick={() => focusPane(terminalTarget.workspaceTabId, terminalTarget.paneId)}
          />
        )}
        {sftpTarget && (
          <ConnectionPill
            icon={CloudServerIcon}
            label="SFTP"
            status={sftpTarget.status}
            title={`Jump to ${group.hostLabel} SFTP`}
            onClick={() => useTabsStore.getState().setActiveId(sftpTarget.sftpTabId)}
          />
        )}
        {group.explorerStatus && (
          <ConnectionPill
            icon={FolderTreeIcon}
            label="Explorer"
            status={group.explorerStatus}
            title={group.explorerTabId ? `Jump to ${group.hostLabel} Git tab` : "Show Explorer sidebar"}
            onClick={() =>
              group.explorerTabId
                ? useTabsStore.getState().setActiveId(group.explorerTabId)
                : onPanelToggle?.("explorer")
            }
          />
        )}
      </div>
    </div>
  );
}

export function JumpHostDropdown({ onPanelToggle }: { onPanelToggle?: (panel: SidebarPanel) => void }) {
  const groups = useJumpHostGroups();
  const placement = usePreferencesStore((s) => s.barItemPlacements.jumpHosts);
  const { side: popoverSide, align } = getPopoverPlacement(placement.bar, placement.side);
  const compact = placement.bar === "statusbar";
  const hasError = groups.some((g) => g.hasError);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "relative shrink-0 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground",
            compact ? "size-5" : "size-7",
          )}
          title="Jump Host Connections"
        >
          <HugeiconsIcon icon={Route01Icon} size={compact ? 12 : 16} strokeWidth={1.75} />
          {groups.length > 0 && (
            <span
              className={cn(
                "absolute flex items-center justify-center rounded-full font-bold text-white",
                compact
                  ? "-right-0.5 -top-0.5 h-2.5 min-w-[10px] px-0.5 text-[7px]"
                  : "-right-0.5 -top-0.5 h-3.5 min-w-[14px] px-0.5 text-[9px]",
                hasError ? "bg-destructive animate-pulse" : "bg-primary",
              )}
            >
              {groups.length}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent side={popoverSide} align={align} className="w-[360px] p-0 max-h-[480px] flex flex-col">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
          <span className="text-sm font-semibold">Jump Host Connections</span>
        </div>
        {groups.length === 0 ? (
          <div className="flex items-center justify-center h-20 text-sm text-muted-foreground select-none">
            No jump host connections
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto divide-y divide-border/40">
            {groups.map((group) => (
              <HostGroupRow key={group.hostId} group={group} onPanelToggle={onPanelToggle} />
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
