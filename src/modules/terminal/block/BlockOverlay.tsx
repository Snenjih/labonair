import { useChatStore } from "@/modules/ai/store/chatStore";
import type { SearchAddon } from "@xterm/addon-search";
import type { Terminal } from "@xterm/xterm";
import { useEffect, useRef, useState } from "react";
import { BlockChrome } from "./BlockChrome";
import { BlockSearchBar } from "./BlockSearchBar";
import { BlockWatermark } from "./BlockWatermark";
import { StickyHeader } from "./StickyHeader";
import { capAttachOutput } from "./lib/outputCap";
import type { BlockDecorations } from "./lib/blockDecorations";
import type {
  BlockChromeSettings,
  BlockMeta,
  BlockMode,
  VisibleBlocks,
} from "./lib/types";

interface BlockOverlayProps {
  // Callback-based data access
  subscribe: (cb: () => void) => () => void;
  getVisible: () => VisibleBlocks;
  readOutput: (block: BlockMeta) => string;
  promptReady: boolean;
  onRunAgain: (command: string) => void;
  onRestoreFocus: () => void;
  // Passthrough for BlockSearchBar
  term: Terminal | null;
  decorations: BlockDecorations | null;
  mode: BlockMode;
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
  subscribe,
  getVisible,
  readOutput,
  promptReady,
  onRunAgain,
  onRestoreFocus,
  term,
  decorations,
  mode,
  settings,
  searchAddon,
}: BlockOverlayProps) {
  if (mode === "alt" && settings.autoCollapseOnAltScreen) {
    return <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden" />;
  }

  return (
    <BlockOverlayInner
      subscribe={subscribe}
      getVisible={getVisible}
      readOutput={readOutput}
      promptReady={promptReady}
      onRunAgain={onRunAgain}
      onRestoreFocus={onRestoreFocus}
      term={term}
      decorations={decorations}
      settings={settings}
      searchAddon={searchAddon}
    />
  );
}

function BlockOverlayInner({
  subscribe,
  getVisible,
  readOutput,
  promptReady,
  onRunAgain,
  term,
  decorations,
  settings,
  searchAddon,
}: {
  subscribe: (cb: () => void) => () => void;
  getVisible: () => VisibleBlocks;
  readOutput: (block: BlockMeta) => string;
  promptReady: boolean;
  onRunAgain: (command: string) => void;
  onRestoreFocus: () => void;
  term: Terminal | null;
  decorations: BlockDecorations | null;
  settings: BlockChromeSettings;
  searchAddon: SearchAddon | null;
}) {
  const [visibleBlocks, setVisibleBlocks] = useState<VisibleBlocks>(EMPTY_VISIBLE);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchTarget, setSearchTarget] = useState<BlockMeta | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const lastSig = useRef("");
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const update = () => {
      const next = getVisible();
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

    update();
    const unsubscribe = subscribe(scheduleRaf);

    return () => {
      unsubscribe();
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [subscribe, getVisible]);

  const handleCopyCommand = (command: string) => {
    navigator.clipboard.writeText(command).catch(() => {});
  };

  const handleCopyOutput = (block: BlockMeta) => {
    const output = readOutput(block);
    navigator.clipboard.writeText(output).catch(() => {});
  };

  const handleAttachToAi = (block: BlockMeta) => {
    const output = capAttachOutput(readOutput(block));
    const text = output
      ? `$ ${block.command}\n${output}`
      : `$ ${block.command}`;
    useChatStore.getState().attachSelection(text, "terminal");
  };

  const handleRerun = (block: BlockMeta) => {
    if (!block.command) return;
    onRunAgain(block.command);
  };

  return (
    <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
      <BlockWatermark visible={promptReady && visibleBlocks.blocks.length === 0} />

      {visibleBlocks.blocks.map((block) => (
        <BlockChrome
          key={block.id}
          block={block}
          isHovered={hoveredId === block.id}
          isSelected={selectedId === block.id}
          onHover={setHoveredId}
          onSelect={setSelectedId}
          onCopyCommand={() => handleCopyCommand(block.command)}
          onCopyOutput={() => handleCopyOutput(block)}
          onSearch={() => setSearchTarget(block)}
          onAttachToAi={() => handleAttachToAi(block)}
          onRerun={() => handleRerun(block)}
          settings={settings}
        />
      ))}

      <StickyHeader block={visibleBlocks.sticky} />

      {searchTarget !== null && (
        <BlockSearchBar
          block={searchTarget}
          decorations={decorations}
          term={term}
          searchAddon={searchAddon}
          onClose={() => setSearchTarget(null)}
          initialQuery={searchQuery}
          onQueryChange={setSearchQuery}
        />
      )}
    </div>
  );
}
