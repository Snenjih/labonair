import {
  ArrowRight01Icon,
  Cancel01Icon,
  CloudServerIcon,
  Folder01Icon,
  TerminalIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { BookmarkActionKind } from "../lib/resolveBookmarkAction";
import type { PathBookmark } from "../store/pathBookmarksStore";

const ACTION_ICON: Record<BookmarkActionKind, typeof TerminalIcon> = {
  "new-terminal": TerminalIcon,
  "current-terminal": ArrowRight01Icon,
  "current-sftp": Folder01Icon,
  "new-sftp": CloudServerIcon,
};

const ACTION_LABEL: Record<BookmarkActionKind, string> = {
  "new-terminal": "Open in new terminal",
  "current-terminal": "Open in current terminal",
  "current-sftp": "Open in current SFTP manager",
  "new-sftp": "Open in new SFTP tab",
};

type Props = {
  bookmark: PathBookmark;
  hostLabel?: string;
  orphaned: boolean;
  primaryAction: BookmarkActionKind;
  secondaryActions: BookmarkActionKind[];
  /** Roving-focus column index (0 = path/primary action, 1..N = icons),
   *  or null when this row isn't the keyboard-focused one. */
  focusedColumn: number | null;
  onExecute: (action: BookmarkActionKind) => void;
  onRemove: () => void;
};

export function BookmarkRow({
  bookmark,
  hostLabel,
  orphaned,
  primaryAction,
  secondaryActions,
  focusedColumn,
  onExecute,
  onRemove,
}: Props) {
  const label = bookmark.label ?? bookmark.path;
  return (
    <div
      className={cn(
        "group flex items-center gap-1 rounded-md px-1.5 py-1 text-xs",
        focusedColumn !== null ? "bg-accent" : "hover:bg-accent/60",
      )}
    >
      <button
        type="button"
        disabled={orphaned}
        onClick={() => onExecute(primaryAction)}
        title={ACTION_LABEL[primaryAction]}
        className={cn(
          "flex min-w-0 flex-1 flex-col items-start rounded px-1 py-0.5 text-left",
          focusedColumn === 0 && "ring-1 ring-ring",
          orphaned && "cursor-not-allowed opacity-50",
        )}
      >
        <span className="truncate font-medium text-foreground">{label}</span>
        <span className="flex w-full items-center gap-1 truncate font-mono text-[10px] text-muted-foreground">
          {bookmark.path}
          {orphaned && <span className="shrink-0 text-warning">· host removed</span>}
          {!orphaned && hostLabel && <span className="shrink-0 text-muted-foreground/70">· {hostLabel}</span>}
        </span>
      </button>

      {!orphaned &&
        secondaryActions.map((action, i) => {
          const col = i + 1;
          return (
            <Button
              key={action}
              variant="ghost"
              size="icon-xs"
              title={ACTION_LABEL[action]}
              onClick={() => onExecute(action)}
              className={cn(
                "shrink-0 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground",
                focusedColumn === col && "ring-1 ring-ring",
              )}
            >
              <HugeiconsIcon icon={ACTION_ICON[action]} size={12} />
            </Button>
          );
        })}

      <Button
        variant="ghost"
        size="icon-xs"
        title="Remove bookmark"
        onClick={onRemove}
        className="shrink-0 rounded-md text-muted-foreground opacity-0 hover:bg-accent hover:text-destructive group-hover:opacity-100"
      >
        <HugeiconsIcon icon={Cancel01Icon} size={12} />
      </Button>
    </div>
  );
}
