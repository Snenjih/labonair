import { useEffect, useRef, useState } from "react";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { getSlotForLeaf, isLeafAltScreen } from "../lib/rendererPool";
import { getBlockEngine, isBlocksBakedIn, subscribeBlocks } from "../lib/terminalSessionRegistry";
import { BlockChrome, StickyHeader } from "./BlockChrome";
import type { VisibleBlocks } from "./lib/blockDecorations";

const EMPTY: VisibleBlocks = { blocks: [], sticky: null };

// Cheap string signature of the geometry that actually matters for a
// re-render — avoids a React re-render on every rAF-driven recompute tick
// (scroll/typing fire far more often than a block's rounded pixel position
// actually changes).
function signature(v: VisibleBlocks): string {
  let s = v.sticky?.id ?? "";
  for (const b of v.blocks) s += `|${b.id}:${Math.round(b.top)}:${Math.round(b.bottom)}:${b.running}`;
  return s;
}

/** Floating header/divider chrome for a session's finished blocks, positioned
 *  by pixel math against the live `.xterm-screen` element (see
 *  blockDecorations.ts's `visibleBlocks`) rather than an xterm decoration —
 *  a decoration-based pill was the previous (broken) approach: it painted
 *  over real output because it could only anchor to a fixed buffer row, not
 *  redraw into the blank rows the shell script now reserves for a header.
 *
 *  Gates on `isBlocksBakedIn`, a per-session flag fixed at spawn time — NOT
 *  the live `terminalBlocksEnabled` preference. The shell's PS1 rewrite is
 *  baked into its env at spawn and can't be un-baked mid-session, so this
 *  session keeps showing chrome for its own lifetime regardless of a later
 *  settings toggle (which only affects newly-opened terminals — see the
 *  toast in TerminalSection.tsx). Gating on the live preference instead would
 *  desync the two: disabling the setting would unmount this overlay while
 *  the shell keeps blanking its own prompt, leaving a bare, cursor-less-
 *  looking prompt line with nothing compensating for it. */
export function BlockOverlay({ sessionId }: { sessionId: string }) {
  const blocksBakedIn = isBlocksBakedIn(sessionId);
  const autoCollapseOnAltScreen = usePreferencesStore((s) => s.terminalBlocksAutoCollapseOnAltScreen);

  const containerRef = useRef<HTMLDivElement>(null);
  const lastSig = useRef("");
  const [vis, setVis] = useState<VisibleBlocks>(EMPTY);
  const [altScreen, setAltScreen] = useState(false);

  useEffect(() => {
    if (!blocksBakedIn) return;

    const update = () => {
      const engine = getBlockEngine(sessionId);
      const container = containerRef.current;
      const screen = getSlotForLeaf(sessionId)?.term.element?.querySelector<HTMLElement>(".xterm-screen");
      if (!engine || !container || !screen) {
        if (lastSig.current !== "") {
          lastSig.current = "";
          setVis(EMPTY);
        }
        return;
      }
      // Offset against this overlay's own mount node rather than xterm's
      // `.xterm` root — correct regardless of any wrapper padding between
      // the two, since `top: …` styles below are relative to this container.
      const offset = screen.getBoundingClientRect().top - container.getBoundingClientRect().top;
      const next = engine.visibleBlocks(offset);
      const sig = signature(next);
      if (sig === lastSig.current) return;
      lastSig.current = sig;
      setVis(next);
    };

    update();
    return subscribeBlocks(sessionId, update);
  }, [sessionId, blocksBakedIn]);

  useEffect(() => {
    if (!blocksBakedIn) return;
    const term = getSlotForLeaf(sessionId)?.term;
    if (!term) return;
    const check = () => setAltScreen(isLeafAltScreen(sessionId));
    check();
    const disposable = term.onRender(check);
    return () => disposable.dispose();
  }, [sessionId, blocksBakedIn]);

  if (!blocksBakedIn) return null;
  const collapsed = autoCollapseOnAltScreen && altScreen;

  return (
    <div ref={containerRef} className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
      {!collapsed && vis.blocks.map((b) => <BlockChrome key={b.id} sessionId={sessionId} block={b} />)}
      {!collapsed && vis.sticky && <StickyHeader sessionId={sessionId} block={vis.sticky} />}
    </div>
  );
}
