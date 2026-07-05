import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { getSlotForLeaf, isLeafAltScreen } from "../lib/rendererPool";
import { getBlockState, subscribeBlocks, type BlockRecord } from "../lib/terminalSessionRegistry";
import { BlockChrome } from "./BlockChrome";

/** Renders a small metadata pill (BlockChrome) for every finished block in a
 *  session, anchored to its start row via xterm's decoration API (auto-
 *  repositions on scroll/resize, auto-disposes when the marker's row is
 *  eventually trimmed from scrollback — no manual pixel math needed).
 *  Non-visual otherwise: doesn't own layout, just portals into elements
 *  xterm hands back, so it can be mounted anywhere near the pane it
 *  corresponds to (see WorkspacePane.tsx). */
export function BlockOverlay({ sessionId }: { sessionId: string }) {
  const blocksEnabled = usePreferencesStore((s) => s.terminalBlocksEnabled);
  const autoCollapseOnAltScreen = usePreferencesStore((s) => s.terminalBlocksAutoCollapseOnAltScreen);

  const state = useSyncExternalStore(
    (cb) => subscribeBlocks(sessionId, cb),
    () => getBlockState(sessionId),
    () => null,
  );

  const [altScreen, setAltScreen] = useState(false);
  useEffect(() => {
    if (!blocksEnabled) return;
    const term = getSlotForLeaf(sessionId)?.term;
    if (!term) return;
    const check = () => setAltScreen(isLeafAltScreen(sessionId));
    check();
    const disposable = term.onRender(check);
    return () => disposable.dispose();
  }, [sessionId, blocksEnabled]);

  if (!blocksEnabled || !state) return null;
  if (autoCollapseOnAltScreen && altScreen) return null;

  const finished = state.blocks.filter(
    (b) => b.startMarker && !b.startMarker.isDisposed && b.finishedAt !== null,
  );

  return (
    <>
      {finished.map((b) => (
        <BlockDecorationPortal key={b.id} sessionId={sessionId} block={b} />
      ))}
    </>
  );
}

function BlockDecorationPortal({ sessionId, block }: { sessionId: string; block: BlockRecord }) {
  const [el, setEl] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const term = getSlotForLeaf(sessionId)?.term;
    if (!term || !block.startMarker || block.startMarker.isDisposed) return;
    // Right-anchored, small — overlays only the tail of the echoed command
    // line instead of covering real terminal content (see BlockChrome).
    const decoration = term.registerDecoration({
      marker: block.startMarker,
      anchor: "right",
      width: 14,
      height: 1,
    });
    if (!decoration) return;
    const onRender = decoration.onRender((element) => {
      element.style.pointerEvents = "none";
      element.classList.add("group");
      setEl(element);
    });
    return () => {
      onRender.dispose();
      decoration.dispose();
      setEl(null);
    };
  }, [sessionId, block.id, block.startMarker]);

  if (!el) return null;
  return createPortal(<BlockChrome block={block} />, el);
}
