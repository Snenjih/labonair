import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  DndContext,
  type DragEndEvent,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { GroupCard } from "./GroupCard";
import { HostCard } from "./HostCard";
import { HostListItem } from "./HostListItem";
import { HostFormPanel } from "./HostFormPanel";
import { CredentialFormPanel } from "./CredentialFormPanel";
import { CredentialListItem } from "./CredentialListItem";
import { CredentialCard } from "./CredentialCard";
import { SshConfigImportDialog } from "./SshConfigImportDialog";
import { useHostsStore } from "../store/hostsStore";
import { useCredentialsStore } from "../store/credentialsStore";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { setHmLayout, setHmSort } from "@/modules/settings/store";
import type { Group, Host } from "../types";

type LayoutMode = "grid" | "list";
type SortMode = "last_connected" | "a_z" | "z_a";

function applySorting<T extends { name: string; last_connected_at?: number; created_at: number }>(
  items: T[],
  mode: SortMode,
): T[] {
  if (mode === "a_z") return [...items].sort((a, b) => a.name.localeCompare(b.name));
  if (mode === "z_a") return [...items].sort((a, b) => b.name.localeCompare(a.name));
  return [...items].sort((a, b) => {
    const ta = a.last_connected_at ?? 0;
    const tb = b.last_connected_at ?? 0;
    if (ta !== tb) return tb - ta;
    return b.created_at - a.created_at;
  });
}

function applyHostSorting(hosts: Host[], mode: SortMode): Host[] {
  // Pin-to-top always wins — sort within each group separately, then concat
  const pinned = hosts.filter((h) => h.pin_to_top);
  const rest = hosts.filter((h) => !h.pin_to_top);
  return [...applySorting(pinned, mode), ...applySorting(rest, mode)];
}

function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-lg bg-muted" />
        <div className="flex-1 space-y-2 pt-1">
          <div className="h-3 w-3/4 rounded bg-muted" />
          <div className="h-2.5 w-1/2 rounded bg-muted" />
        </div>
      </div>
      <div className="flex gap-2">
        <div className="h-5 w-10 rounded bg-muted" />
        <div className="h-5 w-16 rounded bg-muted" />
      </div>
    </div>
  );
}

function SkeletonListRow() {
  return (
    <div className="animate-pulse flex items-center gap-3 px-4 py-3 border-b border-border/40 last:border-0">
      <div className="h-8 w-8 rounded-lg bg-muted shrink-0" />
      <div className="flex-1 space-y-1.5">
        <div className="h-3 w-1/3 rounded bg-muted" />
        <div className="h-2.5 w-1/2 rounded bg-muted" />
      </div>
      <div className="h-3 w-16 rounded bg-muted shrink-0" />
    </div>
  );
}

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-start gap-4 text-center px-8 pt-12">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
        <svg
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="2" y="3" width="20" height="14" rx="2" />
          <path d="M8 21h8M12 17v4" />
        </svg>
      </div>
      <div className="space-y-1">
        <h3 className="text-base font-semibold text-foreground">No hosts yet</h3>
        <p className="text-sm text-muted-foreground max-w-xs">
          Add your first SSH host to get started. Credentials are stored securely in your Keychain.
        </p>
      </div>
      <Button size="sm" onClick={onNew} className="mt-2">
        Add First Host
      </Button>
    </div>
  );
}

type ConnectFn = (hostId: string, title: string) => void;
type QuickConnectFn = (username: string, hostAddress: string, port: number) => void;

interface SortableHostCardProps {
  host: Host;
  isSelected: boolean;
  isMultiSelected: boolean;
  onSelect: (e: React.MouseEvent) => void;
  onEdit: () => void;
  group?: import("../types").Group;
  newSshTab: ConnectFn;
  newSftpTab: ConnectFn;
  pingStatus?: "online" | "offline" | "checking";
  layoutMode: LayoutMode;
  dndDisabled: boolean;
}

