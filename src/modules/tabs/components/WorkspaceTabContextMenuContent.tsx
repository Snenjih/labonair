import { Cancel01Icon, PencilEdit02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";
import { useHostsStore } from "@/modules/hosts/store/hostsStore";
import { getLocalPtyId } from "@/modules/terminal/lib/terminalSessionRegistry";
import { labelFor, pluralLabelFor } from "../lib/tabUtils";
import { setAgentAccessGrant, useAgentAccessStore } from "../store/agentAccessStore";
import type { Tab, WorkspaceTab } from "../types";

export interface WorkspaceTabContextMenuContentProps {
  tab: WorkspaceTab;
  tabsLength: number;
  onStartRename: () => void;
  onClose: (id: number) => void;
  onCloseByKind: (kind: Tab["kind"]) => void;
}

/**
 * Shared workspace-tab context menu (rename + AI-agent-access grant + close
 * variants) — used identically by `TabBar` and `SidebarTabList` so a feature
 * added here (like the agent-access checkbox) never needs adding twice.
 */
export function WorkspaceTabContextMenuContent({
  tab,
  tabsLength,
  onStartRename,
  onClose,
  onCloseByKind,
}: WorkspaceTabContextMenuContentProps) {
  const agentAccessEntries = useAgentAccessStore((s) => s.entries);
  const agentBridgeEnabled = useAgentAccessStore((s) => s.bridgeEnabled);
  const hosts = useHostsStore((s) => s.hosts);

  const activeSession = tab.sessions[tab.activePaneId];
  const isSsh = activeSession?.kind === "ssh";
  const isLocal = activeSession?.kind === "local";
  const isGranted = Boolean(agentAccessEntries[tab.id]);
  const sessionHost = isSsh ? hosts.find((h) => h.id === activeSession?.hostId) : undefined;
  const hostBlocked = isSsh && sessionHost?.block_agent_access === true;

  return (
    <ContextMenuContent className="min-w-36" onCloseAutoFocus={(e) => e.preventDefault()}>
      <ContextMenuItem onSelect={onStartRename}>
        <HugeiconsIcon icon={PencilEdit02Icon} size={14} strokeWidth={1.75} />
        <span className="flex-1">Rename</span>
      </ContextMenuItem>
      {(isSsh || isLocal) && activeSession && agentBridgeEnabled && (
        <>
          <ContextMenuSeparator />
          <ContextMenuCheckboxItem
            checked={isGranted}
            disabled={hostBlocked}
            title={hostBlocked ? "This host has AI agent access blocked in its settings" : undefined}
            onCheckedChange={(checked) =>
              void setAgentAccessGrant(
                tab.id,
                activeSession.id,
                checked,
                labelFor(tab),
                isSsh ? "ssh" : "local",
                isSsh ? { hostId: activeSession.hostId } : { localPtyId: getLocalPtyId(activeSession.id) },
              )
            }
          >
            Grant AI Agent Access
          </ContextMenuCheckboxItem>
        </>
      )}
      {tabsLength > 1 && (
        <>
          <ContextMenuSeparator />
          <ContextMenuItem onSelect={() => onClose(tab.id)}>
            <HugeiconsIcon icon={Cancel01Icon} size={14} strokeWidth={1.75} />
            <span className="flex-1">Close</span>
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => onCloseByKind(tab.kind)}>
            <span className="flex-1">Close All {pluralLabelFor(tab.kind)}</span>
          </ContextMenuItem>
        </>
      )}
    </ContextMenuContent>
  );
}
