import { LockPasswordIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { motion } from "motion/react";
import { useEffect, useRef } from "react";

type Props = {
  x: number;
  y: number;
  onFill: () => void;
  onDismiss: () => void;
};

const W = 130;
const OFFSET = 36;
const AUTO_DISMISS_MS = 8000;

export function SudoFillPopup({ x, y, onFill, onDismiss }: Props) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    };
    document.addEventListener("keydown", onKey);
    timerRef.current = setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [onDismiss]);

  const top = Math.max(8, y - OFFSET);
  const left = Math.max(8, Math.min(x - W / 2, window.innerWidth - W - 8));

  return (
    <motion.div
      initial={{ opacity: 0, y: 4, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 4, scale: 0.95 }}
      transition={{ duration: 0.12, ease: "easeOut" }}
      style={{ top, left, width: W }}
      className="fixed z-50"
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (timerRef.current) clearTimeout(timerRef.current);
          onFill();
        }}
        className="flex h-7 w-full items-center gap-1.5 rounded-md border border-border/60 bg-card/95 px-2 text-xs shadow-lg backdrop-blur-md hover:border-border hover:bg-accent"
      >
        <HugeiconsIcon icon={LockPasswordIcon} size={12} className="shrink-0 text-muted-foreground" />
        <span>Fill sudo</span>
      </button>
    </motion.div>
  );
}