function SortableHostCard({
  host,
  isSelected,
  isMultiSelected,
  onSelect,
  onEdit,
  group,
  newSshTab,
  newSftpTab,
  pingStatus,
  layoutMode,
  dndDisabled,
}: SortableHostCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: host.id,
    disabled: dndDisabled,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} className={layoutMode === "grid" ? "w-[260px]" : undefined}>
      {layoutMode === "list" ? (
        <HostListItem
          host={host}
          isSelected={isSelected}
          isMultiSelected={isMultiSelected}
          onSelect={onSelect}
          onEdit={onEdit}
          group={group}
          dragHandleProps={{ ...attributes, ...listeners }}
          newSshTab={newSshTab}
          newSftpTab={newSftpTab}
          pingStatus={pingStatus}
        />
      ) : (
        <HostCard
          host={host}
          isSelected={isSelected}
          isMultiSelected={isMultiSelected}
          onSelect={onSelect}
          onEdit={onEdit}
          group={group}
          dragHandleProps={{ ...attributes, ...listeners }}
          newSshTab={newSshTab}
          newSftpTab={newSftpTab}
          pingStatus={pingStatus}
        />
      )}
    </div>
  );
}

const AUTO_REFRESH_MS = 30_000;

const SORT_LABELS: Record<SortMode, string> = {
  last_connected: "Last Connected",
  a_z: "A–Z",
  z_a: "Z–A",
};

