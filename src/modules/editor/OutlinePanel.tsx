import { cn } from "@/lib/utils";
import {
  FunctionCircleIcon,
  PackageIcon,
  Layers01Icon,
  ListViewIcon,
  CommandIcon,
  CircleIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { OutlineItem } from "./lib/outline";

type Props = {
  items: OutlineItem[];
  onJump: (pos: number) => void;
};

const LEVEL_INDENT: Record<number, string> = {
  1: "pl-2",
  2: "pl-4",
  3: "pl-6",
  4: "pl-8",
  5: "pl-10",
  6: "pl-12",
};

function OutlineItemIcon({ item }: { item: OutlineItem }) {
  switch (item.kind) {
    case "function":
      return (
        <HugeiconsIcon
          icon={FunctionCircleIcon}
          size={11}
          strokeWidth={1.5}
          className="shrink-0 text-blue-400/70"
        />
      );
    case "method":
      return (
        <HugeiconsIcon
          icon={CommandIcon}
          size={11}
          strokeWidth={1.5}
          className="shrink-0 text-purple-400/70"
        />
      );
    case "class":
      return (
        <HugeiconsIcon
          icon={PackageIcon}
          size={11}
          strokeWidth={1.5}
          className="shrink-0 text-yellow-400/70"
        />
      );
    case "struct":
      return (
        <HugeiconsIcon
          icon={Layers01Icon}
          size={11}
          strokeWidth={1.5}
          className="shrink-0 text-green-400/70"
        />
      );
    case "enum":
      return (
        <HugeiconsIcon
          icon={ListViewIcon}
          size={11}
          strokeWidth={1.5}
          className="shrink-0 text-orange-400/70"
        />
      );
    case "heading":
      return (
        <span className="text-[9px] font-bold text-muted-foreground/50 shrink-0 w-4 text-center">
          H{item.level}
        </span>
      );
    case "other":
    default:
      return (
        <HugeiconsIcon
          icon={CircleIcon}
          size={11}
          strokeWidth={1.5}
          className="shrink-0 text-muted-foreground/30"
        />
      );
  }
}

export function OutlinePanel({ items, onJump }: Props) {
  return (
    <div className="flex h-full flex-col border-l border-border/60 bg-card/40">
      <div className="flex h-8 shrink-0 items-center border-b border-border/60 px-3">
        <span className="text-[10px] font-semibold tracking-widest text-muted-foreground/70 uppercase">
          Outline
        </span>
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {items.length === 0 ? (
          <div className="flex h-full items-center justify-center px-3 text-center">
            <span className="text-[11px] text-muted-foreground/50">No symbols found</span>
          </div>
        ) : (
          items.map((item, i) => (
            <button
              key={i}
              type="button"
              aria-label={`${item.label}, line ${item.line}`}
              onClick={() => onJump(item.pos)}
              className={cn(
                "group flex w-full items-center gap-1.5 py-[3px] pr-2 text-left text-[11px] transition-colors hover:bg-accent/60",
                LEVEL_INDENT[item.level] ?? "pl-2",
              )}
            >
              <OutlineItemIcon item={item} />
              <span className="min-w-0 flex-1 truncate text-foreground/80 leading-tight">{item.label}</span>
              <span className="ml-auto shrink-0 text-[10px] tabular-nums text-muted-foreground/40 opacity-0 group-hover:opacity-100">
                {item.line}
              </span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
