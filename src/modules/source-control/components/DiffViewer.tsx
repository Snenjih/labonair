import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Cancel01Icon, SourceCodeIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { cn } from "@/lib/utils";
import { useSourceControlStore } from "../store/sourceControlStore";

function basename(path: string): string {
  const parts = path.split("/").filter(Boolean);
  return parts.length ? parts[parts.length - 1] : path;
}

function DiffLine({ line }: { line: string }) {
  const isAdd = line.startsWith("+") && !line.startsWith("+++");
  const isDel = line.startsWith("-") && !line.startsWith("---");
  const isHunk = line.startsWith("@@");

  return (
    <div
      className={cn(
        "font-mono text-[11px] leading-5 px-2 whitespace-pre",
        isAdd && "bg-green-500/10 text-green-500",
        isDel && "bg-red-500/10 text-red-500",
        isHunk && "bg-blue-400/5 text-blue-400/80 text-xs",
        !isAdd && !isDel && !isHunk && "text-muted-foreground"
      )}
    >
      {line || " "}
    </div>
  );
}

export function DiffViewer() {
  const selectedFile = useSourceControlStore((s) => s.selectedFile);
  const diffContent = useSourceControlStore((s) => s.diffContent);
  const isDiffLoading = useSourceControlStore((s) => s.isDiffLoading);
  const clearSelectedFile = useSourceControlStore((s) => s.clearSelectedFile);

  if (!selectedFile) return null;

  const isBinary = diffContent?.includes("Binary files") ?? false;
  const isTruncated =
    diffContent?.includes("[truncated]") || diffContent?.includes("[diff too large]");

  return (
    <div className="border-t border-border/60">
      {/* Header */}
      <div className="flex h-7 items-center gap-1.5 border-b border-border/40 px-2">
        <HugeiconsIcon
          icon={SourceCodeIcon}
          size={12}
          strokeWidth={2}
          className="shrink-0 text-muted-foreground/60"
        />
        <span className="flex-1 truncate text-[11px] font-medium text-foreground/80">
          Diff: {basename(selectedFile.path)}
        </span>
        <button
          type="button"
          className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground"
          onClick={clearSelectedFile}
          title="Close diff"
        >
          <HugeiconsIcon icon={Cancel01Icon} size={11} strokeWidth={2} />
        </button>
      </div>

      {/* Content */}
      {isDiffLoading ? (
        <div className="space-y-1 p-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      ) : isBinary ? (
        <div className="px-3 py-4 text-center text-[11px] text-muted-foreground/60">
          Binary file changed
        </div>
      ) : !diffContent ? (
        <div className="px-3 py-4 text-center text-[11px] text-muted-foreground/60">
          No diff available
        </div>
      ) : (
        <ScrollArea className="max-h-[300px] overflow-auto">
          {isTruncated && (
            <div className="border-b border-yellow-500/30 bg-yellow-500/10 px-2 py-1.5 text-[10px] text-yellow-500">
              Diff is too large — showing a truncated version.
            </div>
          )}
          <div className="overflow-x-auto">
            {diffContent.split("\n").map((line, i) => (
              // eslint-disable-next-line react/no-array-index-key
              <DiffLine key={i} line={line} />
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
