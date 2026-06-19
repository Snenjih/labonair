import { useState, useEffect, useRef, useMemo } from "react";
import { motion } from "motion/react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { git } from "@/modules/source-control/lib/gitInvoke";
import { cn } from "@/lib/utils";

interface CommitDiffPanelProps {
  hash: string;
  repositoryPath: string;
  onClose: () => void;
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
        "font-mono text-[11px] leading-5 px-2 whitespace-pre",
        isAdd && !isInOurs && !isInTheirs && "bg-green-500/10 text-green-500",
        isDel && !isInOurs && !isInTheirs && "bg-red-500/10 text-red-500",
        isHunk && "bg-blue-400/5 text-blue-400/80 text-xs",
        isFileHeader && "bg-muted/40 text-muted-foreground/70 text-[10px]",
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

export function CommitDiffPanel({ hash, repositoryPath, onClose }: CommitDiffPanelProps) {
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
    <motion.div
      initial={{ x: 300, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 300, opacity: 0 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      className="flex h-full w-[360px] shrink-0 flex-col border-l border-border bg-background"
    >
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-medium text-foreground/80">
            Changes in{" "}
            <code className="font-mono text-foreground">{shortHash}</code>
          </p>
          {filePaths.length > 0 && (
            <p className="text-[10px] text-muted-foreground">{filePaths.length} files changed</p>
          )}
        </div>
        <button
          type="button"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground/60 hover:bg-muted hover:text-foreground transition-colors"
          onClick={onClose}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* File navigation strip */}
      {filePaths.length > 1 && (
        <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-border/40 px-2 py-1 scrollbar-none">
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

      {/* Content */}
      {isLoading ? (
        <div className="space-y-1 p-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-full" />
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
            <div className="border-b border-yellow-500/30 bg-yellow-500/10 px-2 py-1.5 text-[10px] text-yellow-500">
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

                return (
                  <DiffLine key={i} line={line} isInOurs={isInOurs} isInTheirs={isInTheirs} />
                );
              });
            })()}
          </div>
        </ScrollArea>
      )}
    </motion.div>
  );
}
