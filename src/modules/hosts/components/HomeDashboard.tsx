import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

interface SortableHostCardProps {
  host: Host;
  isSelected: boolean;
  isMultiSelected: boolean;
  onSelect: (e: React.MouseEvent) => void;
  onEdit: () => void;
  group?: import("../types").Group;
  newSshTab: ConnectFn;
  newSftpTab: ConnectFn;
}

function SortableHostCard({ host, isSelected, isMultiSelected, onSelect, onEdit, group, newSshTab, newSftpTab }: SortableHostCardProps) {
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
      />
    </div>
  );
}

export function HomeDashboard({ newSshTab, newSftpTab }: { newSshTab: ConnectFn; newSftpTab: ConnectFn }) {
  const hosts = useHostsStore((s) => s.hosts);
  const groups = useHostsStore((s) => s.groups);
  const selectedHostId = useHostsStore((s) => s.selectedHostId);
  const selectedHostIds = useHostsStore((s) => s.selectedHostIds);
  const isLoading = useHostsStore((s) => s.isLoading);
  const hasFetched = useHostsStore((s) => s.hasFetched);
  const fetchData = useHostsStore((s) => s.fetchData);
  const createGroup = useHostsStore((s) => s.createGroup);
  const setSelectedHost = useHostsStore((s) => s.setSelectedHost);
  const selectHost = useHostsStore((s) => s.selectHost);
  const reorderHosts = useHostsStore((s) => s.reorderHosts);

  const [search, setSearch] = useState("");
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);

  const [addingGroup, setAddingGroup] = useState(false);
  const [groupName, setGroupName] = useState("");
  const groupInputRef = useRef<HTMLInputElement>(null);

  // Local ordered list for dnd (mirrors store but allows optimistic reorder)
  const [localHosts, setLocalHosts] = useState<Host[]>([]);
  useEffect(() => { setLocalHosts(hosts); }, [hosts]);

  useEffect(() => { void fetchData(); }, [fetchData]);

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
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
              width="13" height="13" viewBox="0 0 13 13" fill="none"
            >
              <circle cx="5.5" cy="5.5" r="4.5" stroke="currentColor" strokeWidth="1.2" />
              <path d="M9 9l2.5 2.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
            <Input
              className="h-7 pl-8 text-sm bg-muted border-0 focus-visible:ring-1"
              placeholder="Search hosts…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button
            size="sm"
            className="h-7 px-3 text-xs shrink-0"
            onClick={() => setSelectedHost("__new__")}
          >
            + New Host
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-3 text-xs shrink-0"
            onClick={() => setAddingGroup(true)}
          >
            + Group
          </Button>
        </div>

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
          {!hasFetched || isLoading ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {[...Array(3)].map((_, i) => <SkeletonCard key={i} />)}
            </div>
          ) : filteredHosts.length === 0 && !search && !activeGroupId ? (
            <EmptyState onNew={() => setSelectedHost("__new__")} />
          ) : filteredHosts.length === 0 ? (
            <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
              No hosts match your search
            </div>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={filteredHosts.map((h) => h.id)} strategy={rectSortingStrategy}>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
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
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
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
