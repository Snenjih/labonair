import { cn } from "@/lib/utils";
import { motion } from "motion/react";
import type { Group } from "../types";

interface GroupCardProps {
  group: Group;
  isSelected: boolean;
  onClick: () => void;
  hostCount: number;
}

export function GroupCard({ group, isSelected, onClick, hostCount }: GroupCardProps) {
  return (
    <motion.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm transition-all shrink-0",
        isSelected
          ? "ring-2 ring-primary border-primary/40 bg-accent/30"
          : "hover:bg-accent/20 hover:border-border",
      )}
    >
      <span className="text-base leading-none">{group.icon ?? "📁"}</span>
      <span className="font-medium text-foreground">{group.name}</span>
      <span className="ml-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
        {hostCount}
      </span>
    </motion.button>
  );
}
