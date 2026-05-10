import { cn } from "@/lib/utils";
import { useState } from "react";

interface SftpToolbarProps {
  path: string;
  onNavigate: (path: string) => void;
  placeholder?: string;
  showOpenTerminal?: boolean;
  onOpenTerminal?: () => void;
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
}: SftpToolbarProps) {
  const [inputValue, setInputValue] = useState(path);
  const [focused, setFocused] = useState(false);

  // Sync input when path changes externally (unless user is editing)
  if (!focused && inputValue !== path) {
    setInputValue(path);
  }

  return (
    <div className="h-9 bg-card border-b border-border px-1.5 flex items-center gap-1 shrink-0">
      {/* Up directory */}
      <button
        onClick={() => onNavigate(parentPath(path))}
        className={cn(
          "h-6 w-6 flex items-center justify-center rounded text-muted-foreground",
          "hover:bg-muted/40 hover:text-foreground transition-colors duration-75",
          "text-xs font-bold shrink-0",
        )}
        title="Go up"
        tabIndex={-1}
      >
        ↑
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

      {/* Refresh */}
      <button
        onClick={() => onNavigate(path)}
        className={cn(
          "h-6 w-6 flex items-center justify-center rounded text-muted-foreground",
          "hover:bg-muted/40 hover:text-foreground transition-colors duration-75",
          "text-xs shrink-0",
        )}
        title="Refresh"
        tabIndex={-1}
      >
        ↺
      </button>

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
          <span className="text-[11px]">⌘</span>
          <span>Term</span>
        </button>
      )}
    </div>
  );
}
