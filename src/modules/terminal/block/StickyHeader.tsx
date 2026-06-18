import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "motion/react";
import type { PositionedBlock } from "./lib/types";

interface StickyHeaderProps {
  block: PositionedBlock | null;
}

function shortCwd(cwd: string): string {
  const parts = cwd.split("/").filter(Boolean);
  if (parts.length <= 2) return cwd;
  return `…/${parts.slice(-2).join("/")}`;
}

export function StickyHeader({ block }: StickyHeaderProps) {
  return (
    <AnimatePresence>
      {block !== null && (
        <motion.div
          key={block.id}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.15, ease: "easeOut" }}
          className={cn(
            "pointer-events-none absolute left-0 right-0 top-0 z-20",
            "flex h-6 items-center gap-2 px-2",
            "bg-background/80 backdrop-blur-sm border-b border-border",
          )}
        >
          {block.cwd && (
            <span className="shrink-0 font-mono text-xs text-muted-foreground">
              {shortCwd(block.cwd)}
            </span>
          )}
          <span className="min-w-0 flex-1 truncate font-mono text-xs text-foreground/70">
            {block.command || "running…"}
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
