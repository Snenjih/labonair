import { useEffect, useRef, useMemo } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Cancel01Icon,
  SourceCodeIcon,
  FilterIcon,
  LayoutTwoColumnIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { cn } from "@/lib/utils";
import { useSourceControlStore } from "../store/sourceControlStore";
import { SideBySideDiff } from "./SideBySideDiff";
import type { SelectionMode, GitStatus } from "../types";

function basename(path: string): string {
  const parts = path.split("/").filter(Boolean);
  return parts.length ? parts[parts.length - 1] : path;
}

function getDiffLabel(selectionMode: SelectionMode | null, status: GitStatus | null): string {
  if (!selectionMode) return '';
  switch (selectionMode.type) {
    case 'file':
      return `Diff: ${basename(selectionMode.path)}`;
    case 'section':
      if (selectionMode.section === 'staged')
        return `Staged Changes (${status?.staged.length ?? 0} files)`;
      if (selectionMode.section === 'unstaged')
        return `Changes (${status?.unstaged.length ?? 0} files)`;
      return 'Untracked Files';
    case 'all': {
      const n =
        (status?.staged.length ?? 0) +
        (status?.unstaged.length ?? 0) +
        (status?.untracked.length ?? 0);
      return `All Changes (${n} files)`;
    }
    case 'commit':
      return `Commit ${selectionMode.hash.slice(0, 7)}`;
  }
}

interface DiffLineProps {
  line: string;
  isInOurs?: boolean;
  isInTheirs?: boolean;
}

function DiffLine({ line, isInOurs, isInTheirs }: DiffLineProps) {
  const isAdd = line.startsWith("+") && !line.startsWith("+++");
  const isDel = line.startsWith("-") && !line.startsWith("---");
  const isHunk = line.startsWith("@@");

  // Conflict marker detection
  const isConflictOurs = line.startsWith("<<<<<<<");
  const isConflictSep = line.startsWith("=======");
  const isConflictTheirs = line.startsWith(">>>>>>>");

  return (
    <div
      className={cn(
        "font-mono text-[11px] leading-5 px-2 whitespace-pre",
        // Conflict markers take priority
        isConflictOurs &&
          "bg-purple-500/15 text-purple-400 font-bold border-l-2 border-purple-500",
        isConflictSep && "bg-border/50 text-muted-foreground",
        isConflictTheirs &&
          "bg-orange-500/15 text-orange-400 font-bold border-l-2 border-orange-500",
        // Conflict zone backgrounds (when inside a conflict block)
        !isConflictOurs && !isConflictSep && !isConflictTheirs && isInOurs && "bg-purple-500/5",
        !isConflictOurs && !isConflictSep && !isConflictTheirs && isInTheirs && "bg-orange-500/5",
        // Normal diff colors (only when not in a conflict zone)
        !isConflictOurs &&
          !isConflictSep &&
          !isConflictTheirs &&
          !isInOurs &&
          !isInTheirs &&
          isAdd &&
          "bg-green-500/10 text-green-500",
        !isConflictOurs &&
          !isConflictSep &&
          !isConflictTheirs &&
          !isInOurs &&
          !isInTheirs &&
          isDel &&
          "bg-red-500/10 text-red-500",
        isHunk && "bg-blue-400/5 text-blue-400/80 text-xs",
        !isAdd &&
          !isDel &&
          !isHunk &&
          !isConflictOurs &&
          !isConflictSep &&
          !isConflictTheirs &&
          !isInOurs &&
          !isInTheirs &&
          "text-muted-foreground"
      )}
    >
      {line || " "}
    </div>
  );
}

