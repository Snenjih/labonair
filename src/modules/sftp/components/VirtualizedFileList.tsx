import { cn } from "@/lib/utils";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useRef, useState } from "react";
import {
  Folder01Icon,
  File01Icon,
  Link01Icon,
  ArrowDown01Icon,
  ArrowUp01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { FileNode } from "../types";
import { blurActiveInput } from "../utils";

const DRAG_THRESHOLD_PX = 6;

type ColKey = "size" | "type" | "modified" | "permissions";

interface ColWidths {
  size: number;
  modified: number;
  permissions: number;
  type: number;
}

const DEFAULT_COL_WIDTHS: ColWidths = {
  size: 96,
  modified: 128,
  permissions: 112,
  type: 72,
};

// Name is always pinned first; these are the reorderable columns.
const DEFAULT_COL_ORDER: ColKey[] = ["size", "type", "modified", "permissions"];

const COLUMN_DEFS: Record<ColKey, { label: string; align?: "left" | "right" }> = {
  size: { label: "Size", align: "right" },
  type: { label: "Type" },
  modified: { label: "Modified" },
  permissions: { label: "Perms" },
};

const COLUMN_CELL_CLASS: Record<ColKey, string> = {
  size: "text-right text-xs text-muted-foreground tabular-nums pr-1 shrink-0",
  type: "text-xs text-muted-foreground/70 tabular-nums shrink-0 truncate",
  modified: "text-xs text-muted-foreground tabular-nums shrink-0",
  permissions: "text-[11px] font-mono text-muted-foreground/60 shrink-0 truncate",
};

function columnCellValue(key: ColKey, file: FileNode, isUpEntry: boolean, fileExt: string): string {
  switch (key) {
    case "size":
      return !isUpEntry && !file.is_dir ? formatBytes(file.size) : "";
    case "type":
      return fileExt;
    case "modified":
      return !isUpEntry ? formatRelativeTime(file.modified_at) : "";
    case "permissions":
      return !isUpEntry ? file.permissions || "—" : "";
  }
}

interface VirtualizedFileListProps {
  files: FileNode[];
  selectedPaths: Set<string>;
  onSelect: (path: string, multiSelect: boolean) => void;
  onDoubleClick: (file: FileNode) => void;
  isLoading?: boolean;
  /** Called when a marquee drag selects a set of files */
  onMarqueeSelect?: (paths: string[], additive: boolean) => void;
  /** When set, rows are pointer-draggable; fires onDragStart with the dragged paths */
  draggable?: boolean;
  onDragStart?: (paths: string[]) => void;
  /** When set, this pane is the valid drop target — show a directional drop overlay */
  dropDirection?: "upload" | "download";
  /** Whether the pointer is currently hovering over this pane during a drag */
  isDropHovered?: boolean;
  renamingPath?: string | null;
  renameValue?: string;
  onRenameChange?: (v: string) => void;
  onRenameCommit?: () => void;
  onRenameCancel?: () => void;
  /** When set, shows a "Load more…" row below the list (remote/paginated
   *  listings only — local directories are always loaded in full). */
  hasMore?: boolean;
  onLoadMore?: () => void;
}

interface MarqueeRect {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  containerTop: number;
  containerLeft: number;
  containerRight: number;
  additive: boolean;
}

export function VirtualizedFileList({
  files,
  selectedPaths,
  onSelect,
  onDoubleClick,
  isLoading = false,
  onMarqueeSelect,
  draggable,
  onDragStart,
  dropDirection,
  isDropHovered,
  renamingPath,
  renameValue,
  onRenameChange,
  onRenameCommit,
  onRenameCancel,
  hasMore,
  onLoadMore,
}: VirtualizedFileListProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const [colWidths, setColWidths] = useState<ColWidths>(DEFAULT_COL_WIDTHS);
  const [colOrder, setColOrder] = useState<ColKey[]>(DEFAULT_COL_ORDER);
  const [marquee, setMarquee] = useState<MarqueeRect | null>(null);
  const [hoveredKey, setHoveredKey] = useState<React.Key | null>(null);

  const reorderColumns = useCallback((from: ColKey, to: ColKey) => {
    setColOrder((prev) => {
      const next = prev.filter((k) => k !== from);
      next.splice(next.indexOf(to), 0, from);
      return next;
    });
  }, []);

  const showSize = usePreferencesStore((s) => s.sftpColumnSize);
  const showModified = usePreferencesStore((s) => s.sftpColumnModified);
  const showPermissions = usePreferencesStore((s) => s.sftpColumnPermissions);
  const showType = usePreferencesStore((s) => s.sftpColumnType);

  const virtualizer = useVirtualizer({
    count: files.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 28,
    overscan: 10,
  });

  // Column resize dragging
  const resizingCol = useRef<keyof ColWidths | null>(null);
  const resizeStartX = useRef(0);
  const resizeStartWidth = useRef(0);

  const startResize = useCallback(
    (col: keyof ColWidths, e: React.MouseEvent) => {
      e.preventDefault();
      resizingCol.current = col;
      resizeStartX.current = e.clientX;
      resizeStartWidth.current = colWidths[col];

      function onMouseMove(ev: MouseEvent) {
        if (!resizingCol.current) return;
        const delta = ev.clientX - resizeStartX.current;
        const newWidth = Math.max(60, resizeStartWidth.current + delta);
        setColWidths((prev) => ({ ...prev, [resizingCol.current!]: newWidth }));
      }

      function onMouseUp() {
        resizingCol.current = null;
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
      }

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [colWidths],
  );

  // Marquee selection: track highlighted paths during drag for live feedback
  const [marqueeHighlight, setMarqueeHighlight] = useState<Set<string>>(new Set());

  function computeMarqueeHits(rect: MarqueeRect): string[] {
    if (!parentRef.current) return [];
    const scrollTop = parentRef.current.scrollTop;

    const top = Math.min(rect.startY, rect.currentY) - rect.containerTop + scrollTop;
    const bottom = Math.max(rect.startY, rect.currentY) - rect.containerTop + scrollTop;

    return virtualizer
      .getVirtualItems()
      .filter((vr) => {
        const file = files[vr.index];
        if (!file || file.name === "..") return false;
        return vr.start < bottom && vr.start + vr.size > top;
      })
      .map((vr) => files[vr.index].path);
  }

  function handleScrollAreaPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    // Only start marquee on left-click on empty space (not on a file row)
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest("[data-file-path]")) return;
    if (!onMarqueeSelect) return;

    const container = parentRef.current;
    if (!container) return;
    const cr = container.getBoundingClientRect();

    blurActiveInput();

    const rect: MarqueeRect = {
      startX: e.clientX,
      startY: e.clientY,
      currentX: e.clientX,
      currentY: e.clientY,
      containerTop: cr.top,
      containerLeft: cr.left,
      containerRight: cr.right,
      additive: e.shiftKey || e.metaKey || e.ctrlKey,
    };

    e.preventDefault();
    let didDrag = false;

    function onMove(ev: PointerEvent) {
      const dist = Math.hypot(ev.clientX - rect.startX, ev.clientY - rect.startY);
      if (dist > DRAG_THRESHOLD_PX) didDrag = true;
      if (!didDrag) return;
      const next: MarqueeRect = { ...rect, currentX: ev.clientX, currentY: ev.clientY };
      const hits = computeMarqueeHits(next);
      setMarqueeHighlight(new Set(hits));
      setMarquee(next);
    }

    function onUp() {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      if (!didDrag) {
        // Plain click on empty space — clear selection
        if (!rect.additive) onMarqueeSelect?.([], false);
        setMarquee(null);
        setMarqueeHighlight(new Set());
        return;
      }
      setMarquee((prev) => {
        if (!prev) return null;
        const hits = computeMarqueeHits({ ...prev });
        onMarqueeSelect?.(hits, prev.additive);
        setMarqueeHighlight(new Set());
        return null;
      });
    }

    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  }

  const visibleCols: Record<ColKey, boolean> = {
    size: showSize,
    type: showType,
    modified: showModified,
    permissions: showPermissions,
  };
  const showOverlay = !!dropDirection;

  return (
    <div
      className={cn(
        "flex flex-col h-full min-h-0 overflow-hidden relative",
        showOverlay && isDropHovered && "ring-2 ring-inset ring-primary/60",
      )}
    >
      {showOverlay && (
        <div
          className={cn(
            "absolute inset-0 z-20 pointer-events-none flex flex-col items-center justify-center gap-3 rounded-sm transition-opacity duration-150",
            isDropHovered ? "opacity-100" : "opacity-50",
          )}
        >
          <div
            className={cn(
              "absolute inset-0 rounded-sm transition-colors duration-150",
              isDropHovered ? (dropDirection === "upload" ? "bg-info/15" : "bg-success/15") : "bg-primary/5",
            )}
          />
          <div
            className={cn(
              "relative flex flex-col items-center gap-2 px-6 py-4 rounded-xl bg-card border shadow-lg transition-all duration-150",
              isDropHovered
                ? dropDirection === "upload"
                  ? "bg-background/90 border-info/50 scale-105"
                  : "bg-background/90 border-success/50 scale-105"
                : "bg-background/60 border-primary/20 scale-100",
            )}
          >
            <HugeiconsIcon
              icon={dropDirection === "upload" ? ArrowUp01Icon : ArrowDown01Icon}
              size={28}
              className={cn(dropDirection === "upload" ? "text-info" : "text-success")}
            />
            <span
              className={cn(
                "text-sm font-semibold",
                dropDirection === "upload" ? "text-info" : "text-success",
              )}
            >
              {dropDirection === "upload" ? "Upload here" : "Download here"}
            </span>
          </div>
        </div>
      )}

      {/* Sticky column header */}
      <div className="flex items-center h-7 px-2 border-b border-border bg-card shrink-0 select-none overflow-hidden">
        <span className="w-5 shrink-0" />
        <span className="flex-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest truncate pl-1 min-w-0">
          Name
        </span>
        {colOrder
          .filter((key) => visibleCols[key])
          .map((key) => (
            <ResizableHeaderCell
              key={key}
              colKey={key}
              label={COLUMN_DEFS[key].label}
              width={colWidths[key]}
              align={COLUMN_DEFS[key].align}
              onResizeStart={(e) => startResize(key, e)}
              onReorder={reorderColumns}
            />
          ))}
      </div>

      {/* Marquee selection overlay (fixed over the list) */}
      {marquee &&
        (() => {
          const top = Math.min(marquee.startY, marquee.currentY);
          const left = marquee.containerLeft;
          const width = marquee.containerRight - marquee.containerLeft;
          const height = Math.abs(marquee.currentY - marquee.startY);
          return (
            <div
              className="pointer-events-none fixed z-30 border border-primary/60 bg-primary/10"
              style={{ top, left, width, height }}
            />
          );
        })()}

      {/* Scrollable virtual list */}
      <div
        ref={parentRef}
        className="flex-1 min-h-0 overflow-auto"
        onPointerDown={handleScrollAreaPointerDown}
      >
        {isLoading ? (
          <div>
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="h-7 flex items-center px-2 gap-2 animate-pulse">
                <div className="w-4 h-3 rounded bg-muted/20" />
                <div className="h-3 rounded bg-muted/20" style={{ width: `${40 + ((i * 7) % 40)}%` }} />
              </div>
            ))}
          </div>
        ) : files.length === 0 ? (
          <div className="flex items-center justify-center h-24 text-muted-foreground text-sm select-none">
            Empty directory
          </div>
        ) : (
          <div style={{ height: `${virtualizer.getTotalSize()}px`, position: "relative" }}>
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const file = files[virtualRow.index];
              const isSelected = selectedPaths.has(file.path) || marqueeHighlight.has(file.path);
              const isEven = virtualRow.index % 2 === 0;

              return (
                <FileRow
                  key={virtualRow.key}
                  rowKey={virtualRow.key}
                  file={file}
                  isSelected={isSelected}
                  isHovered={hoveredKey === virtualRow.key}
                  onHoverChange={(k) => setHoveredKey(k)}
                  isEven={isEven}
                  draggable={draggable && file.name !== ".."}
                  onDragStart={onDragStart ? (paths) => onDragStart(paths) : undefined}
                  selectedPaths={selectedPaths}
                  colWidths={colWidths}
                  colOrder={colOrder}
                  visibleCols={visibleCols}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                  onClick={(e) => {
                    if (file.name !== "..") onSelect(file.path, e.metaKey || e.ctrlKey);
                  }}
                  onDoubleClick={() => onDoubleClick(file)}
                  isRenaming={renamingPath === file.path}
                  renameValue={renameValue ?? ""}
                  onRenameChange={onRenameChange}
                  onRenameCommit={onRenameCommit}
                  onRenameCancel={onRenameCancel}
                />
              );
            })}
          </div>
        )}
        {hasMore && !isLoading && (
          <button
            type="button"
            onClick={onLoadMore}
            className="flex h-7 w-full shrink-0 items-center px-2 text-[11px] text-primary hover:underline"
          >
            Load more…
          </button>
        )}
      </div>
    </div>
  );
}

