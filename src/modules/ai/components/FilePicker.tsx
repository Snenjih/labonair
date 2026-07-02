import { PopoverContent } from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { ArrowRight01Icon, Folder01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

export type FileSearchHit = {
  path: string;
  rel: string;
  name: string;
  is_dir: boolean;
};

type Props = {
  hits: FileSearchHit[];
  loading: boolean;
  query: string;
  activeIndex: number;
  onPick: (hit: FileSearchHit) => void;
  onHover: (index: number) => void;
};

export function FilePickerContent({ hits, loading, query, activeIndex, onPick, onHover }: Props) {
  return (
    <PopoverContent
      side="top"
      align="start"
      sideOffset={6}
      onOpenAutoFocus={(e) => e.preventDefault()}
      onCloseAutoFocus={(e) => e.preventDefault()}
      onMouseDown={(e) => e.preventDefault()}
      className="w-80 overflow-hidden rounded-lg border border-border/60 bg-popover p-0 shadow-xl"
    >
      {loading ? (
        <div className="flex items-center gap-2 px-3 py-2.5 text-[11px] text-muted-foreground">
          <Spinner className="size-3" />
          Searching…
        </div>
      ) : hits.length === 0 ? (
        <div className="px-3 py-2.5 text-[11px] text-muted-foreground">
          {query ? `No files matching "@${query}"` : "Type a filename to search"}
        </div>
      ) : (
        <ul className="max-h-64 overflow-y-auto py-1">
          {hits.map((hit, i) => (
            <li key={hit.path}>
              <button
                type="button"
                onMouseEnter={() => onHover(i)}
                onClick={() => onPick(hit)}
                title={hit.path}
                className={cn(
                  "flex w-full items-center gap-2 px-2 py-1.5 text-left text-[12px]",
                  i === activeIndex ? "bg-accent" : "hover:bg-accent/60",
                )}
              >
                {hit.is_dir ? (
                  <HugeiconsIcon
                    icon={Folder01Icon}
                    size={13}
                    strokeWidth={1.75}
                    className="shrink-0 text-muted-foreground"
                  />
                ) : (
                  <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                    {extOf(hit.name)}
                  </span>
                )}
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-medium">{hit.name}</span>
                  {hit.rel !== hit.name && (
                    <span className="truncate text-[10px] text-muted-foreground">{hit.rel}</span>
                  )}
                </span>
                {hit.is_dir && (
                  <HugeiconsIcon
                    icon={ArrowRight01Icon}
                    size={11}
                    strokeWidth={1.75}
                    className="shrink-0 text-muted-foreground"
                  />
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </PopoverContent>
  );
}

function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i === -1 ? "FILE" : name.slice(i + 1).toUpperCase();
}
