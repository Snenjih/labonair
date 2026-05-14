import { cn } from "@/lib/utils";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useRef, useState } from "react";
import type { FileNode } from "../types";

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

interface VirtualizedFileListProps {
  files: FileNode[];
  selectedPaths: Set<string>;
  onSelect: (path: string, multiSelect: boolean) => void;
  onDoubleClick: (file: FileNode) => void;
  isLoading?: boolean;
  draggable?: boolean;
  onDragStart?: (paths: string[]) => void;
  onDrop?: (targetPath: string, paths: string[]) => void;
  renamingPath?: string | null;
  renameValue?: string;
  onRenameChange?: (v: string) => void;
  onRenameCommit?: () => void;
  onRenameCancel?: () => void;
}

export function VirtualizedFileList({
  files,
  selectedPaths,
  onSelect,
  onDoubleClick,
  isLoading = false,
  draggable,
  onDragStart,
  onDrop,
  renamingPath,
  renameValue,
  onRenameChange,
  onRenameCommit,
  onRenameCancel,
}: VirtualizedFileListProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [colWidths, setColWidths] = useState<ColWidths>(DEFAULT_COL_WIDTHS);

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

  const startResize = useCallback((col: keyof ColWidths, e: React.MouseEvent) => {
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
  }, [colWidths]);

  function handleDragOver(e: React.DragEvent) {
    if (!onDrop) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setIsDragOver(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragOver(false);
    if (!onDrop) return;
    try {
      const paths = JSON.parse(e.dataTransfer.getData("text/plain")) as string[];
      const targetEl = (e.target as HTMLElement).closest("[data-file-path]");
      const targetPath = targetEl?.getAttribute("data-file-path") ?? "";
      onDrop(targetPath, paths);
    } catch {
      // ignore malformed drag data
    }
  }

  const visibleCols = { showSize, showModified, showPermissions, showType };

  return (
    <div
      className={cn(
        "flex flex-col h-full min-h-0 overflow-hidden relative",
        isDragOver && "ring-2 ring-inset ring-primary/40"
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDragOver && (
        <div className="absolute inset-0 bg-primary/10 z-10 pointer-events-none rounded-sm" />
      )}

      {/* Sticky column header */}
      <div className="flex items-center h-7 px-2 border-b border-border bg-card shrink-0 select-none overflow-hidden">
        <span className="w-5 shrink-0" />
        <span className="flex-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest truncate pl-1 min-w-0">
          Name
        </span>
        {showSize && (
          <ResizableHeaderCell
            label="Size"
            width={colWidths.size}
            onResizeStart={(e) => startResize("size", e)}
            align="right"
          />
        )}
        {showType && (
          <ResizableHeaderCell
            label="Type"
            width={colWidths.type}
            onResizeStart={(e) => startResize("type", e)}
          />
        )}
        {showModified && (
          <ResizableHeaderCell
            label="Modified"
            width={colWidths.modified}
            onResizeStart={(e) => startResize("modified", e)}
          />
        )}
        {showPermissions && (
          <ResizableHeaderCell
            label="Perms"
            width={colWidths.permissions}
            onResizeStart={(e) => startResize("permissions", e)}
          />
        )}
      </div>

      {/* Scrollable virtual list */}
      <div ref={parentRef} className="flex-1 min-h-0 overflow-auto">
        {isLoading ? (
          <div>
            {Array.from({ length: 10 }).map((_, i) => (
              <div
                key={i}
                className="h-7 flex items-center px-2 gap-2 animate-pulse"
              >
                <div className="w-4 h-3 rounded bg-muted/20" />
                <div
                  className="h-3 rounded bg-muted/20"
                  style={{ width: `${40 + (i * 7) % 40}%` }}
                />
              </div>
            ))}
          </div>
        ) : files.length === 0 ? (
          <div className="flex items-center justify-center h-24 text-muted-foreground text-sm select-none">
            Empty directory
          </div>
        ) : (
          <div
            style={{ height: `${virtualizer.getTotalSize()}px`, position: "relative" }}
          >
            {virtualizer.getVirtualItems().map((virtualRow) => {
              const file = files[virtualRow.index];
              const isSelected = selectedPaths.has(file.path);
              const isEven = virtualRow.index % 2 === 0;

              return (
                <FileRow
                  key={virtualRow.key}
                  file={file}
                  isSelected={isSelected}
                  isEven={isEven}
                  draggable={draggable && file.name !== ".."}
                  onDragStart={onDragStart ? (paths) => onDragStart(paths) : undefined}
                  selectedPaths={selectedPaths}
                  colWidths={colWidths}
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
      </div>
    </div>
  );
}

interface ResizableHeaderCellProps {
  label: string;
  width: number;
  onResizeStart: (e: React.MouseEvent) => void;
  align?: "left" | "right";
}

function ResizableHeaderCell({ label, width, onResizeStart, align = "left" }: ResizableHeaderCellProps) {
  return (
    <div
      className="relative shrink-0 flex items-center"
      style={{ width }}
    >
      <span
        className={cn(
          "w-full text-[10px] font-semibold text-muted-foreground uppercase tracking-widest truncate",
          align === "right" && "text-right pr-1",
        )}
      >
        {label}
      </span>
      {/* Drag handle */}
      <div
        className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-primary/40 transition-colors"
        onMouseDown={onResizeStart}
      />
    </div>
  );
}

interface FileRowProps {
  file: FileNode;
  isSelected: boolean;
  isEven: boolean;
  style: React.CSSProperties;
  onClick: (e: React.MouseEvent) => void;
  onDoubleClick: () => void;
  draggable?: boolean;
  onDragStart?: (paths: string[]) => void;
  selectedPaths?: Set<string>;
  colWidths: ColWidths;
  visibleCols: { showSize: boolean; showModified: boolean; showPermissions: boolean; showType: boolean };
  isRenaming?: boolean;
  renameValue?: string;
  onRenameChange?: (v: string) => void;
  onRenameCommit?: () => void;
  onRenameCancel?: () => void;
}

function FileRow({
  file,
  isSelected,
  isEven,
  style,
  onClick,
  onDoubleClick,
  draggable,
  onDragStart,
  selectedPaths,
  colWidths,
  visibleCols,
  isRenaming,
  renameValue,
  onRenameChange,
  onRenameCommit,
  onRenameCancel,
}: FileRowProps) {
  const isUpEntry = file.name === "..";
  const icon = isUpEntry ? "📁" : file.is_symlink ? "🔗" : file.is_dir ? "📁" : "📄";
  const fileExt = !file.is_dir && !file.is_symlink && !isUpEntry
    ? (file.name.includes(".") ? file.name.split(".").pop()?.toLowerCase() ?? "—" : "—")
    : "—";

  function handleDragStart(e: React.DragEvent) {
    const paths = selectedPaths && selectedPaths.size > 0
      ? [...selectedPaths]
      : [file.path];
    e.dataTransfer.setData("text/plain", JSON.stringify(paths));
    e.dataTransfer.effectAllowed = "copy";
    onDragStart?.(paths);
  }

  return (
    <div
      style={style}
      data-file-path={file.path}
      draggable={draggable}
      onDragStart={draggable ? handleDragStart : undefined}
      className={cn(
        "h-7 flex items-center px-2 gap-1 cursor-default select-none transition-colors duration-75 overflow-hidden",
        isEven && !isSelected && "bg-muted/10",
        isSelected
          ? "bg-primary/20 ring-1 ring-inset ring-primary/40"
          : "hover:bg-accent/20",
        draggable && !isUpEntry && "cursor-grab active:cursor-grabbing",
        isUpEntry && "opacity-60",
        !isUpEntry && !isSelected && file.name.startsWith(".") && "opacity-50",
      )}
      onClick={isRenaming ? undefined : onClick}
      onDoubleClick={isRenaming ? undefined : onDoubleClick}
    >
      <span className="w-5 shrink-0 text-[13px] leading-none">{icon}</span>
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
      {visibleCols.showSize && (
        <span
          className="text-right text-xs text-muted-foreground tabular-nums pr-1 shrink-0"
          style={{ width: colWidths.size }}
        >
          {!isUpEntry && !file.is_dir ? formatBytes(file.size) : ""}
        </span>
      )}
      {visibleCols.showType && (
        <span
          className="text-xs text-muted-foreground/70 tabular-nums shrink-0 truncate"
          style={{ width: colWidths.type }}
        >
          {fileExt}
        </span>
      )}
      {visibleCols.showModified && (
        <span
          className="text-xs text-muted-foreground tabular-nums shrink-0"
          style={{ width: colWidths.modified }}
        >
          {!isUpEntry ? formatRelativeTime(file.modified_at) : ""}
        </span>
      )}
      {visibleCols.showPermissions && (
        <span
          className="text-[11px] font-mono text-muted-foreground/60 shrink-0 truncate"
          style={{ width: colWidths.permissions }}
        >
          {!isUpEntry ? (file.permissions || "—") : ""}
        </span>
      )}
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
