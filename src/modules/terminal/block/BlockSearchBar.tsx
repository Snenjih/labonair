import { cn } from "@/lib/utils";
import {
  ArrowDown01Icon,
  ArrowUp01Icon,
  Cancel01Icon,
  Search01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { SearchAddon } from "@xterm/addon-search";
import { useEffect, useRef, useState } from "react";

interface BlockSearchBarProps {
  onClose: () => void;
  searchAddon: SearchAddon | null;
  startLine?: number;
  endLine?: number;
}

export function BlockSearchBar({
  onClose,
  searchAddon,
}: BlockSearchBarProps) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const runSearch = (q: string) => {
    if (!searchAddon || !q) return;
    searchAddon.findNext(q, { regex: false, caseSensitive: false });
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      runSearch(value);
    }, 200);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (e.shiftKey) {
        searchAddon?.findPrevious(query, { regex: false, caseSensitive: false });
      } else {
        searchAddon?.findNext(query, { regex: false, caseSensitive: false });
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return (
    <div
      className={cn(
        "pointer-events-auto absolute right-3 top-8 z-30",
        "flex items-center gap-1.5 rounded-md border border-border",
        "bg-background px-2 py-1 shadow-md",
      )}
    >
      <HugeiconsIcon
        icon={Search01Icon}
        size={12}
        strokeWidth={1.75}
        className="shrink-0 text-muted-foreground"
      />
      <input
        ref={inputRef}
        value={query}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder="Find in block…"
        className={cn(
          "w-40 bg-transparent font-mono text-xs text-foreground outline-none",
          "placeholder:text-muted-foreground/60",
        )}
      />
      <div className="flex items-center gap-0.5">
        <IconButton
          title="Previous match (Shift+Enter)"
          icon={ArrowUp01Icon}
          onClick={() =>
            searchAddon?.findPrevious(query, {
              regex: false,
              caseSensitive: false,
            })
          }
        />
        <IconButton
          title="Next match (Enter)"
          icon={ArrowDown01Icon}
          onClick={() =>
            searchAddon?.findNext(query, {
              regex: false,
              caseSensitive: false,
            })
          }
        />
        <IconButton title="Close (Escape)" icon={Cancel01Icon} onClick={onClose} />
      </div>
    </div>
  );
}

function IconButton({
  title,
  icon,
  onClick,
}: {
  title: string;
  icon: typeof Search01Icon;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        "flex h-5 w-5 items-center justify-center rounded",
        "text-muted-foreground hover:bg-accent hover:text-foreground",
        "transition-colors duration-100",
      )}
    >
      <HugeiconsIcon icon={icon} size={12} strokeWidth={1.75} />
    </button>
  );
}
