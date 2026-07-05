import { useEffect, useRef } from "react";
import { PopoverContent } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Clock01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

type Props = {
  /** Oldest-first, matching commandHistory.historyListFor(). This is the
   *  shell's own real history (read from ~/.zsh_history etc.), not a
   *  separate Nexum-managed list — there is nothing here to "clear" without
   *  touching the user's actual shell history file, so no clear action. */
  items: string[];
  selectedIndex: number;
  onHover: (index: number) => void;
  onSelect: (command: string) => void;
};

/** Alternative to inline Up/Down history cycling — see
 *  terminalComposerHistoryPopup. Keyboard navigation is driven entirely by
 *  ShellComposerInput/shellComposerEditor (the editor keeps DOM focus the
 *  whole time); this component is purely presentational plus mouse
 *  interaction. */
export function HistoryPopover({ items, selectedIndex, onHover, onSelect }: Props) {
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-history-index="${selectedIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  return (
    <PopoverContent
      side="top"
      align="start"
      sideOffset={6}
      onOpenAutoFocus={(e) => e.preventDefault()}
      onCloseAutoFocus={(e) => e.preventDefault()}
      onMouseDown={(e) => e.preventDefault()}
      className="w-96 max-w-[90vw] overflow-hidden rounded-lg border border-border/60 bg-popover p-0 shadow-xl"
    >
      {items.length === 0 ? (
        <div className="px-3 py-2.5 text-[11px] text-muted-foreground">No command history yet.</div>
      ) : (
        <ul ref={listRef} className="max-h-64 overflow-y-auto py-1">
          {items.map((cmd, i) => (
            // `cmd` alone is a safe key — commandHistory de-duplicates
            // before caching, so each string appears once.
            <li key={cmd}>
              <button
                type="button"
                data-history-index={i}
                onMouseEnter={() => onHover(i)}
                onClick={() => onSelect(cmd)}
                className={cn(
                  "flex w-full items-center gap-2 px-2.5 py-1.5 text-left font-mono text-[12px]",
                  i === selectedIndex ? "bg-accent" : "hover:bg-accent/60",
                )}
              >
                <HugeiconsIcon
                  icon={Clock01Icon}
                  size={12}
                  strokeWidth={1.75}
                  className="shrink-0 text-muted-foreground"
                />
                <span className="truncate">{cmd}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="border-t border-border/60 px-2.5 py-1.5 text-center text-[10px] text-muted-foreground">
        ↑↓ navigate · ↵ run · esc
      </div>
    </PopoverContent>
  );
}
