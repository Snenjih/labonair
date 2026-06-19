import { fileIconUrl } from "@/modules/explorer/lib/iconResolver";
import { useHostsStore } from "@/modules/hosts/store/hostsStore";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import {
  CloudServerIcon,
  ComputerTerminal02Icon,
  Folder01Icon,
  Folder02Icon,
  GitBranchIcon,
  GitCompareIcon,
  Globe02Icon,
  Home03Icon,
  PencilEdit02Icon,
  TerminalIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { Tab, WorkspaceTab } from "../types";

// --- Shared hook ---

export function useRecentHosts(limit = 5) {
  const hosts = useHostsStore((s) => s.hosts);
  return [...hosts]
    .sort((a, b) => (b.last_connected_at ?? 0) - (a.last_connected_at ?? 0))
    .slice(0, limit);
}

// --- Shared label function ---

export function labelFor(t: Tab): string {
  if (t.kind === "editor") return t.title;
  if (t.kind === "preview") return t.title;
  if (t.kind === "ai-diff") return t.title;
  if (t.kind === "home") return t.title;
  if (t.kind === "sftp") return t.title;
  if (t.kind === "agent-fleet") return t.title;
  if (t.kind === "git-graph") return t.title;
  if (t.kind === "git-diff") return t.title;
  const wt = t as WorkspaceTab;
  if (wt.customTitle) return wt.customTitle;
  const activeSession = wt.sessions[wt.activePaneId];
  if (activeSession?.kind === "local" && activeSession.cwd) {
    const parts = activeSession.cwd.split("/").filter(Boolean);
    return parts.length ? parts[parts.length - 1] : "/";
  }
  return wt.title;
}

// --- Shared icon component ---

export function TabIconFor({ tab, active }: { tab: Tab; active: boolean }) {
  if (tab.kind === "editor") {
    const url = fileIconUrl(tab.title);
    return url ? <img src={url} alt="" className="size-3.5 shrink-0" /> : null;
  }
  if (tab.kind === "preview") {
    return (
      <HugeiconsIcon icon={Globe02Icon} size={14} strokeWidth={1.75} className="shrink-0" />
    );
  }
  if (tab.kind === "ai-diff") {
    return (
      <HugeiconsIcon icon={GitCompareIcon} size={14} strokeWidth={1.75} className="shrink-0 text-warning" />
    );
  }
  if (tab.kind === "home") {
    return (
      <HugeiconsIcon icon={Home03Icon} size={14} strokeWidth={1.75} className="shrink-0" />
    );
  }
  if (tab.kind === "sftp") {
    return (
      <HugeiconsIcon icon={CloudServerIcon} size={14} strokeWidth={1.75} className="shrink-0" />
    );
  }
  if (tab.kind === "agent-fleet") {
    return (
      <HugeiconsIcon icon={ComputerTerminal02Icon} size={14} strokeWidth={1.75} className="shrink-0" />
    );
  }
  if (tab.kind === "git-graph") {
    return (
      <HugeiconsIcon icon={GitBranchIcon} size={14} strokeWidth={1.75} className="shrink-0" />
    );
  }
  if (tab.kind === "git-diff") {
    return (
      <HugeiconsIcon icon={GitCompareIcon} size={14} strokeWidth={1.75} className="shrink-0 text-modified" />
    );
  }
  if (tab.kind === "workspace") {
    const wt = tab as WorkspaceTab;
    const activeSession = wt.sessions[wt.activePaneId];
    const icon =
      activeSession?.kind === "ssh"
        ? ComputerTerminal02Icon
        : TerminalIcon;
    return (
      <HugeiconsIcon icon={icon} size={14} strokeWidth={1.75} className="shrink-0" />
    );
  }
  return (
    <HugeiconsIcon
      icon={active ? Folder02Icon : Folder01Icon}
      size={14}
      strokeWidth={2}
      className="shrink-0"
    />
  );
}

// --- Shared new-tab dropdown items ---

interface NewTabDropdownItemsProps {
  onNew: () => void;
  onNewPreview: () => void;
  onNewEditor: () => void;
  onNewSsh: (hostId: string, title: string) => void;
  onNewSftp: (hostId: string, title: string) => void;
  onOpenHostManager: () => void;
  onNewGitGraph?: () => void;
  onNewAgentFleet?: () => void;
}

export function NewTabDropdownItems({
  onNew,
  onNewPreview,
  onNewEditor,
  onNewSsh,
  onNewSftp,
  onOpenHostManager,
  onNewGitGraph,
  onNewAgentFleet,
}: NewTabDropdownItemsProps) {
  const recentHosts = useRecentHosts();
  return (
    <>
      <DropdownMenuItem onSelect={() => onNew()}>
        <HugeiconsIcon icon={TerminalIcon} size={14} strokeWidth={1.75} />
        <span className="flex-1">Terminal</span>
        <span className="text-xs text-muted-foreground">⌘T</span>
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={() => onNewEditor()}>
        <HugeiconsIcon icon={PencilEdit02Icon} size={14} strokeWidth={1.75} />
        <span className="flex-1">Editor</span>
        <span className="text-xs text-muted-foreground">⌘E</span>
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={() => onNewPreview()}>
        <HugeiconsIcon icon={Globe02Icon} size={14} strokeWidth={1.75} />
        <span className="flex-1">Preview</span>
        <span className="text-xs text-muted-foreground">⌘P</span>
      </DropdownMenuItem>
      {onNewGitGraph && (
        <DropdownMenuItem onSelect={onNewGitGraph}>
          <HugeiconsIcon icon={GitBranchIcon} size={14} strokeWidth={1.75} />
          <span className="flex-1">Git Graph</span>
        </DropdownMenuItem>
      )}
      {onNewAgentFleet && (
        <DropdownMenuItem onSelect={onNewAgentFleet}>
          <HugeiconsIcon icon={ComputerTerminal02Icon} size={14} strokeWidth={1.75} />
          <span className="flex-1">Agent Fleet</span>
        </DropdownMenuItem>
      )}
      <DropdownMenuSeparator />
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>
          <HugeiconsIcon icon={ComputerTerminal02Icon} size={14} strokeWidth={1.75} />
          <span className="flex-1">SSH</span>
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="min-w-48">
          {recentHosts.length === 0 ? (
            <DropdownMenuItem disabled>
              <span>No hosts yet</span>
            </DropdownMenuItem>
          ) : (
            recentHosts.map((host) => (
              <DropdownMenuItem key={host.id} onSelect={() => onNewSsh(host.id, host.name)}>
                <span className="flex-1 truncate">{host.name}</span>
                <span className="ml-2 text-xs text-muted-foreground truncate max-w-28">
                  {host.host_address}
                </span>
              </DropdownMenuItem>
            ))
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={onOpenHostManager}>
            <span>All hosts...</span>
          </DropdownMenuItem>
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>
          <HugeiconsIcon icon={CloudServerIcon} size={14} strokeWidth={1.75} />
          <span className="flex-1">SFTP</span>
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="min-w-48">
          {recentHosts.length === 0 ? (
            <DropdownMenuItem disabled>
              <span>No hosts yet</span>
            </DropdownMenuItem>
          ) : (
            recentHosts.map((host) => (
              <DropdownMenuItem key={host.id} onSelect={() => onNewSftp(host.id, host.name)}>
                <span className="flex-1 truncate">{host.name}</span>
                <span className="ml-2 text-xs text-muted-foreground truncate max-w-28">
                  {host.host_address}
                </span>
              </DropdownMenuItem>
            ))
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={onOpenHostManager}>
            <span>All hosts...</span>
          </DropdownMenuItem>
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    </>
  );
}
