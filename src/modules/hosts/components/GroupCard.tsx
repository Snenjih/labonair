import { cn } from "@/lib/utils";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { motion } from "motion/react";
import { useState } from "react";
import type { Group } from "../types";

interface GroupCardProps {
  group: Group;
  isSelected: boolean;
  onClick: () => void;
  hostCount: number;
  onDelete: () => void;
  onRename: (newName: string) => void;
}

const iconSvg = (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="text-muted-foreground"
  >
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
  </svg>
);

export function GroupCard({ group, isSelected, onClick, hostCount, onDelete, onRename }: GroupCardProps) {
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(group.name);

  function commitRename() {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== group.name) onRename(trimmed);
    setIsRenaming(false);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      commitRename();
    }
    if (e.key === "Escape") setIsRenaming(false);
    e.stopPropagation();
  }

  const cardClass = cn(
    "flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm transition-all shrink-0",
    isSelected
      ? "ring-2 ring-primary border-primary/40 bg-accent/30"
      : "hover:bg-accent/60 hover:border-border",
  );

  const badge = (
    <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
      {hostCount}
    </span>
  );

  // When renaming: replace the button+contextmenu with a plain div so Radix
  // cannot return focus to the trigger and accidentally fire onBlur on the input.
  if (isRenaming) {
    return (
      <div className={cn(cardClass, "ring-2 ring-primary border-primary/40")}>
        {group.icon ? <span className="text-base leading-none">{group.icon}</span> : iconSvg}
        <input
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={commitRename}
          onFocus={(e) => e.target.select()}
          className="w-24 bg-transparent text-sm font-medium text-foreground outline-none"
        />
        {badge}
      </div>
    );
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={onClick}
          className={cardClass}
        >
          {group.icon ? <span className="text-base leading-none">{group.icon}</span> : iconSvg}
          <span className="font-medium text-foreground">{group.name}</span>
          {badge}
        </motion.button>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem
          onSelect={() => {
            setRenameValue(group.name);
            setIsRenaming(true);
          }}
        >
          Rename
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive" onSelect={onDelete}>
          Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
