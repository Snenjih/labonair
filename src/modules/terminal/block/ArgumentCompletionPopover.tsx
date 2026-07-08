import { TerminalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useRef } from "react";
import { PopoverContent } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type Props = {
  candidates: string[];
  selectedIndex: number;
  onHover: (index: number) => void;
  onSelect: (value: string) => void;
};

/** Per-argument completion menu — shown only while there's real ambiguity at
 *  the current token (see shellComposerEditor's argState/computeArgumentCandidates);
 *  the plain whole-line ghost text handles the unambiguous case on its own.
 *  Keyboard navigation (Tab to cycle+apply, ↑/↓ to jump) is driven entirely
 *  by shellComposerEditor — this component is purely presentational plus
 *  mouse interaction, same split as HistoryPopover. */
export function ArgumentCompletionPopover({ candidates, selectedIndex, onHover, onSelect }: Props) {
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-arg-index="${selectedIndex}"]`);
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
      className="w-72 max-w-[90vw] overflow-hidden rounded-lg border border-border/60 bg-popover p-0 shadow-xl"
    >
      <ul ref={listRef} className="max-h-64 overflow-y-auto py-1">
        {candidates.map((value, i) => (
          // Candidates are already deduped by commandHistory.suggestArguments
          // — `value` alone is a safe key.
          <li key={value}>
            <button
              type="button"
              data-arg-index={i}
              onMouseEnter={() => onHover(i)}
              onClick={() => onSelect(value)}
              className={cn(
                "flex w-full items-center gap-2 px-2.5 py-1.5 text-left font-mono text-[12px]",
                i === selectedIndex ? "bg-accent" : "hover:bg-accent/60",
              )}
            >
              <HugeiconsIcon
                icon={TerminalIcon}
                size={12}
                strokeWidth={1.75}
                className="shrink-0 text-muted-foreground"
              />
              <span className="truncate">{value}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="border-t border-border/60 px-2.5 py-1.5 text-center text-[10px] text-muted-foreground">
        ⇥ complete · ↑↓ scroll · esc
      </div>
    </PopoverContent>
  );
}
