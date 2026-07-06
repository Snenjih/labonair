import { useEffect, useState } from "react";
import appIcon from "@/assets/app-icon.png";
import { getSlotForLeaf } from "../lib/rendererPool";
import { getBlockEngine, isBlocksBakedIn, subscribeBlocks } from "../lib/terminalSessionRegistry";

/** Welcome/tips panel shown only for a block-mode session that hasn't run a
 *  single command yet — `engine.hasAnyBlock()` is exactly that signal (no
 *  entries, nothing live). Hides itself the instant the user types anything
 *  (via xterm's `onData`, which fires on real keystrokes, not PTY echo) so it
 *  never lingers over a prompt the user is actively using, even before their
 *  first command has finished (or started) generating a block. Gates on
 *  `isBlocksBakedIn` itself (same rationale as `BlockOverlay`) so callers
 *  don't need to know about it. */
export function BlockEmptyState({ sessionId }: { sessionId: string }) {
  const blocksBakedIn = isBlocksBakedIn(sessionId);
  const [empty, setEmpty] = useState(() => !(getBlockEngine(sessionId)?.hasAnyBlock() ?? false));

  useEffect(() => {
    if (!blocksBakedIn || !empty) return;
    const update = () => setEmpty(!(getBlockEngine(sessionId)?.hasAnyBlock() ?? false));
    update();
    const unsubscribeBlocks = subscribeBlocks(sessionId, update);
    const dataDisposable = getSlotForLeaf(sessionId)?.term.onData(() => setEmpty(false));
    return () => {
      unsubscribeBlocks();
      dataDisposable?.dispose();
    };
  }, [sessionId, blocksBakedIn, empty]);

  if (!blocksBakedIn || !empty) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 px-8 text-center">
      <img src={appIcon} alt="" className="size-14 rounded-2xl opacity-90" />
      <div className="space-y-1.5">
        <h3 className="text-sm font-medium text-foreground/80">Ready when you are</h3>
        <p className="max-w-xs text-xs text-muted-foreground">
          Run a command to get started — it becomes its own block once it finishes.
        </p>
      </div>
    </div>
  );
}
