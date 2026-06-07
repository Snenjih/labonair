import { useChatStore } from "@/modules/ai/store/chatStore";
import type { SearchAddon } from "@xterm/addon-search";
import type { Terminal } from "@xterm/xterm";
import { useEffect, useRef, useState } from "react";
import { BlockChrome } from "./BlockChrome";
import { BlockSearchBar } from "./BlockSearchBar";
import { StickyHeader } from "./StickyHeader";
import type { BlockDecorations } from "./lib/blockDecorations";
import type {
  BlockChromeSettings,
  BlockMeta,
  BlockMode,
  VisibleBlocks,
} from "./lib/types";

interface BlockOverlayProps {
  term: Terminal | null;
  containerRef: React.RefObject<HTMLDivElement | null>;
  decorations: BlockDecorations | null;
  mode: BlockMode;
  sessionId: string;
  settings: BlockChromeSettings & { autoCollapseOnAltScreen: boolean };
  searchAddon: SearchAddon | null;
}

const EMPTY_VISIBLE: VisibleBlocks = { blocks: [], sticky: null };

function visibleSignature(v: VisibleBlocks): string {
  let s = v.sticky?.id ?? "";
  for (const b of v.blocks) {
    s += `|${b.id}:${Math.round(b.top)}:${Math.round(b.bottom)}`;
  }
  return s;
}

export function BlockOverlay({
  containerRef,
  decorations,
  mode,
  settings,
  searchAddon,
}: BlockOverlayProps) {
  // Hide in alt-screen mode (e.g. vim, less) if configured
  if (mode === "alt" && settings.autoCollapseOnAltScreen) {
    return <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden" />;
  }

  return (
    <BlockOverlayInner
      containerRef={containerRef}
      decorations={decorations}
      settings={settings}
      searchAddon={searchAddon}
    />
  );
}

// Separate inner component so the early-return above doesn't violate hooks rules
function BlockOverlayInner({
  containerRef,
  decorations,
  settings,
  searchAddon,
}: {
  containerRef: React.RefObject<HTMLDivElement | null>;
  decorations: BlockDecorations | null;
  settings: BlockChromeSettings;
  searchAddon: SearchAddon | null;
}) {
  const [visibleBlocks, setVisibleBlocks] = useState<VisibleBlocks>(EMPTY_VISIBLE);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [searchTarget, setSearchTarget] = useState<BlockMeta | null>(null);

  const lastSig = useRef("");
  const rafRef = useRef<number | null>(null);

  // Subscribe to decoration changes and drive a RAF loop for viewport sync
  useEffect(() => {
    if (!decorations) return;

    const update = () => {
      const container = containerRef.current;
      if (!container) return;
      const next = decorations.visibleBlocks(container);
      const sig = visibleSignature(next);
      if (sig !== lastSig.current) {
        lastSig.current = sig;
        setVisibleBlocks(next);
      }
    };

    const scheduleRaf = () => {
      if (rafRef.current !== null) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        update();
      });
    };

    // Initial read
    update();

    const unsubscribe = decorations.subscribe(scheduleRaf);

    return () => {
      unsubscribe();
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [decorations, containerRef]);

  const handleCopyCommand = (command: string) => {
    navigator.clipboard.writeText(command).catch(() => {});
  };

  const handleCopyOutput = (block: BlockMeta) => {
    if (!decorations) return;
    const output = decorations.readBlock(block);
    navigator.clipboard.writeText(output).catch(() => {});
  };

  const handleAttachToAi = (block: BlockMeta) => {
    if (!decorations) return;
    const output = decorations.readBlock(block);
    const text = output
      ? `$ ${block.command}\n${output}`
      : `$ ${block.command}`;
    useChatStore.getState().attachSelection(text, "terminal");
  };

  return (
    <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
      {/* Per-block chrome */}
      {visibleBlocks.blocks.map((block) => (
        <BlockChrome
          key={block.id}
          block={block}
          isHovered={hoveredId === block.id}
          onHover={setHoveredId}
          onCopyCommand={() => handleCopyCommand(block.command)}
          onCopyOutput={() => handleCopyOutput(block)}
          onSearch={() => setSearchTarget(block)}
          onAttachToAi={() => handleAttachToAi(block)}
          settings={settings}
        />
      ))}

      {/* Sticky header for the block scrolled out of view */}
      <StickyHeader block={visibleBlocks.sticky} />

      {/* In-block search bar */}
      {searchTarget !== null && (
        <BlockSearchBar
          searchAddon={searchAddon}
          startLine={searchTarget.startLine}
          endLine={searchTarget.endLine}
          onClose={() => setSearchTarget(null)}
        />
      )}
    </div>
  );
}
