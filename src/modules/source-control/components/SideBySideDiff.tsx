import { useRef, useCallback } from "react";
import { cn } from "@/lib/utils";

interface SideBySideDiffProps {
  diffContent: string;
}

type DiffRowKind = 'hunk-header' | 'file-header' | 'context' | 'deletion' | 'addition' | 'paired';

interface DiffRow {
  kind: DiffRowKind;
  left: string;
  right: string;
  leftLineNum?: number;
  rightLineNum?: number;
}

function parseSideBySide(diffContent: string): DiffRow[] {
  const lines = diffContent.split("\n");
  const rows: DiffRow[] = [];

  let leftLineNum = 0;
  let rightLineNum = 0;
  // Pending deletions to pair with upcoming additions
  const pendingDeletions: string[] = [];

  function flushDeletions() {
    for (const del of pendingDeletions) {
      leftLineNum++;
      rows.push({
        kind: 'deletion',
        left: del,
        right: '',
        leftLineNum,
      });
    }
    pendingDeletions.length = 0;
  }

  for (const line of lines) {
    if (line.startsWith("diff --git")) {
      flushDeletions();
      rows.push({ kind: 'file-header', left: line, right: line });
      leftLineNum = 0;
      rightLineNum = 0;
      continue;
    }

    if (
      line.startsWith("---") ||
      line.startsWith("+++") ||
      line.startsWith("index ") ||
      line.startsWith("new file") ||
      line.startsWith("deleted file") ||
      line.startsWith("similarity") ||
      line.startsWith("rename ")
    ) {
      flushDeletions();
      rows.push({ kind: 'file-header', left: line, right: line });
      continue;
    }

    if (line.startsWith("@@")) {
      flushDeletions();
      // Parse hunk header to extract starting line numbers
      const hunkMatch = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
      if (hunkMatch) {
        leftLineNum = parseInt(hunkMatch[1], 10) - 1;
        rightLineNum = parseInt(hunkMatch[2], 10) - 1;
      }
      rows.push({ kind: 'hunk-header', left: line, right: line });
      continue;
    }

    if (line.startsWith("-")) {
      // Accumulate deletions
      pendingDeletions.push(line.slice(1));
      continue;
    }

    if (line.startsWith("+")) {
      const addContent = line.slice(1);
      if (pendingDeletions.length > 0) {
        // Pair with a pending deletion
        const delContent = pendingDeletions.shift()!;
        leftLineNum++;
        rightLineNum++;
        rows.push({
          kind: 'paired',
          left: delContent,
          right: addContent,
          leftLineNum,
          rightLineNum,
        });
      } else {
        rightLineNum++;
        rows.push({
          kind: 'addition',
          left: '',
          right: addContent,
          rightLineNum,
        });
      }
      continue;
    }

    // Context line (starts with " " or is empty)
    flushDeletions();
    const contextContent = line.startsWith(" ") ? line.slice(1) : line;
    if (line === "" || line === " " || line.startsWith(" ")) {
      leftLineNum++;
      rightLineNum++;
      rows.push({
        kind: 'context',
        left: contextContent,
        right: contextContent,
        leftLineNum,
        rightLineNum,
      });
    }
  }

  flushDeletions();
  return rows;
}

interface DiffSideRowProps {
  side: 'left' | 'right';
  row: DiffRow;
}

function DiffSideRow({ side, row }: DiffSideRowProps) {
  const content = side === 'left' ? row.left : row.right;
  const lineNum = side === 'left' ? row.leftLineNum : row.rightLineNum;

  const isEmpty = content === '';

  const isFileMeta = row.kind === 'file-header';
  const isHunk = row.kind === 'hunk-header';
  const isDeletion =
    (row.kind === 'deletion' || row.kind === 'paired') && side === 'left';
  const isAddition =
    (row.kind === 'addition' || row.kind === 'paired') && side === 'right';

  return (
    <div
      className={cn(
        "flex min-h-[20px] items-start font-mono text-[11px] leading-5 whitespace-pre",
        isHunk && "bg-blue-400/5 text-blue-400/80 text-xs",
        isFileMeta && "bg-muted/40 text-muted-foreground text-[10px]",
        isDeletion && !isEmpty && "bg-red-500/10 text-red-500",
        isAddition && !isEmpty && "bg-green-500/10 text-green-500",
        isEmpty && !isFileMeta && !isHunk && "bg-muted/5",
      )}
    >
      {/* Line number gutter */}
      {!isFileMeta && !isHunk && (
        <span className="w-8 shrink-0 select-none pr-2 text-right text-[10px] text-muted-foreground/30">
          {lineNum ?? ''}
        </span>
      )}
      <span className="flex-1 overflow-hidden px-1">{content || ' '}</span>
    </div>
  );
}

export function SideBySideDiff({ diffContent }: SideBySideDiffProps) {
  const rows = parseSideBySide(diffContent);
  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const isSyncing = useRef(false);

  const syncLeft = useCallback(() => {
    if (isSyncing.current) return;
    isSyncing.current = true;
    if (rightRef.current && leftRef.current) {
      rightRef.current.scrollTop = leftRef.current.scrollTop;
    }
    isSyncing.current = false;
  }, []);

  const syncRight = useCallback(() => {
    if (isSyncing.current) return;
    isSyncing.current = true;
    if (leftRef.current && rightRef.current) {
      leftRef.current.scrollTop = rightRef.current.scrollTop;
    }
    isSyncing.current = false;
  }, []);

  return (
    <div className="flex max-h-[300px] min-h-0 overflow-hidden">
      {/* Left column */}
      <div
        ref={leftRef}
        className="flex-1 overflow-auto border-r border-border/40"
        onScroll={syncLeft}
      >
        {rows.map((row, i) => (
          // eslint-disable-next-line react/no-array-index-key
          <DiffSideRow key={i} side="left" row={row} />
        ))}
      </div>
      {/* Right column */}
      <div
        ref={rightRef}
        className="flex-1 overflow-auto"
        onScroll={syncRight}
      >
        {rows.map((row, i) => (
          // eslint-disable-next-line react/no-array-index-key
          <DiffSideRow key={i} side="right" row={row} />
        ))}
      </div>
    </div>
  );
}
