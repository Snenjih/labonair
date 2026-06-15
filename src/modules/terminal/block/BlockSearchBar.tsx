import { cn } from "@/lib/utils";
import {
  ArrowDown01Icon,
  ArrowUp01Icon,
  Cancel01Icon,
  Search01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { SearchAddon } from "@xterm/addon-search";
import type { Terminal } from "@xterm/xterm";
import { useEffect, useMemo, useRef, useState } from "react";
import type { BlockDecorations } from "./lib/blockDecorations";
import type { BlockMeta } from "./lib/types";

interface Match {
  absoluteLine: number;
  start: number;
  end: number;
  preview: string;
}

function findMatches(text: string, query: string, startLine: number): Match[] {
  if (!query || !text) return [];
  const lower = text.toLowerCase();
  const lq = query.toLowerCase();
  const lines = text.split("\n");
  const matches: Match[] = [];

  let offset = 0;
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    const lineLower = line.toLowerCase();
    let col = 0;
    while (col < line.length) {
      const idx = lineLower.indexOf(lq, col);
      if (idx === -1) break;
      matches.push({
        absoluteLine: startLine + li,
        start: offset + idx,
        end: offset + idx + query.length,
        preview: line,
      });
      col = idx + 1;
    }
    offset += line.length + 1; // +1 for \n
  }
  // Suppress unused variable lint
  void lower;
  return matches;
}

interface BlockSearchBarProps {
  block: BlockMeta;
  decorations: BlockDecorations | null;
  term: Terminal | null;
  searchAddon: SearchAddon | null;
  onClose: () => void;
}

export function BlockSearchBar({
  block,
  decorations,
  term,
  searchAddon,
  onClose,
}: BlockSearchBarProps) {
  const [query, setQuery] = useState("");
  const [currentIdx, setCurrentIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const blockText = useMemo(() => {
    if (!decorations) return "";
    return decorations.readBlock(block);
  }, [decorations, block]);

  const matches = useMemo(
    () => findMatches(blockText, query, block.startLine),
    [blockText, query, block.startLine],
  );

  const hasMatches = matches.length > 0;
  const noMatch = query.length > 0 && !hasMatches;

  const scrollTo = (idx: number) => {
    const match = matches[idx];
    if (!match || !term) return;
    term.scrollToLine(match.absoluteLine);
    // Use SearchAddon for visual highlighting if available
    if (searchAddon && query) {
      searchAddon.findNext(query, { regex: false, caseSensitive: false });
    }
  };

  const navigate = (delta: 1 | -1) => {
    if (!hasMatches) return;
    const next = (currentIdx + delta + matches.length) % matches.length;
    setCurrentIdx(next);
    scrollTo(next);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);
    setCurrentIdx(0);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (value && term && matches.length > 0) {
        term.scrollToLine(matches[0].absoluteLine);
        if (searchAddon) searchAddon.findNext(value, { regex: false, caseSensitive: false });
      }
    }, 150);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      navigate(e.shiftKey ? -1 : 1);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

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
        noMatch && "border-destructive/50",
      )}
    >
      <HugeiconsIcon
        icon={Search01Icon}
        size={12}
        strokeWidth={1.75}
        className={cn("shrink-0", noMatch ? "text-destructive" : "text-muted-foreground")}
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
          noMatch && "text-destructive",
        )}
      />
      {query && (
        <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
          {hasMatches ? `${currentIdx + 1}/${matches.length}` : "No results"}
        </span>
      )}
      <div className="flex items-center gap-0.5">
        <IconButton
          title="Previous match (Shift+Enter)"
          icon={ArrowUp01Icon}
          onClick={() => navigate(-1)}
          disabled={!hasMatches}
        />
        <IconButton
          title="Next match (Enter)"
          icon={ArrowDown01Icon}
          onClick={() => navigate(1)}
          disabled={!hasMatches}
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
  disabled,
}: {
  title: string;
  icon: typeof Search01Icon;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex h-5 w-5 items-center justify-center rounded",
        "text-muted-foreground hover:bg-accent hover:text-foreground",
        "transition-colors duration-100",
        disabled && "opacity-30 cursor-default pointer-events-none",
      )}
    >
      <HugeiconsIcon icon={icon} size={12} strokeWidth={1.75} />
    </button>
  );
}
