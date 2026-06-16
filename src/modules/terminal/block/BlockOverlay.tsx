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
  settings: BlockChromeSettings & { autoCollapseOnAltScreen: boolean };
  searchAddon: SearchAddon | null;
  // Fix 8: callback to write a command directly into the PTY
  onInjectCommand?: (command: string) => void;
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
  term,
  containerRef,
  decorations,
  mode,
  settings,
  searchAddon,
  onInjectCommand,
}: BlockOverlayProps) {
  if (mode === "alt" && settings.autoCollapseOnAltScreen) {
    return <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden" />;
  }

  return (
    <BlockOverlayInner
      term={term}
      containerRef={containerRef}
      decorations={decorations}
      settings={settings}
      searchAddon={searchAddon}
      onInjectCommand={onInjectCommand}
    />
  );
}

function BlockOverlayInner({
  term,
  containerRef,
  decorations,
  settings,
  searchAddon,
  onInjectCommand,
}: {
  term: Terminal | null;
  containerRef: React.RefObject<HTMLDivElement | null>;
  decorations: BlockDecorations | null;
  settings: BlockChromeSettings;
  searchAddon: SearchAddon | null;
  onInjectCommand?: (command: string) => void;
}) {
  const [visibleBlocks, setVisibleBlocks] = useState<VisibleBlocks>(EMPTY_VISIBLE);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const [searchTarget, setSearchTarget] = useState<BlockMeta | null>(null);
  // Fix 10: preserve search query across open/close cycles
  const [searchQuery, setSearchQuery] = useState("");

  const lastSig = useRef("");
  const rafRef = useRef<number | null>(null);

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

  // Fix 8: write directly to PTY instead of via AI chat store
  const handleRerun = (block: BlockMeta) => {
    if (!block.command || !onInjectCommand) return;
    onInjectCommand(block.command + "\n");
  };

  const handleToggleCollapse = (id: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
      {visibleBlocks.blocks.map((block) => (
        <BlockChrome
          key={block.id}
          block={block}
          isHovered={hoveredId === block.id}
          isSelected={selectedId === block.id}
          isCollapsed={collapsedIds.has(block.id)}
          onHover={setHoveredId}
          onSelect={setSelectedId}
          onToggleCollapse={handleToggleCollapse}
          onCopyCommand={() => handleCopyCommand(block.command)}
          onCopyOutput={() => handleCopyOutput(block)}
          onSearch={() => setSearchTarget(block)}
          onAttachToAi={() => handleAttachToAi(block)}
          // Fix 8: only pass onRerun if the PTY callback is available
          onRerun={onInjectCommand ? () => handleRerun(block) : undefined}
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
