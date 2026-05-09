import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { GroupCard } from "./GroupCard";
import { HostCard } from "./HostCard";
import { HostInspector } from "./HostInspector";
import { useHostsStore } from "../store/hostsStore";
import type { CreateHostPayload } from "../types";

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
        <h3 className="text-base font-semibold text-foreground">No servers yet</h3>
        <p className="text-sm text-muted-foreground max-w-xs">
          Add your first SSH server to get started. Your hosts are stored locally and passwords in your Keychain.
        </p>
      </div>
      <Button size="sm" onClick={onNew} className="mt-2">
        Add your first server
      </Button>
    </motion.div>
  );
}

const DEFAULT_FORM: CreateHostPayload = {
  name: "",
  host_address: "",
  port: 22,
  username: "",
  auth_method: "password",
};

export function HomeDashboard() {
  const hosts = useHostsStore((s) => s.hosts);
  const groups = useHostsStore((s) => s.groups);
  const selectedHostId = useHostsStore((s) => s.selectedHostId);
  const isLoading = useHostsStore((s) => s.isLoading);
  const fetchData = useHostsStore((s) => s.fetchData);
  const createHost = useHostsStore((s) => s.createHost);
  const createGroup = useHostsStore((s) => s.createGroup);
  const setSelectedHost = useHostsStore((s) => s.setSelectedHost);

  const [search, setSearch] = useState("");
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [newHostOpen, setNewHostOpen] = useState(false);
  const [form, setForm] = useState<CreateHostPayload>(DEFAULT_FORM);
  const [submitting, setSubmitting] = useState(false);

  const [addingGroup, setAddingGroup] = useState(false);
  const [groupName, setGroupName] = useState("");
  const groupInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { void fetchData(); }, [fetchData]);

  useEffect(() => {
    if (addingGroup) setTimeout(() => groupInputRef.current?.focus(), 50);
  }, [addingGroup]);

  const filteredHosts = useMemo(() => {
    let list = hosts;
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
  }, [hosts, activeGroupId, search]);

  const handleCreateHost = async () => {
    if (!form.name || !form.host_address || !form.username) return;
    setSubmitting(true);
    try {
      const host = await createHost(form);
      setNewHostOpen(false);
      setForm(DEFAULT_FORM);
      setSelectedHost(host.id);
    } finally {
      setSubmitting(false);
    }
  };

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

  return (
    <div className="flex h-full w-full overflow-hidden">
      {/* LEFT MASTER PANE */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
          <div className="relative flex-1">
            <svg
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
              width="13"
              height="13"
              viewBox="0 0 13 13"
              fill="none"
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
          <Dialog open={newHostOpen} onOpenChange={setNewHostOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="h-7 px-3 text-xs shrink-0">
                + New Host
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-sm">
              <DialogHeader>
                <DialogTitle>Add Server</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 py-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Display Name</Label>
                  <Input
                    placeholder="My Server"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    className="h-8"
                  />
                </div>
                <div className="flex gap-2">
                  <div className="flex-1 space-y-1.5">
                    <Label className="text-xs">Host / IP</Label>
                    <Input
                      placeholder="192.168.1.1"
                      value={form.host_address}
                      onChange={(e) => setForm((f) => ({ ...f, host_address: e.target.value }))}
                      className="h-8"
                    />
                  </div>
                  <div className="w-20 space-y-1.5">
                    <Label className="text-xs">Port</Label>
                    <Input
                      type="number"
                      value={form.port}
                      onChange={(e) => setForm((f) => ({ ...f, port: parseInt(e.target.value, 10) || 22 }))}
                      className="h-8"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Username</Label>
                  <Input
                    placeholder="root"
                    value={form.username}
                    onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                    className="h-8"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  size="sm"
                  onClick={handleCreateHost}
                  disabled={submitting || !form.name || !form.host_address || !form.username}
                >
                  {submitting ? "Adding…" : "Add Server"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
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
          {isLoading ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              {[...Array(3)].map((_, i) => <SkeletonCard key={i} />)}
            </div>
          ) : filteredHosts.length === 0 && !search && !activeGroupId ? (
            <EmptyState onNew={() => setNewHostOpen(true)} />
          ) : filteredHosts.length === 0 ? (
            <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
              No hosts match your search
            </div>
          ) : (
            <motion.div
              className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3"
              initial="hidden"
              animate="visible"
              variants={{
                hidden: {},
                visible: { transition: { staggerChildren: 0.04 } },
              }}
            >
              {filteredHosts.map((host) => (
                <motion.div
                  key={host.id}
                  variants={{
                    hidden: { opacity: 0, y: 6 },
                    visible: { opacity: 1, y: 0 },
                  }}
                >
                  <HostCard
                    host={host}
                    isSelected={selectedHostId === host.id}
                    onClick={() =>
                      setSelectedHost(selectedHostId === host.id ? null : host.id)
                    }
                    group={groups.find((g) => g.id === host.group_id)}
                  />
                </motion.div>
              ))}
            </motion.div>
          )}
        </div>
      </div>

      {/* RIGHT INSPECTOR PANE */}
      <AnimatePresence>
        {selectedHostId && (
          <motion.div
            key={selectedHostId}
            initial={{ x: 340, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 340, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="w-[340px] shrink-0 border-l border-border overflow-y-auto bg-background"
          >
            <HostInspector
              hostId={selectedHostId}
              onClose={() => setSelectedHost(null)}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
