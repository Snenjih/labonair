import { AnimatePresence } from "motion/react";
import { AgentRunBridge, AiMiniWindow, SelectionAskAi, useChatStore } from "@/modules/ai";
import type { AiDiffStatus } from "@/modules/tabs";

export interface AiOverlaysProps {
  aiEnabled: boolean;
  hasComposer: boolean;
  askPopup: { x: number; y: number } | null;
  onAskFromSelection: () => void;
  onDismissAskPopup: () => void;
  openAiDiffTab: (input: {
    path: string;
    originalContent: string;
    proposedContent: string;
    approvalId: string;
    isNewFile: boolean;
  }) => number | null;
  setAiDiffStatus: (approvalId: string, status: AiDiffStatus) => void;
}

export function AiOverlays({
  aiEnabled,
  hasComposer,
  askPopup,
  onAskFromSelection,
  onDismissAskPopup,
  openAiDiffTab,
  setAiDiffStatus,
}: AiOverlaysProps) {
  const miniOpen = useChatStore((s) => s.mini.open);

  return (
    <>
      {aiEnabled && hasComposer ? (
        <AgentRunBridge openAiDiffTab={openAiDiffTab} setAiDiffStatus={setAiDiffStatus} />
      ) : null}

      <AnimatePresence>
        {aiEnabled && miniOpen && hasComposer ? <AiMiniWindow key="ai-mini" /> : null}
        {aiEnabled && askPopup ? (
          <SelectionAskAi
            key="ask-ai-popup"
            x={askPopup.x}
            y={askPopup.y}
            onAsk={onAskFromSelection}
            onDismiss={onDismissAskPopup}
          />
        ) : null}
      </AnimatePresence>
    </>
  );
}
