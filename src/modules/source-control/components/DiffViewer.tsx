import {
  Cancel01Icon,
  FilterIcon,
  LayoutTwoColumnIcon,
  MinusSignIcon,
  PlusSignIcon,
  SourceCodeIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useMemo, useRef, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useNotificationStore } from "@/modules/notifications/store/useNotificationStore";
import {
  buildHunkPatch,
  type DiffHunk,
  type FileDiff,
  isWholeFileSingleHunk,
  parseDiffHunks,
} from "../lib/diffHunks";
import { git } from "../lib/gitInvoke";
import { useSourceControlStore } from "../store/sourceControlStore";
import type { GitStatus, SelectionMode } from "../types";
import { SideBySideDiff } from "./SideBySideDiff";

function basename(path: string): string {
  const parts = path.split("/").filter(Boolean);
  return parts.length ? parts[parts.length - 1] : path;
}

function getDiffLabel(selectionMode: SelectionMode | null, status: GitStatus | null): string {
  if (!selectionMode) return "";
  switch (selectionMode.type) {
    case "file":
      return `Diff: ${basename(selectionMode.path)}`;
    case "section":
      if (selectionMode.section === "staged") return `Staged Changes (${status?.staged.length ?? 0} files)`;
      if (selectionMode.section === "unstaged") return `Changes (${status?.unstaged.length ?? 0} files)`;
      return "Untracked Files";
    case "all": {
      const n =
        (status?.staged.length ?? 0) + (status?.unstaged.length ?? 0) + (status?.untracked.length ?? 0);
      return `All Changes (${n} files)`;
    }
    case "commit":
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
        isConflictOurs && "bg-purple-500/15 text-purple-400 font-bold border-l-2 border-purple-500",
        isConflictSep && "bg-border/50 text-muted-foreground",
        isConflictTheirs && "bg-orange-500/15 text-orange-400 font-bold border-l-2 border-orange-500",
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
          "bg-success/10 text-success",
        !isConflictOurs &&
          !isConflictSep &&
          !isConflictTheirs &&
          !isInOurs &&
          !isInTheirs &&
          isDel &&
          "bg-error/10 text-error",
        isHunk && "bg-info/5 text-info/80 text-xs",
        !isAdd &&
          !isDel &&
          !isHunk &&
          !isConflictOurs &&
          !isConflictSep &&
          !isConflictTheirs &&
          !isInOurs &&
          !isInTheirs &&
          "text-muted-foreground",
      )}
    >
      {line || " "}
    </div>
  );
}

interface HunkHeaderDiffLineProps {
  line: string;
  /** Whether the diff currently shown is the staged side — determines Stage vs. Unstage. */
  staged: boolean;
  busy: boolean;
  onAction: () => void;
}

/** Same row/typography as `DiffLine`'s hunk styling, plus a hover-revealed
 *  per-hunk Stage/Unstage action — same icon pair and 4x4 sizing as the
 *  always-visible per-file button in `FileChangeItem.tsx`. */
