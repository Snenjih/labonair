import { useRef, useMemo } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
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
        isHunk && "bg-info/5 text-info/80 text-xs",
        isFileMeta && "bg-muted/40 text-muted-foreground text-[10px]",
        isDeletion && !isEmpty && "bg-error/10 text-error",
        isAddition && !isEmpty && "bg-success/10 text-success",
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
  const rows = useMemo(() => parseSideBySide(diffContent), [diffContent]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 20,
    overscan: 15,
  });

  return (
    <div ref={scrollRef} className="max-h-[300px] overflow-auto">
      <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const row = rows[virtualItem.index];
          return (
            <div
              key={virtualItem.key}
              style={{ position: 'absolute', top: virtualItem.start, width: '100%' }}
              className="flex"
            >
              <div className="min-w-0 flex-1 overflow-hidden border-r border-border/40">
                <DiffSideRow side="left" row={row} />
              </div>
              <div className="min-w-0 flex-1 overflow-hidden">
                <DiffSideRow side="right" row={row} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
