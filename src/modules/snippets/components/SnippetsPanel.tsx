import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  Add01Icon,
  Add02Icon,
  ArrowDown01Icon,
  ArrowRight01Icon,
  Cancel01Icon,
  Search01Icon,
  CommandIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { AnimatePresence, motion } from "motion/react";
import { useRef, useState } from "react";
import { useHostsStore } from "@/modules/hosts/store/hostsStore";
import { useCommandSnippetsStore } from "../store/commandSnippetsStore";
import { SnippetFormPanel } from "./SnippetFormPanel";
import { SnippetItem } from "./SnippetItem";
import type { CommandSnippet, SnippetExecMode } from "../types";

interface Props {
  onRun: (snippet: CommandSnippet, mode?: SnippetExecMode) => void;
}

export function SnippetsPanel({ onRun }: Props) {
  const snippets = useCommandSnippetsStore((s) => s.snippets);
  const groups = useCommandSnippetsStore((s) => s.groups);
  const createGroup = useCommandSnippetsStore((s) => s.createGroup);
  const createSnippet = useCommandSnippetsStore((s) => s.createSnippet);
  const hosts = useHostsStore((s) => s.hosts);

  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null | "new">(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  const searchRef = useRef<HTMLInputElement>(null);

  const showForm = editingId !== null;

  function toggleSearch() {
    if (searchOpen) {
      setQuery("");
      setSearchOpen(false);
    } else {
      setSearchOpen(true);
      setTimeout(() => searchRef.current?.focus(), 50);
    }
  }

  function toggleGroup(id: string) {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function getHostName(hostId: string | null | undefined): string | undefined {
    if (!hostId) return undefined;
    return hosts.find((h) => h.id === hostId)?.name;
  }

  function getGroupColor(groupId: string | null | undefined): string | null | undefined {
    if (!groupId) return undefined;
    return groups.find((g) => g.id === groupId)?.color;
  }

  function handleDuplicate(snippet: CommandSnippet) {
    void createSnippet({
      ...snippet,
      name: `${snippet.name} (copy)`,
      sortOrder: snippet.sortOrder + 1,
    });
  }

  const filtered = query.trim()
    ? snippets.filter(
        (s) =>
          s.name.toLowerCase().includes(query.toLowerCase()) ||
          s.command.toLowerCase().includes(query.toLowerCase()) ||
          s.description?.toLowerCase().includes(query.toLowerCase())
      )
    : snippets;

  const grouped = groups
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
    .map((g) => ({
      group: g,
      items: filtered
        .filter((s) => s.groupId === g.id)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
    }))
    .filter((g) => g.items.length > 0 || !query.trim());

  const ungrouped = filtered
    .filter((s) => !s.groupId)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <AnimatePresence mode="wait" initial={false}>
        {showForm ? (
          <motion.div
            key="form"
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
            transition={{ duration: 0.13, ease: "easeOut" }}
            className="flex h-full flex-col"
          >
            <SnippetFormPanel
              snippetId={editingId === "new" ? null : editingId!}
              onClose={() => setEditingId(null)}
            />
          </motion.div>
        ) : (
          <motion.div
            key="list"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.13, ease: "easeOut" }}
            className="flex h-full flex-col"
          >
            {/* Toolbar header */}
            <div className="flex h-8 shrink-0 items-center gap-1 border-b border-border/60 px-2">
              <span className="flex-1 pl-1 text-xs font-medium text-foreground/80">
                Snippets
              </span>
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  "size-6 text-muted-foreground hover:text-foreground",
                  searchOpen && "bg-muted text-foreground"
                )}
                onClick={toggleSearch}
                title="Search snippets"
              >
                <HugeiconsIcon icon={Search01Icon} size={13} strokeWidth={2} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-6 text-muted-foreground hover:text-foreground"
                onClick={() => setEditingId("new")}
                title="New snippet"
              >
                <HugeiconsIcon icon={Add01Icon} size={13} strokeWidth={2} />
              </Button>
            </div>

            {/* Search bar */}
            <AnimatePresence>
              {searchOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.08 }}
                  className="overflow-hidden border-b border-border/30"
                >
                  <div className="relative px-2 py-1.5">
                    <HugeiconsIcon
                      icon={Search01Icon}
                      size={11}
                      strokeWidth={2}
                      className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground/50"
                    />
                    <Input
                      ref={searchRef}
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search snippets…"
                      className="h-7 border-border/40 bg-background/60 pl-6 font-mono text-[11px] placeholder:text-muted-foreground/40 focus-visible:ring-1"
                      onKeyDown={(e) => e.key === "Escape" && toggleSearch()}
                    />
                    {query && (
                      <button
                        type="button"
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground/40 hover:text-muted-foreground"
                        onClick={() => setQuery("")}
                      >
                        <HugeiconsIcon icon={Cancel01Icon} size={10} strokeWidth={2} />
                      </button>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Snippet list */}
            <ScrollArea className="flex-1">
              <div className="px-2 py-2">

                {/* Empty state */}
                {filtered.length === 0 && (
                  <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-border/40 bg-muted/30">
                      <HugeiconsIcon icon={CommandIcon} size={22} strokeWidth={1.5} className="text-muted-foreground/40" />
                    </div>
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium text-muted-foreground">
                        {query ? "No results" : "No snippets yet"}
                      </p>
                      <p className="text-[11px] text-muted-foreground/50">
                        {query ? "Try a different search term" : "Create reusable commands"}
                      </p>
                    </div>
                    {!query && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 border-border/50 text-xs"
                        onClick={() => setEditingId("new")}
                      >
                        <HugeiconsIcon icon={Add01Icon} size={12} strokeWidth={2} className="mr-1.5" />
                        New snippet
                      </Button>
                    )}
                  </div>
                )}

                {/* Grouped sections */}
                {grouped.map(({ group, items }) => (
                  <div key={group.id} className="mb-3">
                    <button
                      type="button"
                      onClick={() => toggleGroup(group.id)}
                      className="group/hdr mb-1.5 flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left transition-colors hover:bg-muted/30"
                    >
                      <HugeiconsIcon
                        icon={collapsedGroups.has(group.id) ? ArrowRight01Icon : ArrowDown01Icon}
                        size={9}
                        strokeWidth={2.5}
                        className="shrink-0 text-muted-foreground/40 transition-transform"
                      />
                      {group.color && (
                        <span
                          className="h-1.5 w-1.5 shrink-0 rounded-full"
                          style={{ background: group.color }}
                        />
                      )}
                      <span className="flex-1 truncate font-mono text-[9px] font-semibold uppercase tracking-widest text-muted-foreground/60 group-hover/hdr:text-muted-foreground">
                        {group.name}
                      </span>
                      <span className="font-mono text-[9px] tabular-nums text-muted-foreground/30">
                        {items.length}
                      </span>
                    </button>
                    {!collapsedGroups.has(group.id) && (
                      <div className="space-y-1.5">
                        {items.map((s) => (
                          <SnippetItem
                            key={s.id}
                            snippet={s}
                            hostName={getHostName(s.hostId)}
                            groupColor={getGroupColor(s.groupId)}
                            onRun={onRun}
                            onEdit={(snip) => setEditingId(snip.id)}
                            onDuplicate={handleDuplicate}
                            onDelete={(snip) => useCommandSnippetsStore.getState().deleteSnippet(snip.id)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                ))}

                {/* Ungrouped */}
                {ungrouped.length > 0 && (
                  <div>
                    {grouped.length > 0 && (
                      <div className="mb-1.5 flex items-center gap-1.5 px-1 py-0.5">
                        <span className="font-mono text-[9px] font-semibold uppercase tracking-widest text-muted-foreground/40">
                          Other
                        </span>
                      </div>
                    )}
                    <div className="space-y-1.5">
                      {ungrouped.map((s) => (
                        <SnippetItem
                          key={s.id}
                          snippet={s}
                          hostName={getHostName(s.hostId)}
                          groupColor={getGroupColor(s.groupId)}
                          onRun={onRun}
                          onEdit={(snip) => setEditingId(snip.id)}
                          onDuplicate={handleDuplicate}
                          onDelete={(snip) => useCommandSnippetsStore.getState().deleteSnippet(snip.id)}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Add group footer */}
                {filtered.length > 0 && !query && (
                  <button
                    type="button"
                    className="mt-3 flex w-full items-center gap-1.5 rounded px-1 py-1 font-mono text-[10px] text-muted-foreground/40 transition-colors hover:text-muted-foreground"
                    onClick={() => {
                      const name = prompt("Group name:");
                      if (name?.trim()) void createGroup(name.trim());
                    }}
                  >
                    <HugeiconsIcon icon={Add02Icon} size={10} strokeWidth={2} />
                    Add group
                  </button>
                )}
              </div>
            </ScrollArea>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
