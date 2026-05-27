import { cn } from "@/lib/utils";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import type { Group } from "../types";

interface GroupCardProps {
  group: Group;
  isSelected: boolean;
  onClick: () => void;
  hostCount: number;
  onDelete: () => void;
  onRename: (newName: string) => void;
}

export function GroupCard({ group, isSelected, onClick, hostCount, onDelete, onRename }: GroupCardProps) {
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(group.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isRenaming) {
      setRenameValue(group.name);
      setTimeout(() => inputRef.current?.select(), 0);
    }
  }, [isRenaming, group.name]);

  function commitRename() {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== group.name) {
      onRename(trimmed);
    }
    setIsRenaming(false);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") commitRename();
    if (e.key === "Escape") setIsRenaming(false);
    e.stopPropagation();
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <motion.button
          whileHover={{ scale: isRenaming ? 1 : 1.02 }}
          whileTap={{ scale: isRenaming ? 1 : 0.98 }}
          onClick={isRenaming ? undefined : onClick}
          className={cn(
            "flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm transition-all shrink-0",
            isSelected
              ? "ring-2 ring-primary border-primary/40 bg-accent/30"
              : "hover:bg-accent/60 hover:border-border",
          )}
        >
          {group.icon ? (
            <span className="text-base leading-none">{group.icon}</span>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
            </svg>
          )}
          {isRenaming ? (
            <input
              ref={inputRef}
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={commitRename}
              onClick={(e) => e.stopPropagation()}
              className="w-24 bg-transparent text-sm font-medium text-foreground outline-none"
            />
          ) : (
            <span className="font-medium text-foreground">{group.name}</span>
          )}
          <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            {hostCount}
          </span>
        </motion.button>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={() => setIsRenaming(true)}>Rename</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive" onSelect={onDelete}>Delete</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