export function DiffViewer() {
  const status = useSourceControlStore((s) => s.status);
  const selectionMode = useSourceControlStore((s) => s.selectionMode);
  const diffContent = useSourceControlStore((s) => s.diffContent);
  const isDiffLoading = useSourceControlStore((s) => s.isDiffLoading);
  const diffViewMode = useSourceControlStore((s) => s.diffViewMode);
  const ignoreWhitespace = useSourceControlStore((s) => s.ignoreWhitespace);
  const clearSelectedFile = useSourceControlStore((s) => s.clearSelectedFile);
  const setDiffViewMode = useSourceControlStore((s) => s.setDiffViewMode);
  const setIgnoreWhitespace = useSourceControlStore((s) => s.setIgnoreWhitespace);

  const scrollAreaRef = useRef<HTMLDivElement>(null);

  // Derive whether the current selection is still valid
  const selectionStillValid = useMemo(() => {
    if (!selectionMode || !status) return false;
    switch (selectionMode.type) {
      case 'file':
        if (selectionMode.staged) {
          return status.staged.some((f) => f.path === selectionMode.path);
        }
        return (
          status.unstaged.some((f) => f.path === selectionMode.path) ||
          status.untracked.some((f) => f.path === selectionMode.path)
        );
      case 'section':
        return true;
      case 'all':
        return true;
      case 'commit':
        return true;
    }
  }, [selectionMode, status]);

  // If the selected file was removed from all lists, clear the diff
  useEffect(() => {
    if (selectionMode && status && !selectionStillValid) {
      if (selectionMode.type === 'file') {
        clearSelectedFile();
      }
    }
  }, [selectionMode, status, selectionStillValid, clearSelectedFile]);

  // Parse file paths from multi-file diff content
  const filePaths = useMemo(() => {
    if (!diffContent || diffContent === '__UNTRACKED_ONLY__') return [];
    const matches = diffContent.match(/^diff --git a\/.+ b\/(.+)$/gm) ?? [];
    return matches
      .map((line) => {
        const match = /^diff --git a\/.+ b\/(.+)$/.exec(line);
        return match ? match[1] : '';
      })
      .filter(Boolean);
  }, [diffContent]);

  function scrollToFile(fp: string) {
    const id = `diff-file-${encodeURIComponent(fp)}`;
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  if (!selectionMode) return null;

  const isBinary = diffContent?.includes("Binary files") ?? false;
  const isTruncated =
    diffContent?.includes("[truncated]") || diffContent?.includes("[diff too large]");

  const isMultiFile = selectionMode.type !== 'file' && filePaths.length > 1;
  const showConflictBadge =
    selectionMode.type === 'file' &&
    status?.hasConflicts &&
    (status.staged.some((f) => f.path === selectionMode.path && f.indexStatus === 'U') ||
      status.unstaged.some((f) => f.path === selectionMode.path && f.worktreeStatus === 'U'));

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
          {getDiffLabel(selectionMode, status)}
        </span>

        {showConflictBadge && (
          <span className="shrink-0 rounded-full bg-orange-500/20 px-1.5 py-0.5 text-[9px] font-medium text-orange-400">
            CONFLICT
          </span>
        )}

        {/* Ignore whitespace toggle */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className={cn(
                  "flex h-5 w-5 items-center justify-center rounded transition-colors",
                  ignoreWhitespace
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground/60 hover:bg-muted hover:text-foreground"
                )}
                onClick={() => setIgnoreWhitespace(!ignoreWhitespace)}
              >
                <HugeiconsIcon icon={FilterIcon} size={11} strokeWidth={2} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Ignore whitespace</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* Side-by-side toggle */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className={cn(
                  "flex h-5 w-5 items-center justify-center rounded transition-colors",
                  diffViewMode === 'split'
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground/60 hover:bg-muted hover:text-foreground"
                )}
                onClick={() =>
                  setDiffViewMode(diffViewMode === 'split' ? 'unified' : 'split')
                }
              >
                <HugeiconsIcon icon={LayoutTwoColumnIcon} size={11} strokeWidth={2} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Side-by-side diff</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* Close */}
        <button
          type="button"
          className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground"
          onClick={clearSelectedFile}
          title="Close diff"
        >
          <HugeiconsIcon icon={Cancel01Icon} size={11} strokeWidth={2} />
        </button>
      </div>

      {/* File navigation strip for multi-file diffs */}
      {isMultiFile && (
        <div className="flex overflow-x-auto border-b border-border/40 px-2 py-1 gap-1 scrollbar-none">
          {filePaths.map((fp) => (
            <button
              key={fp}
              type="button"
              className="shrink-0 rounded px-2 py-0.5 text-[10px] text-muted-foreground/70 hover:bg-muted/40 hover:text-foreground whitespace-nowrap"
              onClick={() => scrollToFile(fp)}
            >
              {basename(fp)}
            </button>
          ))}
        </div>
      )}

      {/* Content */}
      {isDiffLoading ? (
        <div className="space-y-1 p-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      ) : diffContent === '__UNTRACKED_ONLY__' ? (
        <div className="flex flex-col items-center gap-2 px-4 py-6 text-center">
          <p className="text-[12px] text-muted-foreground/60">
            Untracked files are not shown in the diff preview.
          </p>
          <p className="text-[11px] text-muted-foreground/40">
            Stage them to see their content as an addition.
          </p>
        </div>
      ) : isBinary ? (
        <div className="px-3 py-4 text-center text-[11px] text-muted-foreground/60">
          Binary file changed
        </div>
      ) : !diffContent ? (
        <div className="px-3 py-4 text-center text-[11px] text-muted-foreground/60">
          No diff available
        </div>
      ) : diffViewMode === 'split' ? (
        <SideBySideDiff diffContent={diffContent} />
      ) : (
        <ScrollArea className="max-h-[300px] overflow-auto" ref={scrollAreaRef}>
          {isTruncated && (
            <div className="border-b border-yellow-500/30 bg-yellow-500/10 px-2 py-1.5 text-[10px] text-yellow-500">
              Diff is too large — showing a truncated version.
            </div>
          )}
          <div className="overflow-x-auto">
            {/* Render lines with file anchors for multi-file navigation */}
            {renderDiffWithAnchors(diffContent)}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}

interface BufferedLine {
  line: string;
  isInOurs: boolean;
  isInTheirs: boolean;
}

function renderDiffWithAnchors(diffContent: string) {
  const lines = diffContent.split("\n");
  const result: React.ReactNode[] = [];
  let fileBuffer: BufferedLine[] = [];
  let currentFile: string | null = null;

  // Conflict zone state tracked across all lines
  let isInOurs = false;
  let isInTheirs = false;

  function flushFile() {
    if (currentFile !== null) {
      const id = `diff-file-${encodeURIComponent(currentFile)}`;
      result.push(
        <div key={id} id={id}>
          {fileBuffer.map((entry, i) => (
            // eslint-disable-next-line react/no-array-index-key
            <DiffLine key={i} line={entry.line} isInOurs={entry.isInOurs} isInTheirs={entry.isInTheirs} />
          ))}
        </div>
      );
      fileBuffer = [];
      currentFile = null;
    }
  }

  for (const line of lines) {
    // Track conflict zone transitions before deciding what flags to assign
    const enterOurs = line.startsWith("<<<<<<<");
    const enterSep = line.startsWith("=======");
    const enterTheirs = line.startsWith(">>>>>>>");

    // Take a snapshot of the current zone for THIS line
    const lineIsInOurs = isInOurs;
    const lineIsInTheirs = isInTheirs;

    // Then update state for subsequent lines
    if (enterOurs) {
      isInOurs = true;
      isInTheirs = false;
    } else if (enterSep && isInOurs) {
      isInOurs = false;
      isInTheirs = true;
    } else if (enterTheirs && isInTheirs) {
      isInTheirs = false;
    }

    const match = /^diff --git a\/.+ b\/(.+)$/.exec(line);
    if (match) {
      flushFile();
      // Reset conflict state when entering a new file diff
      isInOurs = false;
      isInTheirs = false;
      currentFile = match[1];
      fileBuffer.push({ line, isInOurs: false, isInTheirs: false });
    } else if (currentFile !== null) {
      fileBuffer.push({ line, isInOurs: lineIsInOurs, isInTheirs: lineIsInTheirs });
    } else {
      result.push(
        <DiffLine key={result.length} line={line} isInOurs={lineIsInOurs} isInTheirs={lineIsInTheirs} />
      );
    }
  }

  flushFile();
  return result;
}
