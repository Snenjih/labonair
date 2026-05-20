import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Tab } from "@/modules/tabs";
import {
  DndContext,
  DragEndEvent,
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
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { GroupCard } from "./GroupCard";
import { HostCard } from "./HostCard";
import { HostFormPanel } from "./HostFormPanel";
import { useHostsStore } from "../store/hostsStore";
import { usePreferencesStore } from "@/modules/settings/preferences";
import type { Host } from "../types";

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

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex h-full flex-col items-center justify-center gap-4 text-center px-8"
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted text-3xl">
        🖥️
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
    </motion.div>
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
  tabs: Tab[];
  pingStatus?: "online" | "offline" | "checking";
}

function SortableHostCard({ host, isSelected, isMultiSelected, onSelect, onEdit, group, newSshTab, newSftpTab, tabs, pingStatus }: SortableHostCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: host.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <div ref={setNodeRef} style={style}>
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
        tabs={tabs}
        pingStatus={pingStatus}
      />
    </div>
  );
}

const AUTO_REFRESH_MS = 30_000;

export function HomeDashboard({ newSshTab, newQuickSshTab, newSftpTab, tabs }: { newSshTab: ConnectFn; newQuickSshTab: QuickConnectFn; newSftpTab: ConnectFn; tabs: Tab[] }) {
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
  const setSelectedHost = useHostsStore((s) => s.setSelectedHost);
  const selectHost = useHostsStore((s) => s.selectHost);
  const reorderHosts = useHostsStore((s) => s.reorderHosts);
  const hostStatuses = useHostsStore((s) => s.hostStatuses);

  const [search, setSearch] = useState("");
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);

  const [addingGroup, setAddingGroup] = useState(false);
  const [groupName, setGroupName] = useState("");
  const groupInputRef = useRef<HTMLInputElement>(null);

  // Local ordered list for dnd (mirrors store but allows optimistic reorder)
  const [localHosts, setLocalHosts] = useState<Host[]>([]);
  useEffect(() => { setLocalHosts(hosts); }, [hosts]);

  // Initial load
  useEffect(() => { void fetchData(); }, [fetchData]);

  // Ping worker lifecycle — restarts whenever the interval preference changes
  useEffect(() => {
    startPingWorker(hostPingInterval);
    return () => stopPingWorker();
  }, [startPingWorker, stopPingWorker, hostPingInterval]);

  // Auto-refresh every 30 s
  useEffect(() => {
    const id = setInterval(() => { void fetchData(); }, AUTO_REFRESH_MS);
    return () => clearInterval(id);
  }, [fetchData]);

  // Refresh when the window regains focus
  useEffect(() => {
    const onFocus = () => { void fetchData(); };
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

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = localHosts.findIndex((h) => h.id === active.id);
    const newIndex = localHosts.findIndex((h) => h.id === over.id);
    const reordered = arrayMove(localHosts, oldIndex, newIndex);
    setLocalHosts(reordered);
    const items = reordered.map((h, i) => ({ id: h.id, sort_order: i }));
    await reorderHosts(items);
  };

  const panelHostId = selectedHostId; // null or a real id or "__new__"
  const showPanel = panelHostId !== null;

  const handleCardSelect = (host: Host) => (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey) {
      selectHost(host.id, "toggle");
    } else if (e.shiftKey) {
      selectHost(host.id, "range");
    } else {
      setSelectedHost(selectedHostId === host.id ? null : host.id);
    }
  };

  return (
    <div className="flex h-full w-full overflow-hidden">
      {/* LEFT MASTER PANE */}
      <div className="flex flex-1 flex-col overflow-hidden min-w-0">
        {/* Toolbar */}
        <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
          <div className="relative flex-1">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              width="13" height="13" viewBox="0 0 13 13" fill="none"
            >
              <circle cx="5.5" cy="5.5" r="4.5" stroke="currentColor" strokeWidth="1.2" />
              <path d="M9 9l2.5 2.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
            <Input
              className="h-9 pl-9 text-sm bg-muted border-0 focus-visible:ring-1"
              placeholder="Find a host or ssh user@hostname…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button
            size="sm"
            className="h-9 px-3 text-xs shrink-0"
            onClick={() => setSelectedHost("__new__")}
          >
            + New Host
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-9 px-3 text-xs shrink-0"
            onClick={() => setAddingGroup(true)}
          >
            + Group
          </Button>
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

        {/* Groups row */}
        {(groups.length > 0 || addingGroup) && (
          <div className="flex items-center gap-2 overflow-x-auto border-b border-border px-4 py-2 scrollbar-none">
            {groups.map((g) => (
              <GroupCard
                key={g.id}
                group={g}
                isSelected={activeGroupId === g.id}
                onClick={() => setActiveGroupId(activeGroupId === g.id ? null : g.id)}
                hostCount={hosts.filter((h) => h.group_id === g.id).length}
              />
            ))}
            {addingGroup && (
              <input
                ref={groupInputRef}
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                onKeyDown={handleGroupKeyDown}
                onBlur={() => { setAddingGroup(false); setGroupName(""); }}
                placeholder="Group name…"
                className="h-8 rounded-lg border border-primary bg-card px-3 text-sm text-foreground outline-none ring-2 ring-primary/40 shrink-0"
              />
            )}
          </div>
        )}

        {/* Host grid */}
        <div className="flex-1 overflow-y-auto p-4">
          {/* Quick connect suggestion */}
          {quickConnectMatch && (
            <button
              onClick={() => {
                newQuickSshTab(quickConnectMatch.username, quickConnectMatch.hostAddress, quickConnectMatch.port);
                setSearch("");
              }}
              className="mb-4 flex w-full items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-left hover:bg-primary/10 transition-colors"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/15">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" className="text-primary">
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
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {[...Array(3)].map((_, i) => <SkeletonCard key={i} />)}
            </div>
          ) : filteredHosts.length === 0 && !search && !activeGroupId ? (
            <EmptyState onNew={() => setSelectedHost("__new__")} />
          ) : filteredHosts.length === 0 && !quickConnectMatch ? (
            <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
              No hosts match your search
            </div>
          ) : filteredHosts.length > 0 ? (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={filteredHosts.map((h) => h.id)} strategy={rectSortingStrategy}>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {filteredHosts.map((host) => (
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
                      tabs={tabs}
                      pingStatus={hostStatuses[host.id]}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          ) : null}
        </div>
      </div>

      {/* RIGHT PANEL (Form / Inspector) */}
      <AnimatePresence>
        {showPanel && (
          <motion.div
            key={panelHostId ?? "__new__"}
            initial={{ x: 340, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 340, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="w-[340px] shrink-0 border-l border-border overflow-hidden bg-background flex flex-col"
          >
            <HostFormPanel
              hostId={panelHostId}
              onClose={() => setSelectedHost(null)}
              newSshTab={newSshTab}
              newSftpTab={newSftpTab}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
