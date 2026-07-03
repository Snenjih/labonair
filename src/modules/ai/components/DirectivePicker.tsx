import { PopoverContent } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { HugeiconsIcon } from "@hugeicons/react";
import type { SlashCommandMeta } from "../lib/slashCommands";
import type { Directive } from "../lib/directives";

export type PickerItem =
  | { kind: "directive"; directive: Directive }
  | { kind: "command"; command: SlashCommandMeta };

type Props = {
  items: readonly PickerItem[];
  activeIndex: number;
  onPick: (item: PickerItem) => void;
  onHover: (index: number) => void;
};

export function DirectivePickerContent({ items, activeIndex, onPick, onHover }: Props) {
  const commands = items.filter((it) => it.kind === "command");
  const directives = items.filter((it) => it.kind === "directive");
  let cursor = -1;

  return (
    <PopoverContent
      side="top"
      align="start"
      sideOffset={6}
      onOpenAutoFocus={(e) => e.preventDefault()}
      onCloseAutoFocus={(e) => e.preventDefault()}
      onMouseDown={(e) => e.preventDefault()}
      className="w-72 overflow-hidden rounded-lg border border-border/60 bg-popover p-0 shadow-xl"
    >
      {items.length === 0 ? (
        <div className="px-3 py-2.5 text-[11px] text-muted-foreground">
          No matches. Add directives in Settings → Agents.
        </div>
      ) : (
        <div className="max-h-64 overflow-y-auto py-1">
          {commands.length > 0 && (
            <>
              <SectionHeader label="Pre-built commands" />
              <ul>
                {commands.map((it) => {
                  cursor += 1;
                  const i = cursor;
                  if (it.kind !== "command") return null;
                  const c = it.command;
                  return (
                    <li key={`cmd-${c.name}`}>
                      <button
                        type="button"
                        onMouseEnter={() => onHover(i)}
                        onClick={() => onPick(it)}
                        className={cn(
                          "flex w-full items-center gap-2 px-2 py-1.5 text-left text-[12px]",
                          i === activeIndex ? "bg-accent" : "hover:bg-accent/60",
                        )}
                      >
                        <HugeiconsIcon
                          icon={c.icon}
                          size={13}
                          strokeWidth={1.75}
                          className="text-muted-foreground"
                        />
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="flex items-center gap-1.5">
                            <span className="font-mono text-muted-foreground">#{c.name}</span>
                            <span className="font-medium">{c.label}</span>
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
          {directives.length > 0 && (
            <>
              <SectionHeader label="Directives" />
              <ul>
                {directives.map((it) => {
                  cursor += 1;
                  const i = cursor;
                  if (it.kind !== "directive") return null;
                  const d = it.directive;
                  return (
                    <li key={`dir-${d.id}`}>
                      <button
                        type="button"
                        onMouseEnter={() => onHover(i)}
                        onClick={() => onPick(it)}
                        className={cn(
                          "flex w-full flex-col items-start gap-0.5 px-2 py-1.5 text-left text-[12px]",
                          i === activeIndex ? "bg-accent" : "hover:bg-accent/60",
                        )}
                      >
                        <span className="flex w-full items-center gap-1.5">
                          <span className="font-mono text-muted-foreground">#{d.handle}</span>
                          <span className="font-medium">{d.name}</span>
                        </span>
                        {d.description ? (
                          <span className="line-clamp-1 text-[10.5px] text-muted-foreground">
                            {d.description}
                          </span>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      )}
    </PopoverContent>
  );
}

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="px-2 pt-1.5 pb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">
      {label}
    </div>
  );
}
