import { AnimatePresence, motion } from "motion/react";
import { Cancel01Icon, Clock01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useChatStore } from "../store/chatStore";

type Props = { sessionId: string | null };

export function QueueStrip({ sessionId }: Props) {
  const queue = useChatStore((s) =>
    sessionId ? (s.queues[sessionId] ?? []) : [],
  );
  const cancelQueuedMessage = useChatStore((s) => s.cancelQueuedMessage);

  if (!sessionId || queue.length === 0) return null;

  return (
    <div className="shrink-0 border-t border-border/80 bg-muted/20 px-3 py-1.5">
      <div className="mb-1 flex items-center gap-1.5">
        <HugeiconsIcon
          icon={Clock01Icon}
          size={11}
          strokeWidth={1.75}
          className="text-muted-foreground"
        />
        <span className="text-[11px] font-medium text-foreground">Queued</span>
        <span className="text-[11px] text-muted-foreground">
          · sends when AI finishes
        </span>
      </div>
      <ul className="flex flex-col gap-0.5">
        <AnimatePresence initial={false}>
          {queue.map((item, index) => (
            <motion.li
              key={item.id}
              layout
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.1 }}
              className="group flex items-center gap-2 rounded px-1.5 py-0.5"
            >
              <span className="w-3 shrink-0 text-[10px] tabular-nums text-muted-foreground/50">
                {index + 1}
              </span>
              <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
                {item.text}
              </span>
              <span className="hidden shrink-0 text-[10px] text-muted-foreground/50 group-hover:block">
                {index === 0 ? "next" : `after ${index}`}
              </span>
              <button
                type="button"
                onClick={() => cancelQueuedMessage(sessionId, item.id)}
                className="shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
                aria-label="Cancel queued message"
              >
                <HugeiconsIcon icon={Cancel01Icon} size={11} strokeWidth={2} />
              </button>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </div>
  );
}
