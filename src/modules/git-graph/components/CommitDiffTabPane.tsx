import { useState, useEffect, useRef, useMemo } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { git } from "@/modules/source-control/lib/gitInvoke";
import { cn } from "@/lib/utils";

interface Props {
  repositoryPath: string;
  hash: string;
}

function DiffLine({ line, isInOurs, isInTheirs }: { line: string; isInOurs: boolean; isInTheirs: boolean }) {
  const isAdd = line.startsWith("+") && !line.startsWith("+++");
  const isDel = line.startsWith("-") && !line.startsWith("---");
  const isHunk = line.startsWith("@@");
  const isFileHeader =
    line.startsWith("diff --git") ||
    line.startsWith("+++") ||
    line.startsWith("---") ||
    line.startsWith("index ") ||
    line.startsWith("new file") ||
    line.startsWith("deleted file");
  const isOurMarker = line.startsWith("<<<<<<<");
  const isTheirMarker = line.startsWith(">>>>>>>");
  const isSep = line.startsWith("=======");

  return (
    <div
      className={cn(
        "font-mono text-[11px] leading-5 px-3 whitespace-pre",
        isAdd && !isInOurs && !isInTheirs && "bg-success/10 text-success",
        isDel && !isInOurs && !isInTheirs && "bg-error/10 text-error",
        isHunk && "bg-info/5 text-info/80 text-xs",
        isFileHeader && "bg-muted/40 text-muted-foreground text-[10px]",
        isOurMarker && "bg-purple-500/15 text-purple-400 font-bold border-l-2 border-purple-500",
        isTheirMarker && "bg-orange-500/15 text-orange-400 font-bold border-l-2 border-orange-500",
        isSep && "bg-border/50 text-muted-foreground",
        isInOurs && !isOurMarker && !isSep && "bg-purple-500/5",
        isInTheirs && !isTheirMarker && !isSep && "bg-orange-500/5",
        !isAdd &&
          !isDel &&
          !isHunk &&
          !isFileHeader &&
          !isOurMarker &&
          !isTheirMarker &&
          !isSep &&
          !isInOurs &&
          !isInTheirs &&
          "text-muted-foreground",
      )}
    >
      {line || " "}
    </div>
  );
}

function basename(path: string): string {
  const parts = path.split("/").filter(Boolean);
  return parts.length ? parts[parts.length - 1] : path;
}

export function CommitDiffTabPane({ repositoryPath, hash }: Props) {
  const [diffContent, setDiffContent] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setDiffContent(null);
    setIsLoading(true);
    git
      .getCommitDiff(repositoryPath, hash)
      .then((content) => setDiffContent(content))
      .catch(() => setDiffContent(null))
      .finally(() => setIsLoading(false));
  }, [repositoryPath, hash]);

  const filePaths = useMemo(() => {
    if (!diffContent) return [];
    const matches = diffContent.match(/^diff --git a\/.+ b\/(.+)$/gm) ?? [];
    return matches
      .map((line) => {
        const match = /^diff --git a\/.+ b\/(.+)$/.exec(line);
        return match ? match[1] : "";
      })
      .filter(Boolean);
  }, [diffContent]);

  const shortHash = hash.slice(0, 7);
  const isTruncated = diffContent?.includes("[diff truncated") ?? false;
  const isBinary = diffContent?.includes("Binary files") ?? false;
  const lines = diffContent?.split("\n") ?? [];

  function scrollToFile(fp: string) {
    const id = `commit-diff-file-${encodeURIComponent(fp)}`;
    const el = document.getElementById(id);
    if (el && scrollRef.current) {
      const container =
        scrollRef.current.querySelector("[data-radix-scroll-area-viewport]") ?? scrollRef.current;
      const containerRect = container.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      (container as HTMLElement).scrollTop += elRect.top - containerRect.top - 8;
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col rounded-md border border-border/60 bg-background">
      {/* Header */}
      <div className="flex h-9 shrink-0 items-center gap-3 border-b border-border/50 px-3">
        <span className="text-[11px] font-medium text-foreground/80">
          Changes in <code className="font-mono text-foreground">{shortHash}</code>
        </span>
        {filePaths.length > 0 && (
          <span className="text-[10px] text-muted-foreground/60">{filePaths.length} files changed</span>
        )}
        {/* File navigation strip */}
        {filePaths.length > 1 && (
          <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto scrollbar-none">
            {filePaths.map((fp) => (
              <button
                key={fp}
                type="button"
                className="shrink-0 whitespace-nowrap rounded px-2 py-0.5 text-[10px] text-muted-foreground/70 hover:bg-muted/40 hover:text-foreground"
                onClick={() => scrollToFile(fp)}
              >
                {basename(fp)}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="space-y-1 p-4">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
        </div>
      ) : !diffContent ? (
        <div className="flex h-full items-center justify-center">
          <p className="text-[11px] text-muted-foreground/60">Could not load diff</p>
        </div>
      ) : isBinary ? (
        <div className="flex h-full items-center justify-center">
          <p className="text-[11px] text-muted-foreground/60">Binary files changed</p>
        </div>
      ) : (
        <ScrollArea ref={scrollRef} className="min-h-0 flex-1">
          {isTruncated && (
            <div className="border-b border-warning/30 bg-warning/10 px-3 py-1.5 text-[10px] text-warning">
              Diff is too large — showing a truncated version.
            </div>
          )}
          <div className="overflow-x-auto">
            {(() => {
              let isInOurs = false;
              let isInTheirs = false;
              return lines.map((line, i) => {
                if (line.startsWith("<<<<<<<")) {
                  isInOurs = true;
                  isInTheirs = false;
                } else if (line.startsWith("=======")) {
                  isInOurs = false;
                  isInTheirs = true;
                } else if (line.startsWith(">>>>>>>")) {
                  isInTheirs = false;
                }
                const fileMatch = /^diff --git a\/.+ b\/(.+)$/.exec(line);
                if (fileMatch) {
                  const fp = fileMatch[1];
                  return (
                    <div key={i} id={`commit-diff-file-${encodeURIComponent(fp)}`}>
                      <DiffLine line={line} isInOurs={false} isInTheirs={false} />
                    </div>
                  );
                }
                return <DiffLine key={i} line={line} isInOurs={isInOurs} isInTheirs={isInTheirs} />;
              });
            })()}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