export function HomeDashboard({
  newSshTab,
  newQuickSshTab,
  newSftpTab,
}: {
  newSshTab: ConnectFn;
  newQuickSshTab: QuickConnectFn;
  newSftpTab: ConnectFn;
}) {
  const hosts = useHostsStore((s) => s.hosts);
  const groups = useHostsStore((s) => s.groups);
  const selectedHostId = useHostsStore((s) => s.selectedHostId);
  const selectedHostIds = useHostsStore((s) => s.selectedHostIds);
  const isLoading = useHostsStore((s) => s.isLoading);
  const hasFetched = useHostsStore((s) => s.hasFetched);
  const fetchError = useHostsStore((s) => s.fetchError);
  const fetchData = useHostsStore((s) => s.fetchData);
  const startPingWorker = useHostsStore((s) => s.startPingWorker);
  const stopPingWorker = useHostsStore((s) => s.stopPingWorker);
  const hostPingInterval = usePreferencesStore((s) => s.hostPingInterval);
  const createGroup = useHostsStore((s) => s.createGroup);
  const deleteGroup = useHostsStore((s) => s.deleteGroup);
  const renameGroup = useHostsStore((s) => s.renameGroup);
  const setSelectedHost = useHostsStore((s) => s.setSelectedHost);
  const selectHost = useHostsStore((s) => s.selectHost);
  const reorderHosts = useHostsStore((s) => s.reorderHosts);
  const hostStatuses = useHostsStore((s) => s.hostStatuses);

  const credentials = useCredentialsStore((s) => s.credentials);
  const selectedCredentialId = useCredentialsStore((s) => s.selectedCredentialId);
  const setSelectedCredential = useCredentialsStore((s) => s.setSelectedCredential);
  const fetchCredentials = useCredentialsStore((s) => s.fetchCredentials);
  const credsFetched = useCredentialsStore((s) => s.hasFetched);
  const duplicateCredential = useCredentialsStore((s) => s.duplicateCredential);

  const [viewMode, setViewMode] = useState<"hosts" | "credentials">("hosts");
  const [search, setSearch] = useState("");
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [showImportDialog, setShowImportDialog] = useState(false);

  const [addingGroup, setAddingGroup] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [groupToDelete, setGroupToDelete] = useState<Group | null>(null);
  const groupInputRef = useRef<HTMLInputElement>(null);

  const layoutMode = usePreferencesStore((s) => s.hmLayout);
  const sortMode = usePreferencesStore((s) => s.hmSort);
  const setLayoutMode = (m: LayoutMode) => void setHmLayout(m);
  const setSortMode = (m: SortMode) => void setHmSort(m);

  // Local ordered list for dnd (mirrors store but allows optimistic reorder)
  const [localHosts, setLocalHosts] = useState<Host[]>([]);
  useEffect(() => {
    setLocalHosts(hosts);
  }, [hosts]);

  // Initial load
  useEffect(() => {
    void fetchData();
  }, [fetchData]);
  useEffect(() => {
    if (!credsFetched) void fetchCredentials();
  }, [fetchCredentials, credsFetched]);

  // Ping worker lifecycle — restarts whenever the interval preference changes
  useEffect(() => {
    startPingWorker(hostPingInterval);
    return () => stopPingWorker();
  }, [startPingWorker, stopPingWorker, hostPingInterval]);

  // Auto-refresh every 30 s
  useEffect(() => {
    const id = setInterval(() => {
      void fetchData();
    }, AUTO_REFRESH_MS);
    return () => clearInterval(id);
  }, [fetchData]);

  // Refresh when the window regains focus
  useEffect(() => {
    const onFocus = () => {
      void fetchData();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [fetchData]);

  useEffect(() => {
    if (addingGroup) setTimeout(() => groupInputRef.current?.focus(), 50);
  }, [addingGroup]);

  const filteredHosts = useMemo(() => {
    let list = localHosts;
    if (activeGroupId) list = list.filter((h) => h.group_id === activeGroupId);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (h) =>
          h.name.toLowerCase().includes(q) ||
          h.host_address.toLowerCase().includes(q) ||
          h.username.toLowerCase().includes(q),
      );
    }
    return list;
  }, [localHosts, activeGroupId, search]);

  const sortedHosts = useMemo(() => applyHostSorting(filteredHosts, sortMode), [filteredHosts, sortMode]);

  const filteredCredentials = useMemo(() => {
    if (!search.trim()) return credentials;
    const q = search.toLowerCase();
    return credentials.filter((c) => c.name.toLowerCase().includes(q) || c.cred_type.includes(q));
  }, [credentials, search]);

  const sortedCredentials = useMemo(
    () => applySorting(filteredCredentials, sortMode),
    [filteredCredentials, sortMode],
  );

  const quickConnectMatch = useMemo(() => {
    const q = search.trim();
    const m = q.match(/^([^@\s]+)@([^:\s]+)(?::(\d+))?$/);
    if (!m) return null;
    return { username: m[1], hostAddress: m[2], port: m[3] ? parseInt(m[3], 10) : 22 };
  }, [search]);

  const handleGroupKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && groupName.trim()) {
      await createGroup(groupName.trim());
      setGroupName("");
      setAddingGroup(false);
    }
    if (e.key === "Escape") {
      setGroupName("");
      setAddingGroup(false);
    }
  };

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const handleDragEnd = async (event: DragEndEvent) => {
    // DnD only works in last_connected (natural) order — ignore drags when sorted
    if (sortMode !== "last_connected") return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = localHosts.findIndex((h) => h.id === active.id);
    const newIndex = localHosts.findIndex((h) => h.id === over.id);
    const reordered = arrayMove(localHosts, oldIndex, newIndex);
    setLocalHosts(reordered);
    const items = reordered.map((h, i) => ({ id: h.id, sort_order: i }));
    await reorderHosts(items);
  };

  const panelHostId = selectedHostId;
  const showPanel =
    (viewMode === "hosts" && panelHostId !== null) ||
    (viewMode === "credentials" && selectedCredentialId !== null);

  const handleCardSelect = (host: Host) => (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey) {
      selectHost(host.id, "toggle");
    } else if (e.shiftKey) {
      selectHost(host.id, "range");
    } else {
      setSelectedHost(selectedHostId === host.id ? null : host.id);
    }
  };

  const dndDisabled = sortMode !== "last_connected";

  // Prevents Radix from stealing focus back to the trigger after "New Group" is clicked,
  // which would immediately fire onBlur on the group input and hide it.
  const suppressDropdownFocusReturn = useRef(false);

  return (
    <div className="flex h-full w-full overflow-hidden">
      {/* LEFT MASTER PANE */}
      <div className="flex flex-1 flex-col overflow-hidden min-w-0">
        {/* ── Row 1: Search ── */}
        <div className="flex items-center gap-2 px-4 pt-2.5 pb-2">
          <div className="relative flex-1">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              width="13"
              height="13"
              viewBox="0 0 13 13"
              fill="none"
            >
              <circle cx="5.5" cy="5.5" r="4.5" stroke="currentColor" strokeWidth="1.2" />
              <path d="M9 9l2.5 2.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
            <Input
              className="h-9 pl-9 text-sm bg-muted border-0 focus-visible:ring-1"
              placeholder={
                viewMode === "hosts"
                  ? "Find a host or type user@hostname to quick-connect…"
                  : "Find a credential…"
              }
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* ── Row 2: Actions toolbar ── */}
        <div className="flex items-center gap-2 border-b border-border px-4 pb-2.5">
          {/* Split NEW button — dropdown includes New Group */}
          <div className="flex shrink-0">
            <Button
              size="sm"
              className="h-8 rounded-l-2xl rounded-r-none border-r border-primary-foreground/20 text-xs px-3"
              onClick={() => {
                if (viewMode === "hosts") setSelectedHost("__new__");
                else setSelectedCredential("__new__");
              }}
            >
              {viewMode === "hosts" ? "NEW HOST" : "NEW CREDENTIAL"}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" className="h-8 rounded-l-none rounded-r-2xl px-2 text-xs">
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path
                      d="M2 3.5L5 6.5L8 3.5"
                      stroke="currentColor"
                      strokeWidth="1.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                onCloseAutoFocus={(e) => {
                  if (suppressDropdownFocusReturn.current) {
                    suppressDropdownFocusReturn.current = false;
                    e.preventDefault();
                  }
                }}
              >
                <DropdownMenuItem
                  onClick={() => {
                    setViewMode("hosts");
                    setSelectedHost("__new__");
                  }}
                >
                  New Host
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    setViewMode("credentials");
                    setSelectedCredential("__new__");
                  }}
                >
                  New Credential
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  disabled={viewMode === "credentials"}
                  onClick={() => {
                    suppressDropdownFocusReturn.current = true;
                    setAddingGroup(true);
                  }}
                >
                  New Group
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  disabled={viewMode === "credentials"}
                  onClick={() => setShowImportDialog(true)}
                >
                  Import SSH Config
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Spacer — pushes layout, sort, and view toggle to the right */}
          <div className="flex-1" />

          {/* Layout toggle: Grid / List */}
          <div className="flex rounded-lg border border-input overflow-hidden shrink-0">
            <button
              onClick={() => setLayoutMode("grid")}
              title="Grid view"
              className={cn(
                "flex items-center justify-center px-2 h-8 transition-colors",
                layoutMode === "grid"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent",
              )}
            >
              {/* Grid icon */}
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <rect x="1" y="1" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3" />
                <rect x="8" y="1" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3" />
                <rect x="1" y="8" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3" />
                <rect x="8" y="8" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.3" />
              </svg>
            </button>
            <button
              onClick={() => setLayoutMode("list")}
              title="List view"
              className={cn(
                "flex items-center justify-center px-2 h-8 transition-colors",
                layoutMode === "list"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent",
              )}
            >
              {/* List icon */}
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path
                  d="M1 3h12M1 7h12M1 11h12"
                  stroke="currentColor"
                  strokeWidth="1.3"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>

          {/* Sort dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                className="h-8 px-2.5 text-xs rounded-2xl gap-1.5 shrink-0"
                title={dndDisabled ? "Switch to 'Last Connected' to enable drag reorder" : "Sort order"}
              >
                {/* Sort icon */}
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path
                    d="M1 3h10M3 6h6M5 9h2"
                    stroke="currentColor"
                    strokeWidth="1.3"
                    strokeLinecap="round"
                  />
                </svg>
                {SORT_LABELS[sortMode]}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={() => setSortMode("last_connected")}>
                <span className="flex items-center gap-2">
                  {sortMode === "last_connected" && <span className="text-primary">✓</span>}
                  {sortMode !== "last_connected" && <span className="w-3" />}
                  Last Connected
                </span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortMode("a_z")}>
                <span className="flex items-center gap-2">
                  {sortMode === "a_z" && <span className="text-primary">✓</span>}
                  {sortMode !== "a_z" && <span className="w-3" />}
                  A–Z
                </span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortMode("z_a")}>
                <span className="flex items-center gap-2">
                  {sortMode === "z_a" && <span className="text-primary">✓</span>}
                  {sortMode !== "z_a" && <span className="w-3" />}
                  Z–A
                </span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Separator */}
          <div className="h-5 w-px bg-border/60 shrink-0" />

          {/* View toggle: Hosts / Credentials — right side */}
          <div className="flex rounded-2xl border border-input overflow-hidden shrink-0">
            {(["hosts", "credentials"] as const).map((v) => (
              <button
                key={v}
                onClick={() => {
                  setViewMode(v);
                  setSearch("");
                  if (v === "hosts") setSelectedCredential(null);
                  else setSelectedHost(null);
                }}
                className={cn(
                  "px-3 h-8 text-xs font-medium transition-colors",
                  viewMode === v
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent",
                )}
              >
                {v === "hosts" ? "Hosts" : "Credentials"}
              </button>
            ))}
          </div>
        </div>

        {/* Error banner */}
        {fetchError && (
          <div className="flex items-center gap-2 border-b border-destructive/30 bg-destructive/10 px-4 py-2 text-xs text-destructive">
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" className="shrink-0">
              <circle cx="6.5" cy="6.5" r="5.5" stroke="currentColor" strokeWidth="1.2" />
              <path d="M6.5 4v3M6.5 8.5v.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
            <span className="flex-1 truncate">Failed to load hosts: {fetchError}</span>
            <Button
              size="sm"
              variant="outline"
              className="h-6 px-2 text-xs border-destructive/40 text-destructive hover:bg-destructive/10 shrink-0"
              onClick={() => void fetchData()}
              disabled={isLoading}
            >
              {isLoading ? "Retrying…" : "Retry"}
            </Button>
          </div>
        )}

        {/* Groups row — hosts view only */}
        {viewMode === "hosts" && (groups.length > 0 || addingGroup) && (
          <div className="flex items-center gap-2 overflow-x-auto border-b border-border px-4 py-2 scrollbar-none">
            {groups.map((g) => (
              <GroupCard
                key={g.id}
                group={g}
                isSelected={activeGroupId === g.id}
                onClick={() => setActiveGroupId(activeGroupId === g.id ? null : g.id)}
                hostCount={hosts.filter((h) => h.group_id === g.id).length}
                onDelete={() => setGroupToDelete(g)}
                onRename={(name) => void renameGroup(g.id, name)}
              />
            ))}
            {addingGroup && (
              <input
                ref={groupInputRef}
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                onKeyDown={handleGroupKeyDown}
                onBlur={() => {
                  setAddingGroup(false);
                  setGroupName("");
                }}
                placeholder="Group name…"
                className="h-8 rounded-lg border border-primary bg-card px-3 text-sm text-foreground outline-none ring-2 ring-primary/40 shrink-0"
              />
            )}
          </div>
        )}

        {/* Main content */}
        <div className="flex-1 overflow-y-auto p-4">
          {viewMode === "hosts" ? (
            <>
              {/* Quick connect suggestion */}
              {quickConnectMatch && (
                <button
                  onClick={() => {
                    newQuickSshTab(
                      quickConnectMatch.username,
                      quickConnectMatch.hostAddress,
                      quickConnectMatch.port,
                    );
                    setSearch("");
                  }}
                  className="mb-4 flex w-full items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-left hover:bg-primary/10 transition-colors"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/15">
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 14 14"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.4"
                      strokeLinecap="round"
                      className="text-primary"
                    >
                      <rect x="1" y="3" width="12" height="8" rx="1.5" />
                      <path d="M4 7l1.5 1.5L4 10M8 9.5h2" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">Quick Connect</p>
                    <p className="font-mono text-xs text-muted-foreground truncate">
                      {quickConnectMatch.username}@{quickConnectMatch.hostAddress}:{quickConnectMatch.port}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">↵ Connect</span>
                </button>
              )}

              {!hasFetched || isLoading ? (
                layoutMode === "list" ? (
                  <div className="flex flex-col rounded-xl border border-border overflow-hidden">
                    {[...Array(4)].map((_, i) => (
                      <SkeletonListRow key={i} />
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-4">
                    {[...Array(3)].map((_, i) => (
                      <div key={i} className="w-[260px]">
                        <SkeletonCard />
                      </div>
                    ))}
                  </div>
                )
              ) : sortedHosts.length === 0 && !search && !activeGroupId ? (
                <EmptyState onNew={() => setSelectedHost("__new__")} />
              ) : sortedHosts.length === 0 && !quickConnectMatch ? (
                <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
                  No hosts match your search
                </div>
              ) : sortedHosts.length > 0 ? (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <SortableContext
                    items={sortedHosts.map((h) => h.id)}
                    strategy={layoutMode === "list" ? verticalListSortingStrategy : rectSortingStrategy}
                  >
                    {layoutMode === "list" ? (
                      <div className="flex flex-col rounded-xl border border-border overflow-hidden">
                        {sortedHosts.map((host) => (
                          <div key={host.id} className="border-b border-border/40 last:border-0">
                            <SortableHostCard
                              host={host}
                              isSelected={selectedHostId === host.id}
                              isMultiSelected={selectedHostIds.has(host.id)}
                              onSelect={handleCardSelect(host)}
                              onEdit={() => setSelectedHost(host.id)}
                              group={groups.find((g) => g.id === host.group_id)}
                              newSshTab={newSshTab}
                              newSftpTab={newSftpTab}
                              pingStatus={hostStatuses[host.id]}
                              layoutMode={layoutMode}
                              dndDisabled={dndDisabled}
                            />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-4">
                        {sortedHosts.map((host) => (
                          <SortableHostCard
                            key={host.id}
                            host={host}
                            isSelected={selectedHostId === host.id}
                            isMultiSelected={selectedHostIds.has(host.id)}
                            onSelect={handleCardSelect(host)}
                            onEdit={() => setSelectedHost(host.id)}
                            group={groups.find((g) => g.id === host.group_id)}
                            newSshTab={newSshTab}
                            newSftpTab={newSftpTab}
                            pingStatus={hostStatuses[host.id]}
                            layoutMode={layoutMode}
                            dndDisabled={dndDisabled}
                          />
                        ))}
                      </div>
                    )}
                  </SortableContext>
                </DndContext>
              ) : null}
            </>
          ) : (
            /* Credentials — grid or list */
            <div className="flex flex-col">
              {credentials.length === 0 ? (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex h-full flex-col items-center justify-center gap-4 text-center px-8 py-16"
                >
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
                    <svg
                      width="32"
                      height="32"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <circle cx="7.5" cy="15.5" r="5.5" />
                      <path d="m21 2-9.6 9.6" />
                      <path d="m15.5 7.5 3 3L22 7l-3-3" />
                    </svg>
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-base font-semibold text-foreground">No credentials yet</h3>
                    <p className="text-sm text-muted-foreground max-w-xs">
                      Store reusable passwords or SSH keys here and reference them from multiple hosts.
                    </p>
                  </div>
                  <Button size="sm" onClick={() => setSelectedCredential("__new__")} className="mt-2">
                    Add First Credential
                  </Button>
                </motion.div>
              ) : filteredCredentials.length === 0 ? (
                <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
                  No credentials match your search
                </div>
              ) : layoutMode === "grid" ? (
                <div className="flex flex-wrap gap-4">
                  {sortedCredentials.map((cred) => (
                    <div key={cred.id} className="w-[260px]">
                      <CredentialCard
                        credential={cred}
                        hostsCount={hosts.filter((h) => h.credential_id === cred.id).length}
                        isSelected={selectedCredentialId === cred.id}
                        onClick={() =>
                          setSelectedCredential(selectedCredentialId === cred.id ? null : cred.id)
                        }
                        onEdit={() => setSelectedCredential(cred.id)}
                        onDuplicate={async () => {
                          const dup = await duplicateCredential(cred.id);
                          setSelectedCredential(dup.id);
                        }}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="divide-y divide-border rounded-lg border border-border overflow-hidden">
                  {sortedCredentials.map((cred) => (
                    <CredentialListItem
                      key={cred.id}
                      credential={cred}
                      hostsCount={hosts.filter((h) => h.credential_id === cred.id).length}
                      isSelected={selectedCredentialId === cred.id}
                      onClick={() => setSelectedCredential(selectedCredentialId === cred.id ? null : cred.id)}
                      onEdit={() => setSelectedCredential(cred.id)}
                      onDuplicate={async () => {
                        const dup = await duplicateCredential(cred.id);
                        setSelectedCredential(dup.id);
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* RIGHT PANEL (Form / Inspector) */}
      <AnimatePresence>
        {showPanel && (
          <motion.div
            key={viewMode === "hosts" ? (panelHostId ?? "__new__") : (selectedCredentialId ?? "__new__cred")}
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 340, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="shrink-0 border-l border-border overflow-hidden bg-background flex flex-col"
          >
            <div className="h-full w-[340px] flex flex-col">
              {viewMode === "hosts" ? (
                <HostFormPanel
                  hostId={panelHostId}
                  onClose={() => setSelectedHost(null)}
                  newSshTab={newSshTab}
                  newSftpTab={newSftpTab}
                  onNavigateToCredentials={() => {
                    setViewMode("credentials");
                    setSelectedCredential("__new__");
                  }}
                />
              ) : (
                <CredentialFormPanel
                  credentialId={selectedCredentialId}
                  onClose={() => setSelectedCredential(null)}
                />
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* SSH Config Import dialog */}
      <SshConfigImportDialog
        open={showImportDialog}
        onClose={() => setShowImportDialog(false)}
        onImported={() => {
          void useHostsStore.getState().fetchData();
          setShowImportDialog(false);
        }}
      />

      {/* Delete group confirmation */}
      <AlertDialog
        open={!!groupToDelete}
        onOpenChange={(open) => {
          if (!open) setGroupToDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{groupToDelete?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              The group will be deleted. Hosts in this group will not be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (groupToDelete) {
                  void deleteGroup(groupToDelete.id);
                  if (activeGroupId === groupToDelete.id) setActiveGroupId(null);
                  setGroupToDelete(null);
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
