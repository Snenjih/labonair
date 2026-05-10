import { cn } from "@/lib/utils";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef } from "react";
import type { FileNode } from "../types";

interface VirtualizedFileListProps {
  files: FileNode[];
  selectedPaths: Set<string>;
  onSelect: (path: string, multiSelect: boolean) => void;
  onDoubleClick: (file: FileNode) => void;
  isLoading?: boolean;
  draggable?: boolean;
  onDragStart?: (paths: string[]) => void;
  onDrop?: (targetPath: string, paths: string[]) => void;
}

export function VirtualizedFileList({
  files,
  selectedPaths,
  onSelect,
  onDoubleClick,
  isLoading = false,
}: VirtualizedFileListProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: files.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 28,
    overscan: 10,
  });

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      {/* Sticky column header */}
      <div className="flex items-center h-7 px-2 border-b border-border bg-card shrink-0 select-none">
        <span className="w-5 shrink-0" />
        <span className="flex-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest truncate pl-1">
          Name
        </span>
        <span className="w-24 text-right text-[10px] font-semibold text-muted-foreground uppercase tracking-widest pr-1">
          Size
        </span>
        <span className="w-32 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
          Modified
        </span>
        <span className="w-28 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
          Perms
        </span>
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
                  style={{ width: `${40 + Math.random() * 40}%` }}
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
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                  onClick={(e) => onSelect(file.path, e.metaKey || e.ctrlKey)}
                  onDoubleClick={() => onDoubleClick(file)}
                />
              );
            })}
          </div>
        )}
      </div>
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
}

function FileRow({ file, isSelected, isEven, style, onClick, onDoubleClick }: FileRowProps) {
  const icon = file.is_symlink ? "🔗" : file.is_dir ? "📁" : "📄";

  return (
    <div
      style={style}
      className={cn(
        "h-7 flex items-center px-2 gap-1 cursor-default select-none transition-colors duration-75",
        isEven && !isSelected && "bg-muted/10",
        isSelected
          ? "bg-primary/20 ring-1 ring-inset ring-primary/40"
          : "hover:bg-accent/20",
      )}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
    >
      <span className="w-5 shrink-0 text-[13px] leading-none">{icon}</span>
      <span
        className={cn(
          "flex-1 text-sm truncate min-w-0",
          file.is_symlink && "italic text-muted-foreground",
          file.is_dir && "font-medium",
        )}
      >
        {file.name}
      </span>
      <span className="w-24 text-right text-xs text-muted-foreground tabular-nums pr-1 shrink-0">
        {file.is_dir ? "" : formatBytes(file.size)}
      </span>
      <span className="w-32 text-xs text-muted-foreground tabular-nums shrink-0">
        {formatRelativeTime(file.modified_at)}
      </span>
      <span className="w-28 text-[11px] font-mono text-muted-foreground/60 shrink-0 truncate">
        {file.permissions || "—"}
      </span>
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
