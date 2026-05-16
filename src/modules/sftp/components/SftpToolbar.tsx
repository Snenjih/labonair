import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { Bookmark02Icon, Cancel01Icon, EyeIcon, ArrowUp01Icon, Refresh01Icon, TerminalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useState } from "react";
import { useBookmarksStore } from "../store/bookmarksStore";

interface SftpToolbarProps {
  path: string;
  onNavigate: (path: string) => void;
  placeholder?: string;
  showOpenTerminal?: boolean;
  onOpenTerminal?: () => void;
  showHidden?: boolean;
  onToggleHidden?: () => void;
  // Bookmarks
  bookmarkKey?: string; // "local" or host_address
  // Deep search (remote only)
  onDeepSearch?: (query: string) => void;
  isSearching?: boolean;
}

function parentPath(p: string): string {
  if (p === "/" || p === "") return "/";
  const trimmed = p.endsWith("/") ? p.slice(0, -1) : p;
  const lastSlash = trimmed.lastIndexOf("/");
  if (lastSlash <= 0) return "/";
  return trimmed.slice(0, lastSlash);
}

export function SftpToolbar({
  path,
  onNavigate,
  placeholder,
  showOpenTerminal = false,
  onOpenTerminal,
  showHidden = false,
  onToggleHidden,
  bookmarkKey,
  onDeepSearch,
  isSearching = false,
}: SftpToolbarProps) {
  const [inputValue, setInputValue] = useState(path);
  const [focused, setFocused] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [searchVisible, setSearchVisible] = useState(false);

  const bookmarks = useBookmarksStore((s) => s.getBookmarks(bookmarkKey ?? "__none__"));
  const removeBookmark = useBookmarksStore((s) => s.removeBookmark);
  const hydrate = useBookmarksStore((s) => s.hydrate);
  const hydrated = useBookmarksStore((s) => s.hydrated);

  useEffect(() => {
    if (!hydrated) void hydrate();
  }, [hydrate, hydrated]);

  // Sync input when path changes externally (unless user is editing)
  if (!focused && inputValue !== path) {
    setInputValue(path);
  }

  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && searchValue.trim() && onDeepSearch) {
      onDeepSearch(searchValue.trim());
    }
    if (e.key === "Escape") {
      setSearchValue("");
      setSearchVisible(false);
      onDeepSearch?.("");
    }
  }

  return (
    <div className="h-9 bg-card border-b border-border px-1.5 flex items-center gap-1 shrink-0">
      {/* Up directory */}
      <button
        onClick={() => onNavigate(parentPath(path))}
        className={cn(
          "h-6 w-6 flex items-center justify-center rounded text-muted-foreground",
          "hover:bg-muted/40 hover:text-foreground transition-colors duration-75",
          "shrink-0",
        )}
        title="Go up"
        tabIndex={-1}
      >
        <HugeiconsIcon icon={ArrowUp01Icon} size={16} />
      </button>

      {/* Path input */}
      <input
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            onNavigate(inputValue);
            e.currentTarget.blur();
          }
          if (e.key === "Escape") {
            setInputValue(path);
            e.currentTarget.blur();
          }
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          setInputValue(path);
        }}
        placeholder={placeholder ?? "Path…"}
        spellCheck={false}
        className={cn(
          "flex-1 h-6 min-w-0 px-2 rounded text-xs font-mono",
          "bg-muted/20 border border-transparent text-foreground",
          "placeholder:text-muted-foreground/40",
          "focus:outline-none focus:bg-background focus:border-border",
          "transition-colors duration-100",
        )}
      />

      {/* Deep search input (shown when onDeepSearch available and toggle active) */}
      {onDeepSearch && searchVisible && (
        <input
          autoFocus
          value={searchValue}
          onChange={(e) => setSearchValue(e.target.value)}
          onKeyDown={handleSearchKeyDown}
          placeholder={isSearching ? "Searching…" : "Search… ↵"}
          className={cn(
            "w-36 h-6 px-2 rounded text-xs",
            "bg-muted/20 border border-border text-foreground",
            "placeholder:text-muted-foreground/40",
            "focus:outline-none focus:bg-background focus:border-primary",
            "transition-colors duration-100",
          )}
        />
      )}

      {/* Search toggle (remote pane only) */}
      {onDeepSearch && (
        <button
          onClick={() => {
            if (searchVisible) {
              setSearchValue("");
              setSearchVisible(false);
              onDeepSearch("");
            } else {
              setSearchVisible(true);
            }
          }}
          className={cn(
            "h-6 w-6 flex items-center justify-center rounded transition-colors duration-75 shrink-0",
            searchVisible
              ? "text-primary bg-primary/10 hover:bg-primary/20"
              : "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
          )}
          title="Search files"
          tabIndex={-1}
        >
          <svg width="14" height="14" viewBox="0 0 13 13" fill="none">
            <circle cx="5.5" cy="5.5" r="4.5" stroke="currentColor" strokeWidth="1.3" />
            <path d="M9 9l2.5 2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
        </button>
      )}

      {/* Bookmarks dropdown */}
      {bookmarkKey && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className={cn(
                "h-6 w-6 flex items-center justify-center rounded transition-colors duration-75 shrink-0",
                bookmarks.length > 0
                  ? "text-primary hover:bg-primary/10"
                  : "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
              )}
              title="Bookmarks"
              tabIndex={-1}
            >
              <HugeiconsIcon icon={Bookmark02Icon} size={15} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-72 max-h-64 overflow-y-auto">
            {bookmarks.length === 0 ? (
              <div className="px-3 py-2 text-xs text-muted-foreground">No bookmarks yet.</div>
            ) : (
              <>
                {bookmarks.map((bm) => (
                  <DropdownMenuItem
                    key={bm}
                    className="group flex items-center gap-1 pr-1"
                    onClick={() => onNavigate(bm)}
                  >
                    <span className="flex-1 truncate text-xs font-mono">{bm}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        void removeBookmark(bookmarkKey, bm);
                      }}
                      className="shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-opacity"
                      title="Remove bookmark"
                    >
                      <HugeiconsIcon icon={Cancel01Icon} size={13} />
                    </button>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <div className="px-3 py-1 text-[10px] text-muted-foreground/60">
                  Right-click a folder to add bookmarks
                </div>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {/* Refresh */}
      <button
        onClick={() => onNavigate(path)}
        className={cn(
          "h-6 w-6 flex items-center justify-center rounded text-muted-foreground",
          "hover:bg-muted/40 hover:text-foreground transition-colors duration-75",
          "shrink-0",
        )}
        title="Refresh"
        tabIndex={-1}
      >
        <HugeiconsIcon icon={Refresh01Icon} size={16} />
      </button>

      {/* Toggle hidden files */}
      {onToggleHidden && (
        <button
          onClick={onToggleHidden}
          className={cn(
            "h-6 w-6 flex items-center justify-center rounded transition-colors duration-75",
            "shrink-0",
            showHidden
              ? "text-primary bg-primary/10 hover:bg-primary/20"
              : "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
          )}
          title={showHidden ? "Hide hidden files" : "Show hidden files"}
          tabIndex={-1}
        >
          <HugeiconsIcon icon={EyeIcon} size={16} />
        </button>
      )}

      {/* Open Terminal (remote pane only) */}
      {showOpenTerminal && (
        <button
          onClick={onOpenTerminal}
          className={cn(
            "h-6 px-2 flex items-center gap-1 rounded text-muted-foreground",
            "hover:bg-muted/40 hover:text-foreground transition-colors duration-75",
            "text-[10px] font-medium shrink-0",
          )}
          title="Open terminal here"
          tabIndex={-1}
        >
          <HugeiconsIcon icon={TerminalIcon} size={14} />
          <span>Term</span>
        </button>
      )}
    </div>
  );
}
