import type { UIMessage } from "@ai-sdk/react";

export type CompactionResult = {
  messages: UIMessage[];
  compacted: boolean;
  droppedCount: number;
};

const KEEP_TAIL = 24;
const ELISION_TEXT = "[elided to save context — see prior tool call in history]";

// Estimate size in bytes for token calculation (1 token ≈ 4 chars).
function estimateBytes(messages: UIMessage[]): number {
  let bytes = 0;
  for (const m of messages) {
    for (const p of m.parts) {
      if (p.type === "text" || p.type === "reasoning") {
        bytes += (p as { text?: string }).text?.length ?? 0;
      } else if (typeof p.type === "string" && p.type.startsWith("tool-")) {
        const tp = p as unknown as { input?: unknown; output?: unknown };
        if (tp.input) bytes += JSON.stringify(tp.input).length;
        if (tp.output) bytes += JSON.stringify(tp.output).length;
      }
    }
  }
  return bytes;
}

// Collect all file paths that were mutated by write/edit tools.
function collectMutationPaths(messages: UIMessage[]): Set<string> {
  const paths = new Set<string>();
  for (const m of messages) {
    for (const p of m.parts) {
      if (
        typeof p.type === "string" &&
        (p.type === "tool-write_file" || p.type === "tool-edit" || p.type === "tool-multi_edit")
      ) {
        const tp = p as unknown as { input?: { path?: string } };
        if (tp.input?.path) paths.add(tp.input.path);
      }
    }
  }
  return paths;
}

// For each path that was read, track the last message index at which it was read.
function collectLastReadIdxPerPath(messages: UIMessage[]): Map<string, number> {
  const lastRead = new Map<string, number>();
  messages.forEach((m, idx) => {
    for (const p of m.parts) {
      if (typeof p.type === "string" && p.type === "tool-read_file") {
        const tp = p as unknown as { input?: { path?: string } };
        if (tp.input?.path) lastRead.set(tp.input.path, idx);
      }
    }
  });
  return lastRead;
}

// Phase 1: elide superseded read_file outputs (file mutated or re-read later).
function dropSupersededReads(
  messages: UIMessage[],
  mutatedPaths: Set<string>,
  lastReadIdx: Map<string, number>,
): { messages: UIMessage[]; dropped: number } {
  let dropped = 0;
  const result = messages.map((m, idx) => {
    const newParts = m.parts.map((p) => {
      if (typeof p.type !== "string" || p.type !== "tool-read_file") return p;
      const tp = p as unknown as {
        input?: { path?: string };
        output?: { content?: string };
        state?: string;
      };
      if (tp.state !== "output-available") return p;
      if (tp.output?.content === ELISION_TEXT) return p; // already elided
      const path = tp.input?.path;
      if (!path) return p;
      // Elide if: file was mutated OR this is not the last read of this path.
      const isSuperseded = mutatedPaths.has(path) || lastReadIdx.get(path) !== idx;
      if (!isSuperseded) return p;
      dropped++;
      return { ...p, output: { content: ELISION_TEXT } } as typeof p;
    });
    return { ...m, parts: newParts as UIMessage["parts"] };
  });
  return { messages: result, dropped };
}

// Phase 2: elide old tool-result outputs from oldest messages (keep tail).
function elideOldToolResults(
  messages: UIMessage[],
  contextLimit: number,
): { messages: UIMessage[]; dropped: number } {
  let dropped = 0;
  const tail = messages.slice(messages.length - KEEP_TAIL);
  const head = messages.slice(0, messages.length - KEEP_TAIL);

  let bytes = estimateBytes(messages);
  const result = head.map((m) => {
    if (bytes < contextLimit * 0.6 * 4) return m; // 0.6 * limit * 4 chars/token
    const newParts = m.parts.map((p) => {
      if (typeof p.type !== "string" || !p.type.startsWith("tool-")) return p;
      const tp = p as unknown as { output?: { content?: string }; state?: string };
      if (tp.state !== "output-available") return p;
      if (tp.output?.content === ELISION_TEXT) return p;
      const saved = tp.output ? JSON.stringify(tp.output).length : 0;
      bytes -= saved;
      dropped++;
      return { ...p, output: { content: ELISION_TEXT } } as typeof p;
    });
    return { ...m, parts: newParts as UIMessage["parts"] };
  });

  return { messages: [...result, ...tail], dropped };
}

export function compact(messages: UIMessage[], contextLimit: number): CompactionResult {
  if (messages.length === 0) return { messages, compacted: false, droppedCount: 0 };

  const bytes = estimateBytes(messages);
  const usedTokens = Math.ceil(bytes / 4);
  const fraction = usedTokens / contextLimit;

  if (fraction < 0.55) return { messages, compacted: false, droppedCount: 0 };

  let current = messages;
  let totalDropped = 0;

  // Phase 1: elide superseded reads (≥55%)
  const mutatedPaths = collectMutationPaths(current);
  const lastReadIdx = collectLastReadIdxPerPath(current);
  const phase1 = dropSupersededReads(current, mutatedPaths, lastReadIdx);
  current = phase1.messages;
  totalDropped += phase1.dropped;

  // Phase 2: elide old tool results if still ≥70%
  const bytesAfterPhase1 = estimateBytes(current);
  const fractionAfterPhase1 = Math.ceil(bytesAfterPhase1 / 4) / contextLimit;
  if (fractionAfterPhase1 >= 0.7 && current.length > KEEP_TAIL) {
    const phase2 = elideOldToolResults(current, contextLimit);
    current = phase2.messages;
    totalDropped += phase2.dropped;
  }

  return {
    messages: current,
    compacted: totalDropped > 0,
    droppedCount: totalDropped,
  };
}
