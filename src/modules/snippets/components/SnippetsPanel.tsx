import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  Add01Icon,
  ArrowDown01Icon,
  ArrowRight01Icon,
  Cancel01Icon,
  Search01Icon,
  Add02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { motion, AnimatePresence } from "motion/react";
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
      items: filtered.filter((s) => s.groupId === g.id).sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
    }))
    .filter((g) => g.items.length > 0 || !query.trim());

  const ungrouped = filtered
    .filter((s) => !s.groupId)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));

  const showFormPanel = editingId !== null;

  return (
    <div className={cn("flex h-full", showFormPanel && "divide-x divide-border/60")}>
      {/* Panel list */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <div className="flex h-9 shrink-0 items-center gap-1 px-2">
          <span className="flex-1 pl-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Snippets
          </span>
          <Button
            variant="ghost"
            size="icon"
            className={cn("h-6 w-6", searchOpen && "bg-accent")}
            onClick={toggleSearch}
            title="Search snippets"
          >
            <HugeiconsIcon icon={Search01Icon} size={12} strokeWidth={2} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => setEditingId("new")}
            title="New snippet"
          >
            <HugeiconsIcon icon={Add01Icon} size={13} strokeWidth={2} />
          </Button>
        </div>

        {/* Search input */}
        <AnimatePresence>
          {searchOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="overflow-hidden px-2 pb-1.5"
            >
              <div className="relative">
                <HugeiconsIcon
                  icon={Search01Icon}
                  size={11}
                  strokeWidth={2}
                  className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  ref={searchRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search snippets…"
                  className="h-7 pl-6 text-xs"
                  onKeyDown={(e) => e.key === "Escape" && toggleSearch()}
                />
                {query && (
                  <button
                    type="button"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
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
          <div className="px-1 py-0.5">
            {filtered.length === 0 && (
              <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
                <p className="text-xs text-muted-foreground">
                  {query ? "No snippets match your search" : "No snippets yet"}
                </p>
                {!query && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setEditingId("new")}
                  >
                    <HugeiconsIcon icon={Add01Icon} size={12} strokeWidth={2} className="mr-1" />
                    Create snippet
                  </Button>
                )}
              </div>
            )}

            {/* Grouped sections */}
            {grouped.map(({ group, items }) => (
              <div key={group.id} className="mb-1">
                <button
                  type="button"
                  onClick={() => toggleGroup(group.id)}
                  className="flex w-full items-center gap-1 px-2 py-1 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
                >
                  <HugeiconsIcon
                    icon={collapsedGroups.has(group.id) ? ArrowRight01Icon : ArrowDown01Icon}
                    size={10}
                    strokeWidth={2}
                    className="shrink-0"
                  />
                  <span className="flex-1 truncate">{group.name}</span>
                  <span className="text-[9px] opacity-60">{items.length}</span>
                </button>
                {!collapsedGroups.has(group.id) && (
                  <div className="ml-2">
                    {items.map((s) => (
                      <SnippetItem
                        key={s.id}
                        snippet={s}
                        hostName={getHostName(s.hostId)}
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
                  <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">
                    Other
                  </div>
                )}
                {ungrouped.map((s) => (
                  <SnippetItem
                    key={s.id}
                    snippet={s}
                    hostName={getHostName(s.hostId)}
                    onRun={onRun}
                    onEdit={(snip) => setEditingId(snip.id)}
                    onDuplicate={handleDuplicate}
                    onDelete={(snip) => useCommandSnippetsStore.getState().deleteSnippet(snip.id)}
                  />
                ))}
              </div>
            )}

            {/* Add group button */}
            {filtered.length > 0 && !query && (
              <button
                type="button"
                className="mt-2 flex w-full items-center gap-1 px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground"
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
      </div>

      {/* Form panel (slide-in) */}
      {showFormPanel && (
        <div className="w-64 shrink-0">
          <SnippetFormPanel
            snippetId={editingId === "new" ? null : editingId!}
            onClose={() => setEditingId(null)}
          />
        </div>
      )}
    </div>
  );
}
