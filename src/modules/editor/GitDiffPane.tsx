import {
  FilterIcon,
  GitCompareIcon,
  MinusSignIcon,
  PlusSignIcon,
  SourceCodeIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useNotificationStore } from "@/modules/notifications/store/useNotificationStore";
import {
  buildHunkPatch,
  type DiffHunk,
  type FileDiff,
  isWholeFileSingleHunk,
  parseDiffHunks,
} from "@/modules/source-control/lib/diffHunks";
import { git } from "@/modules/source-control/lib/gitInvoke";

interface Props {
  repoRoot: string;
  filePath: string;
  staged: boolean;
  section: "staged" | "unstaged" | "untracked";
  sessionId?: string;
}

interface DiffLineProps {
  line: string;
}

function DiffLine({ line }: DiffLineProps) {
  const isAdd = line.startsWith("+") && !line.startsWith("+++");
  const isDel = line.startsWith("-") && !line.startsWith("---");
  const isHunk = line.startsWith("@@");
  const isMeta =
    line.startsWith("diff ") || line.startsWith("index ") || line.startsWith("---") || line.startsWith("+++");

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

interface HunkHeaderLineProps {
  line: string;
  /** Whether this diff is the "staged" side — determines Stage vs. Unstage. */
  staged: boolean;
  busy: boolean;
  onAction: () => void;
}

/** Same visual weight/row shape as `DiffLine`'s hunk-header styling, plus a
 *  per-hunk Stage/Unstage action revealed on hover — mirrors the always-on
 *  per-file button in `FileChangeItem.tsx` (same icon pair, same 4x4 size),
 *  just hover-revealed since hunk headers are far denser than file rows. */
function HunkHeaderLine({ line, staged, busy, onAction }: HunkHeaderLineProps) {
  return (
    <div className="group/hunk flex min-h-[20px] items-stretch bg-blue-400/5 font-mono text-[11.5px] leading-5">
      <span className="w-5 shrink-0 select-none text-center text-[11px] leading-5 text-blue-400/60"> </span>
      <span className="flex-1 truncate whitespace-pre px-2 py-0 leading-5 text-blue-400/80">{line}</span>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              disabled={busy}
              className="mr-1 flex h-4 w-4 shrink-0 items-center justify-center self-center rounded text-muted-foreground opacity-0 transition-opacity hover:bg-foreground/10 hover:text-foreground group-hover/hunk:opacity-100 disabled:opacity-40"
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

export function GitDiffPane({ repoRoot, filePath, staged, section, sessionId }: Props) {
  const [diff, setDiff] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ignoreWhitespace, setIgnoreWhitespace] = useState(false);
  // Bumped after a successful hunk stage/unstage to force the diff effect
  // below to re-fetch — the hunk that was just (un)staged shifts every
  // subsequent hunk's line numbers, so re-parsing stale diff text after a
  // mutation isn't safe; refetching from git is.
  const [refreshToken, setRefreshToken] = useState(0);
  // Identifies the hunk currently being staged/unstaged (by its unique "@@"
  // header text) so only that hunk's button shows a disabled/busy state.
  const [pendingHunkHeader, setPendingHunkHeader] = useState<string | null>(null);
  const cancelRef = useRef(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: refreshToken isn't read in the body — it's the intentional re-fetch trigger after a hunk stage/unstage
  useEffect(() => {
    cancelRef.current = false;
    setLoading(true);
    setError(null);
    setDiff(null);

    git
      .getDiff(repoRoot, filePath, staged, ignoreWhitespace, sessionId, section === "untracked")
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
  }, [repoRoot, filePath, staged, ignoreWhitespace, sessionId, section, refreshToken]);

  const stats = diff ? computeStats(diff) : null;
  const lines = diff ? diff.split("\n") : [];
  const isBinary = diff?.includes("Binary files") ?? false;

  // Hunk staging is only offered for a non-binary diff with parseable hunks
  // — `parseDiffHunks` itself already refuses a truncated diff (returns
  // `[]`), and `isBinary` (checked again at the render site below) keeps it
  // off binary files, satisfying the "never offer hunk staging on a file
  // already flagged binary" requirement without duplicating that detection.
  const parsedFile: FileDiff | undefined = useMemo(
    () => (diff && !isBinary ? parseDiffHunks(diff)[0] : undefined),
    [diff, isBinary],
  );

  // Maps each "@@ ..." line's index in `lines` to its parsed hunk, in the
  // same top-to-bottom order both arrays share (both are derived from the
  // same `diff` string).
  const hunkAtLineIndex = useMemo(() => {
    const map = new Map<number, DiffHunk>();
    if (!parsedFile) return map;
    let hunkIdx = 0;
    lines.forEach((line, i) => {
      if (/^@@ -/.test(line)) {
        const hunk = parsedFile.hunks[hunkIdx];
        if (hunk) map.set(i, hunk);
        hunkIdx++;
      }
    });
    return map;
  }, [lines, parsedFile]);

  async function handleHunkAction(hunk: DiffHunk) {
    if (!parsedFile) return;
    setPendingHunkHeader(hunk.header);
    try {
      if (isWholeFileSingleHunk(parsedFile)) {
        // A brand-new or fully-deleted file always collapses into exactly
        // one hunk covering the whole file — use the proven whole-file
        // stage/unstage path instead of `git apply --cached` for that shape
        // (see `isWholeFileSingleHunk`'s doc comment for why).
        if (staged) {
          await git.unstageFile(repoRoot, filePath, sessionId);
        } else {
          await git.stageFile(repoRoot, filePath, sessionId);
        }
      } else {
        const patch = buildHunkPatch(parsedFile, hunk);
        if (staged) {
          await git.unstageHunk(repoRoot, filePath, patch, sessionId);
        } else {
          await git.stageHunk(repoRoot, filePath, patch, sessionId);
        }
      }
      setRefreshToken((t) => t + 1);
    } catch (e) {
      useNotificationStore
        .getState()
        .addNotification({ type: "error", title: "Hunk Staging Failed", message: String(e) });
    } finally {
      setPendingHunkHeader(null);
    }
  }

  const dirPath = filePath.includes("/") ? filePath.slice(0, filePath.lastIndexOf("/") + 1) : "";
  const fileName = filePath.split("/").pop() ?? filePath;

  return (
    <div className="flex h-full min-h-0 flex-col rounded-md border border-border/60 bg-background">
      {/* Header */}
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border/50 px-3">
        <HugeiconsIcon
          icon={GitCompareIcon}
          size={13}
          strokeWidth={1.75}
          className="shrink-0 text-modified"
        />

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
        {!loading &&
          !error &&
          diff !== null &&
          (isBinary ? (
            <div className="flex h-full items-center justify-center">
              <div className="flex flex-col items-center gap-2">
                <HugeiconsIcon
                  icon={SourceCodeIcon}
                  size={24}
                  strokeWidth={1.5}
                  className="text-muted-foreground/30"
                />
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
                {lines.map((line, i) => {
                  const hunk = hunkAtLineIndex.get(i);
                  if (hunk) {
                    return (
                      <HunkHeaderLine
                        key={i}
                        line={line}
                        staged={staged}
                        busy={pendingHunkHeader === hunk.header}
                        onAction={() => void handleHunkAction(hunk)}
                      />
                    );
                  }
                  return <DiffLine key={i} line={line} />;
                })}
              </div>
            </ScrollArea>
          ))}
      </div>
    </div>
  );
}
