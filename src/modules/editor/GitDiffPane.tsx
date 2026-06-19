import { useEffect, useRef, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  FilterIcon,
  GitCompareIcon,
  SourceCodeIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { cn } from "@/lib/utils";
import { git } from "@/modules/source-control/lib/gitInvoke";

interface Props {
  repoRoot: string;
  filePath: string;
  staged: boolean;
  section: "staged" | "unstaged" | "untracked";
}

interface DiffLineProps {
  line: string;
}

function DiffLine({ line }: DiffLineProps) {
  const isAdd = line.startsWith("+") && !line.startsWith("+++");
  const isDel = line.startsWith("-") && !line.startsWith("---");
  const isHunk = line.startsWith("@@");
  const isMeta = line.startsWith("diff ") || line.startsWith("index ") || line.startsWith("---") || line.startsWith("+++");

  return (
    <div
      className={cn(
        "flex min-h-[20px] items-stretch font-mono text-[11.5px] leading-5",
        isAdd && "bg-green-500/10",
        isDel && "bg-red-500/10",
        isHunk && "bg-blue-400/5",
        isMeta && "opacity-40",
      )}
    >
      {/* Gutter indicator */}
      <span
        className={cn(
          "w-5 shrink-0 select-none text-center text-[11px] leading-5",
          isAdd && "bg-green-500/20 text-green-500",
          isDel && "bg-red-500/20 text-red-500",
          isHunk && "text-blue-400/60",
          !isAdd && !isDel && !isHunk && "text-muted-foreground/20",
        )}
      >
        {isAdd ? "+" : isDel ? "−" : " "}
      </span>
      {/* Content */}
      <span
        className={cn(
          "flex-1 whitespace-pre px-2 py-0 leading-5",
          isAdd && "text-green-400",
          isDel && "text-red-400",
          isHunk && "text-blue-400/80",
          isMeta && "text-muted-foreground",
          !isAdd && !isDel && !isHunk && !isMeta && "text-foreground/80",
        )}
      >
        {line.slice(isAdd || isDel ? 1 : 0) || " "}
      </span>
    </div>
  );
}

function computeStats(diff: string): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const line of diff.split("\n")) {
    if (line.startsWith("+") && !line.startsWith("+++")) added++;
    else if (line.startsWith("-") && !line.startsWith("---")) removed++;
  }
  return { added, removed };
}

const SECTION_LABEL: Record<Props["section"], string> = {
  staged: "Staged",
  unstaged: "Working tree",
  untracked: "Untracked",
};

export function GitDiffPane({ repoRoot, filePath, staged, section }: Props) {
  const [diff, setDiff] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ignoreWhitespace, setIgnoreWhitespace] = useState(false);
  const cancelRef = useRef(false);

  useEffect(() => {
    cancelRef.current = false;
    setLoading(true);
    setError(null);
    setDiff(null);

    git
      .getDiff(repoRoot, filePath, staged, ignoreWhitespace)
      .then((content) => {
        if (!cancelRef.current) setDiff(content);
      })
      .catch((e: unknown) => {
        if (!cancelRef.current) setError(String(e));
      })
      .finally(() => {
        if (!cancelRef.current) setLoading(false);
      });

    return () => {
      cancelRef.current = true;
    };
  }, [repoRoot, filePath, staged, ignoreWhitespace]);

  const stats = diff ? computeStats(diff) : null;
  const lines = diff ? diff.split("\n") : [];
  const isBinary = diff?.includes("Binary files") ?? false;

  const dirPath = filePath.includes("/")
    ? filePath.slice(0, filePath.lastIndexOf("/") + 1)
    : "";
  const fileName = filePath.split("/").pop() ?? filePath;

  return (
    <div className="flex h-full min-h-0 flex-col rounded-md border border-border/60 bg-background">
      {/* Header */}
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border/50 px-3">
        <HugeiconsIcon icon={GitCompareIcon} size={13} strokeWidth={1.75} className="shrink-0 text-modified" />

        {/* Path */}
        <span className="flex min-w-0 flex-1 items-baseline gap-0 truncate font-mono text-[11px]">
          <span className="text-muted-foreground/40">{dirPath}</span>
          <span className="font-medium text-foreground/85">{fileName}</span>
        </span>

        {/* Section badge */}
        <span className="shrink-0 rounded bg-muted/60 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-muted-foreground/60">
          {SECTION_LABEL[section]}
        </span>

        {/* Stats */}
        {stats && (
          <span className="flex shrink-0 items-center gap-1.5 text-[11px] tabular-nums">
            <span className="font-medium text-green-500">+{stats.added}</span>
            <span className="font-medium text-red-500">−{stats.removed}</span>
          </span>
        )}

        {/* Ignore whitespace toggle */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded transition-colors",
                  ignoreWhitespace
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground/50 hover:bg-muted hover:text-foreground",
                )}
                onClick={() => setIgnoreWhitespace((v) => !v)}
              >
                <HugeiconsIcon icon={FilterIcon} size={12} strokeWidth={2} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Ignore whitespace</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Content */}
      <div className="min-h-0 flex-1 overflow-hidden">
        {loading && (
          <div className="flex h-full items-center justify-center">
            <Spinner className="size-4" />
          </div>
        )}
        {error && (
          <div className="flex h-full items-center justify-center p-6 text-center">
            <p className="text-[11px] text-muted-foreground/60">{error}</p>
          </div>
        )}
        {!loading && !error && diff !== null && (
          isBinary ? (
            <div className="flex h-full items-center justify-center">
              <div className="flex flex-col items-center gap-2">
                <HugeiconsIcon icon={SourceCodeIcon} size={24} strokeWidth={1.5} className="text-muted-foreground/30" />
                <p className="text-[11px] text-muted-foreground/50">Binary file — no diff available</p>
              </div>
            </div>
          ) : diff === "" ? (
            <div className="flex h-full items-center justify-center">
              <p className="text-[11px] text-muted-foreground/50">No changes</p>
            </div>
          ) : (
            <ScrollArea className="h-full">
              <div className="py-1">
                {lines.map((line, i) => (
                  <DiffLine key={i} line={line} />
                ))}
              </div>
            </ScrollArea>
          )
        )}
      </div>
    </div>
  );
}