interface ResizableHeaderCellProps {
  colKey: ColKey;
  label: string;
  width: number;
  onResizeStart: (e: React.MouseEvent) => void;
  onReorder: (from: ColKey, to: ColKey) => void;
  align?: "left" | "right";
}

function ResizableHeaderCell({
  colKey,
  label,
  width,
  onResizeStart,
  onReorder,
  align = "left",
}: ResizableHeaderCellProps) {
  const [dragging, setDragging] = useState(false);

  function handleLabelPointerDown(e: React.PointerEvent) {
    if (e.button !== 0) return;
    const startX = e.clientX;
    const startY = e.clientY;
    let didDrag = false;

    function onMove(ev: PointerEvent) {
      if (didDrag) return;
      const dist = Math.hypot(ev.clientX - startX, ev.clientY - startY);
      if (dist > DRAG_THRESHOLD_PX) {
        didDrag = true;
        setDragging(true);
      }
    }
    function onUp(ev: PointerEvent) {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      setDragging(false);
      if (!didDrag) return;
      const targetEl = document
        .elementFromPoint(ev.clientX, ev.clientY)
        ?.closest("[data-col]") as HTMLElement | null;
      const targetKey = targetEl?.dataset.col as ColKey | undefined;
      if (targetKey && targetKey !== colKey) onReorder(colKey, targetKey);
    }
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  }

  return (
    <div className="relative shrink-0 flex items-center" style={{ width }} data-col={colKey}>
      <span
        className={cn(
          "w-full text-[10px] font-semibold text-muted-foreground uppercase tracking-widest truncate cursor-grab select-none",
          align === "right" && "text-right pr-1",
          dragging && "opacity-50",
        )}
        onPointerDown={handleLabelPointerDown}
      >
        {label}
      </span>
      {/* Resize handle */}
      <div
        className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-primary/40 transition-colors"
        onMouseDown={onResizeStart}
      />
    </div>
  );
}

