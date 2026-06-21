import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Bookmark02Icon, Cancel01Icon, EyeIcon, ArrowUp01Icon, Refresh01Icon, TerminalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useState } from "react";
import { useBookmarksStore } from "../store/bookmarksStore";
import { parentPath } from "../utils";

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
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={() => onNavigate(parentPath(path))}
        title="Go up"
        tabIndex={-1}
        className="shrink-0 text-muted-foreground hover:text-foreground"
      >
        <HugeiconsIcon icon={ArrowUp01Icon} size={13} />
      </Button>

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
          "focus:outline-none focus:bg-background focus:border-border focus:ring-1 focus:ring-ring/30",
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
            "focus:outline-none focus:bg-background focus:border-primary focus:ring-1 focus:ring-ring/30",
            "transition-colors duration-100",
          )}
        />
      )}

      {/* Search toggle (remote pane only) */}
      {onDeepSearch && (
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => {
            if (searchVisible) {
              setSearchValue("");
              setSearchVisible(false);
              onDeepSearch("");
            } else {
              setSearchVisible(true);
            }
          }}
          title="Search files"
          tabIndex={-1}
          aria-pressed={searchVisible}
          className={cn(
            "shrink-0 transition-colors duration-75",
            searchVisible
              ? "text-foreground dark:text-primary bg-primary/10 hover:bg-primary/20"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <circle cx="5.5" cy="5.5" r="4.5" stroke="currentColor" strokeWidth="1.3" />
            <path d="M9 9l2.5 2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
        </Button>
      )}

      {/* Bookmarks dropdown */}
      {bookmarkKey && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              title="Bookmarks"
              tabIndex={-1}
              className={cn(
                "shrink-0 transition-colors duration-75",
                bookmarks.length > 0
                  ? "text-foreground dark:text-primary hover:bg-primary/10"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <HugeiconsIcon icon={Bookmark02Icon} size={13} />
            </Button>
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
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        void removeBookmark(bookmarkKey, bm);
                      }}
                      className="shrink-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive"
                      title="Remove bookmark"
                    >
                      <HugeiconsIcon icon={Cancel01Icon} size={12} />
                    </Button>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <div className="px-3 py-1 text-[10px] text-muted-foreground">
                  Right-click a folder to add bookmarks
                </div>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {/* Refresh */}
      <Button
        variant="ghost"
        size="icon-xs"
        onClick={() => onNavigate(path)}
        title="Refresh"
        tabIndex={-1}
        className="shrink-0 text-muted-foreground hover:text-foreground"
      >
        <HugeiconsIcon icon={Refresh01Icon} size={13} />
      </Button>

      {/* Toggle hidden files */}
      {onToggleHidden && (
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={onToggleHidden}
          title={showHidden ? "Hide hidden files" : "Show hidden files"}
          tabIndex={-1}
          aria-pressed={showHidden}
          className={cn(
            "shrink-0 transition-colors duration-75",
            showHidden
              ? "text-foreground dark:text-primary bg-primary/10 hover:bg-primary/20"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <HugeiconsIcon icon={EyeIcon} size={13} />
        </Button>
      )}

      {/* Open Terminal (remote pane only) */}
      {showOpenTerminal && (
        <Button
          variant="ghost"
          size="xs"
          onClick={onOpenTerminal}
          title="Open terminal here"
          tabIndex={-1}
          className="shrink-0 text-muted-foreground hover:text-foreground"
        >
          <HugeiconsIcon icon={TerminalIcon} size={13} />
          <span>Term</span>
        </Button>
      )}
    </div>
  );
}