function HunkHeaderDiffLine({ line, staged, busy, onAction }: HunkHeaderDiffLineProps) {
  return (
    <div className="group/hunk flex items-center gap-1.5 bg-info/5 px-2 font-mono text-[11px] leading-5 text-info/80">
      <span className="min-w-0 flex-1 truncate">{line || " "}</span>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              disabled={busy}
              className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:bg-foreground/10 hover:text-foreground group-hover/hunk:opacity-100 disabled:opacity-40"
              onClick={onAction}
            >
              <HugeiconsIcon icon={staged ? MinusSignIcon : PlusSignIcon} size={10} strokeWidth={2} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="left">{staged ? "Unstage Hunk" : "Stage Hunk"}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
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
  const repoRoot = useSourceControlStore((s) => s.repoRoot);
  const sessionId = useSourceControlStore((s) => s.sessionId);
  const setDiffContent = useSourceControlStore((s) => s.setDiffContent);

  const scrollRef = useRef<HTMLDivElement>(null);
  const ROW_HEIGHT = 20;
  const [pendingHunkHeader, setPendingHunkHeader] = useState<string | null>(null);

  // Hunk staging needs an unambiguous "is this the staged or unstaged side"
  // answer for the *entire* diff text being rendered. A single-file
  // selection and a "staged"/"unstaged" section selection both give that
  // directly; "all" concatenates a staged and an unstaged diff into one
  // string with no marker distinguishing which half a given file chunk came
  // from, and a "commit" selection is a historical diff with no staging
  // concept at all — hunk actions are disabled for both rather than risk
  // staging/unstaging the wrong side.
  const hunkStagingContext = useMemo((): { staged: boolean } | null => {
    if (!selectionMode) return null;
    if (selectionMode.type === "file") return { staged: selectionMode.staged };
    if (selectionMode.type === "section" && selectionMode.section !== "untracked") {
      return { staged: selectionMode.section === "staged" };
    }
    return null;
  }, [selectionMode]);

  const hunksByFile = useMemo(() => {
    const map = new Map<string, FileDiff>();
    if (!hunkStagingContext || !diffContent || diffContent === "__UNTRACKED_ONLY__") return map;
    for (const file of parseDiffHunks(diffContent)) {
      map.set(file.path, file);
    }
    return map;
  }, [diffContent, hunkStagingContext]);

  async function handleHunkAction(file: FileDiff, hunk: DiffHunk) {
    if (!repoRoot || !hunkStagingContext) return;
    const { staged } = hunkStagingContext;
    setPendingHunkHeader(hunk.header);
    try {
      if (isWholeFileSingleHunk(file)) {
        if (staged) {
          await git.unstageFile(repoRoot, file.path, sessionId ?? undefined);
        } else {
          await git.stageFile(repoRoot, file.path, sessionId ?? undefined);
        }
      } else {
        const patch = buildHunkPatch(file, hunk);
        if (staged) {
          await git.unstageHunk(repoRoot, file.path, patch, sessionId ?? undefined);
        } else {
          await git.stageHunk(repoRoot, file.path, patch, sessionId ?? undefined);
        }
      }
      // This component doesn't own the fetch that originally populated
      // `diffContent` (that lives in `useGitStatus.ts`'s poll/selection
      // effect) — re-run the same single-file/section fetch here so the
      // pane reflects the mutation immediately instead of waiting for the
      // next poll tick.
      if (selectionMode?.type === "file") {
        const content = await git.getDiff(
          repoRoot,
          selectionMode.path,
          selectionMode.staged,
          ignoreWhitespace,
          sessionId ?? undefined,
        );
        setDiffContent(content);
      } else if (selectionMode?.type === "section") {
        const content = await git.getDiff(
          repoRoot,
          ".",
          selectionMode.section === "staged",
          ignoreWhitespace,
          sessionId ?? undefined,
        );
        setDiffContent(content);
      }
    } catch (e) {
      useNotificationStore
        .getState()
        .addNotification({ type: "error", title: "Hunk Staging Failed", message: String(e) });
    } finally {
      setPendingHunkHeader(null);
    }
  }

  // Derive whether the current selection is still valid
  const selectionStillValid = useMemo(() => {
    if (!selectionMode || !status) return false;
    switch (selectionMode.type) {
      case "file":
        if (selectionMode.staged) {
          return status.staged.some((f) => f.path === selectionMode.path);
        }
        return (
          status.unstaged.some((f) => f.path === selectionMode.path) ||
          status.untracked.some((f) => f.path === selectionMode.path)
        );
      case "section":
        return true;
      case "all":
        return true;
      case "commit":
        return true;
    }
  }, [selectionMode, status]);

  // If the selected file was removed from all lists, clear the diff
  useEffect(() => {
    if (selectionMode && status && !selectionStillValid) {
      if (selectionMode.type === "file") {
        clearSelectedFile();
      }
    }
  }, [selectionMode, status, selectionStillValid, clearSelectedFile]);

  // Parse file paths from multi-file diff content
  const filePaths = useMemo(() => {
    if (!diffContent || diffContent === "__UNTRACKED_ONLY__") return [];
    const matches = diffContent.match(/^diff --git a\/.+ b\/(.+)$/gm) ?? [];
    return matches
      .map((line) => {
        const match = /^diff --git a\/.+ b\/(.+)$/.exec(line);
        return match ? match[1] : "";
      })
      .filter(Boolean);
  }, [diffContent]);

  // Per-file binary detection — split the multi-file diff into per-file
  // chunks (same header regex used for file navigation) and check each
  // chunk independently, so one binary file in a multi-file diff doesn't
  // hide the real text diffs of the other files.
  const binaryFilePaths = useMemo(() => {
    if (!diffContent || diffContent === "__UNTRACKED_ONLY__") return new Set<string>();
    const chunks = diffContent.split(/^(?=diff --git a\/.+ b\/.+$)/m);
    const result = new Set<string>();
    for (const chunk of chunks) {
      const match = /^diff --git a\/.+ b\/(.+)$/m.exec(chunk);
      if (match && chunk.includes("Binary files")) {
        result.add(match[1]);
      }
    }
    return result;
  }, [diffContent]);

  const parsedLines = useMemo(
    () =>
      diffContent && diffContent !== "__UNTRACKED_ONLY__"
        ? parseDiffLines(diffContent, binaryFilePaths, hunksByFile)
        : [],
    [diffContent, binaryFilePaths, hunksByFile],
  );

  const virtualizer = useVirtualizer({
    count: parsedLines.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 20,
  });

  function scrollToFile(fp: string) {
    const idx = parsedLines.findIndex((l) => l.fileAnchor === fp);
    if (idx !== -1) {
      virtualizer.scrollToIndex(idx, { align: "start" });
    }
  }

  if (!selectionMode) return null;

  // Only collapse the whole viewer to "Binary file changed" when every file
  // in the selection is binary — a mixed multi-file diff falls through to
  // the normal line rendering below, where each binary file gets its own
  // inline placeholder (see `parseDiffLines`) instead of hiding everything.
  const isBinary =
    filePaths.length > 0
      ? filePaths.every((fp) => binaryFilePaths.has(fp))
      : (diffContent?.includes("Binary files") ?? false);
  const isTruncated = diffContent?.includes("[truncated]") || diffContent?.includes("[diff too large]");

  const isMultiFile = selectionMode.type !== "file" && filePaths.length > 1;
  const showConflictBadge =
    selectionMode.type === "file" &&
    status?.hasConflicts &&
    (status.staged.some((f) => f.path === selectionMode.path && f.indexStatus === "U") ||
      status.unstaged.some((f) => f.path === selectionMode.path && f.worktreeStatus === "U"));

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
                    : "text-muted-foreground/60 hover:bg-muted hover:text-foreground",
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
                  diffViewMode === "split"
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground/60 hover:bg-muted hover:text-foreground",
                )}
                onClick={() => setDiffViewMode(diffViewMode === "split" ? "unified" : "split")}
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
      ) : diffContent === "__UNTRACKED_ONLY__" ? (
        <div className="flex flex-col items-center gap-2 px-4 py-6 text-center">
          <p className="text-[12px] text-muted-foreground/60">
            Untracked files are not shown in the diff preview.
          </p>
          <p className="text-[11px] text-muted-foreground/40">
            Stage them to see their content as an addition.
          </p>
        </div>
      ) : isBinary ? (
        <div className="px-3 py-4 text-center text-[11px] text-muted-foreground/60">Binary file changed</div>
      ) : !diffContent ? (
        <div className="px-3 py-4 text-center text-[11px] text-muted-foreground/60">No diff available</div>
      ) : diffViewMode === "split" ? (
        <SideBySideDiff diffContent={diffContent} />
      ) : (
        <div ref={scrollRef} className="max-h-[300px] overflow-auto">
          {isTruncated && (
            <div className="border-b border-yellow-500/30 bg-yellow-500/10 px-2 py-1.5 text-[10px] text-yellow-500">
              Diff is too large — showing a truncated version.
            </div>
          )}
          <div
            className="overflow-x-auto"
            style={{ height: `${virtualizer.getTotalSize()}px`, position: "relative" }}
          >
            {virtualizer.getVirtualItems().map((virtualItem) => {
              const entry = parsedLines[virtualItem.index];
              const hunk = entry.hunk;
              const hunkFile = entry.hunkFile;
              return (
                <div
                  key={virtualItem.key}
                  id={entry.fileAnchor ? `diff-file-${encodeURIComponent(entry.fileAnchor)}` : undefined}
                  style={{ position: "absolute", top: virtualItem.start, width: "100%" }}
                >
                  {entry.isBinaryPlaceholder ? (
                    <div className="font-mono text-[11px] leading-5 px-2 text-center text-muted-foreground/60">
                      Binary file changed
                    </div>
                  ) : hunk && hunkFile && hunkStagingContext ? (
                    <HunkHeaderDiffLine
                      line={entry.line}
                      staged={hunkStagingContext.staged}
                      busy={pendingHunkHeader === hunk.header}
                      onAction={() => void handleHunkAction(hunkFile, hunk)}
                    />
                  ) : (
                    <DiffLine line={entry.line} isInOurs={entry.isInOurs} isInTheirs={entry.isInTheirs} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

interface ParsedDiffLine {
  line: string;
  isInOurs: boolean;
  isInTheirs: boolean;
  fileAnchor?: string;
  isBinaryPlaceholder?: boolean;
  /** Set on a "@@ ... @@" line when hunk staging is available for it — see `hunkStagingContext`. */
  hunk?: DiffHunk;
  hunkFile?: FileDiff;
}

function parseDiffLines(
  diffContent: string,
  binaryFilePaths: Set<string>,
  hunksByFile: Map<string, FileDiff> = new Map(),
): ParsedDiffLine[] {
  const lines = diffContent.split("\n");
  const result: ParsedDiffLine[] = [];
  let isInOurs = false;
  let isInTheirs = false;
  // While `true`, the current file's raw diff lines (e.g. "index ...",
  // "Binary files a/x and b/x differ") are suppressed in favor of a single
  // placeholder row, until the next file header line resets it.
  let skippingBinaryFile = false;
  // Which file's hunks (if any) apply to the section we're currently in,
  // and how many "@@" headers of that file we've already consumed — reset
  // on every new "diff --git" header, mirroring the order hunks appear in
  // both the raw text and `parseDiffHunks`'s per-file hunk array.
  let currentFileHunks: FileDiff | undefined;
  let hunkIdx = 0;

  for (const line of lines) {
    const match = /^diff --git a\/.+ b\/(.+)$/.exec(line);
    if (match) {
      // Reset conflict state on new file
      isInOurs = false;
      isInTheirs = false;
      const currentFile = match[1];
      result.push({ line, isInOurs: false, isInTheirs: false, fileAnchor: currentFile });
      skippingBinaryFile = binaryFilePaths.has(currentFile);
      currentFileHunks = hunksByFile.get(currentFile);
      hunkIdx = 0;
      if (skippingBinaryFile) {
        result.push({
          line: "Binary file changed",
          isInOurs: false,
          isInTheirs: false,
          isBinaryPlaceholder: true,
        });
      }
      continue;
    }

    if (skippingBinaryFile) {
      continue;
    }

    if (currentFileHunks && /^@@ -/.test(line)) {
      const hunk = currentFileHunks.hunks[hunkIdx];
      hunkIdx++;
      if (hunk) {
        result.push({ line, isInOurs: false, isInTheirs: false, hunk, hunkFile: currentFileHunks });
        continue;
      }
    }

    const enterOurs = line.startsWith("<<<<<<<");
    const enterSep = line.startsWith("=======");
    const enterTheirs = line.startsWith(">>>>>>>");

    const lineIsInOurs = isInOurs;
    const lineIsInTheirs = isInTheirs;

    if (enterOurs) {
      isInOurs = true;
      isInTheirs = false;
    } else if (enterSep && isInOurs) {
      isInOurs = false;
      isInTheirs = true;
    } else if (enterTheirs && isInTheirs) {
      isInTheirs = false;
    }

    result.push({ line, isInOurs: lineIsInOurs, isInTheirs: lineIsInTheirs });
  }

  return result;
}