interface FileRowProps {
  rowKey: React.Key;
  file: FileNode;
  isSelected: boolean;
  isHovered: boolean;
  onHoverChange: (key: React.Key | null) => void;
  isEven: boolean;
  style: React.CSSProperties;
  onClick: (e: React.MouseEvent) => void;
  onDoubleClick: () => void;
  draggable?: boolean;
  onDragStart?: (paths: string[]) => void;
  selectedPaths?: Set<string>;
  colWidths: ColWidths;
  colOrder: ColKey[];
  visibleCols: Record<ColKey, boolean>;
  isRenaming?: boolean;
  renameValue?: string;
  onRenameChange?: (v: string) => void;
  onRenameCommit?: () => void;
  onRenameCancel?: () => void;
}

function FileRow({
  rowKey,
  file,
  isSelected,
  isHovered,
  onHoverChange,
  isEven,
  style,
  onClick,
  onDoubleClick,
  draggable,
  onDragStart,
  selectedPaths,
  colWidths,
  colOrder,
  visibleCols,
  isRenaming,
  renameValue,
  onRenameChange,
  onRenameCommit,
  onRenameCancel,
}: FileRowProps) {
  const isUpEntry = file.name === "..";
  const getIcon = () => {
    if (isUpEntry || file.is_dir) return <HugeiconsIcon icon={Folder01Icon} size={16} />;
    if (file.is_symlink) return <HugeiconsIcon icon={Link01Icon} size={16} />;
    return <HugeiconsIcon icon={File01Icon} size={16} />;
  };
  const fileExt =
    !file.is_dir && !file.is_symlink && !isUpEntry
      ? file.name.includes(".")
        ? (file.name.split(".").pop()?.toLowerCase() ?? "—")
        : "—"
      : "—";

  function handlePointerDown(e: React.PointerEvent) {
    if (!draggable || !onDragStart || isUpEntry || e.button !== 0) return;
    const fireDragStart = onDragStart;
    const startX = e.clientX;
    const startY = e.clientY;
    const paths = selectedPaths && selectedPaths.size > 0 ? [...selectedPaths] : [file.path];
    let dragging = false;

    function onMove(ev: PointerEvent) {
      if (dragging) return;
      const dist = Math.hypot(ev.clientX - startX, ev.clientY - startY);
      if (dist > DRAG_THRESHOLD_PX) {
        dragging = true;
        cleanup();
        fireDragStart(paths);
      }
    }
    function onUp() {
      cleanup();
    }
    function cleanup() {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
    }
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  }

  return (
    <div
      style={style}
      data-file-path={file.path}
      className={cn(
        "h-7 flex items-center px-2 gap-1 cursor-default select-none overflow-hidden",
        isEven && !isSelected && !isHovered && "bg-muted/10",
        isSelected ? "bg-primary/20 ring-1 ring-inset ring-primary/40" : isHovered && "bg-accent/20",
        draggable && !isUpEntry && "cursor-grab",
        isUpEntry && "opacity-60",
        !isUpEntry && !isSelected && file.name.startsWith(".") && "opacity-50",
      )}
      onPointerEnter={() => onHoverChange(rowKey)}
      onPointerLeave={() => onHoverChange(null)}
      onPointerDown={draggable && !isUpEntry ? handlePointerDown : undefined}
      onClick={isRenaming ? undefined : onClick}
      onDoubleClick={isRenaming ? undefined : onDoubleClick}
    >
      <span className="w-5 flex items-center justify-center shrink-0 leading-none text-muted-foreground">
        {getIcon()}
      </span>
      {isRenaming ? (
        <input
          autoFocus
          value={renameValue}
          onChange={(e) => onRenameChange?.(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onRenameCommit?.();
            if (e.key === "Escape") onRenameCancel?.();
          }}
          onBlur={onRenameCancel}
          className="flex-1 h-5 text-sm bg-background border border-primary/60 rounded px-1 outline-none text-foreground"
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span
          className={cn(
            "flex-1 text-sm truncate min-w-0",
            file.is_symlink && !isUpEntry && "italic text-muted-foreground",
            (file.is_dir || isUpEntry) && "font-medium",
          )}
        >
          {file.name}
        </span>
      )}
      {colOrder
        .filter((key) => visibleCols[key])
        .map((key) => (
          <span key={key} className={COLUMN_CELL_CLASS[key]} style={{ width: colWidths[key] }}>
            {columnCellValue(key, file, isUpEntry, fileExt)}
          </span>
        ))}
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatRelativeTime(unixSecs: number): string {
  if (!unixSecs) return "—";
  const diff = Date.now() / 1000 - unixSecs;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(unixSecs * 1000).toLocaleDateString();
}
