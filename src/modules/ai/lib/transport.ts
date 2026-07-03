import type { UIMessage } from "@ai-sdk/react";
import { DirectChatTransport } from "ai";
import {
  getModelContextLimit,
  modelKeepsReasoning,
  TERMINAL_BUFFER_LINES,
  type ModelId,
  type ProviderInstance,
} from "../config";
import { createLabonairAgent, type AgentUsageDelta } from "./agent";
import { compact } from "./compact";
import type { ProviderKeys } from "./keyring";
import { parseModelRef } from "./modelRef";
import { native } from "./native";
import type { ToolContext } from "../tools/tools";

const LABONAIR_MD_MAX_BYTES = 32 * 1024;
type MemoryCacheEntry = { content: string | null; mtime: number };
const projectMemoryCache = new Map<string, MemoryCacheEntry>();

async function readLabonairMd(workspaceRoot: string | null): Promise<string | null> {
  if (!workspaceRoot) return null;
  const path = `${workspaceRoot.replace(/\/$/, "")}/LABONAIR.md`;
  const cached = projectMemoryCache.get(workspaceRoot);
  // Cache for 30s — cheap re-read after that to pick up edits.
  if (cached && Date.now() - cached.mtime < 30_000) return cached.content;
  try {
    const r = await native.readFile(path);
    if (r.kind !== "text") {
      projectMemoryCache.set(workspaceRoot, { content: null, mtime: Date.now() });
      return null;
    }
    const content =
      r.content.length > LABONAIR_MD_MAX_BYTES ? r.content.slice(0, LABONAIR_MD_MAX_BYTES) : r.content;
    projectMemoryCache.set(workspaceRoot, { content, mtime: Date.now() });
    return content;
  } catch {
    projectMemoryCache.set(workspaceRoot, { content: null, mtime: Date.now() });
    return null;
  }
}

type LiveSnapshot = {
  cwd: string | null;
  terminal: string | null;
  workspaceRoot: string | null;
  activeFile: string | null;
};

const MAX_TERMINAL_CHARS = 12_000;

type Deps = {
  getKeys: () => ProviderKeys;
  getInstances?: () => ProviderInstance[];
  getInstanceKeys?: () => Record<string, string | null>;
  toolContext: ToolContext;
  getModelId: () => ModelId | string;
  getCustomInstructions: () => string;
  getAgentPersona: () => { name: string; instructions: string } | null;
  getLive: () => LiveSnapshot;
  getLmstudioBaseURL?: () => string | undefined;
  getLmstudioChatModelId?: () => string | undefined;
  getOpenaiCompatibleBaseURL?: () => string | undefined;
  getOpenaiCompatibleModelId?: () => string | undefined;
  getMlxBaseURL?: () => string | undefined;
  getMlxChatModelId?: () => string | undefined;
  getOllamaBaseURL?: () => string | undefined;
  getOllamaChatModelId?: () => string | undefined;
  onStep?: (step: string | null) => void;
  onUsage?: (delta: AgentUsageDelta) => void;
  onFinishMeta?: (info: { hitStepCap: boolean; finishReason: string }) => void;
  onCompaction?: (info: { droppedCount: number }) => void;
  getPlanMode?: () => boolean;
  getMaxAgentSteps?: () => number;
  getTemperature?: () => number;
  getTerminalContextLines?: () => number;
};

function stripReasoningParts(messages: UIMessage[]): UIMessage[] {
  return messages.map((m) => {
    if (!m.parts.some((p) => p.type === "reasoning")) return m;
    return {
      ...m,
      parts: m.parts.filter((p) => p.type !== "reasoning") as UIMessage["parts"],
    };
  });
}

function prepareMessages(
  messages: UIMessage[],
  live: LiveSnapshot,
  bufferLines: number,
  modelId: ModelId,
  onCompaction?: (info: { droppedCount: number }) => void,
): UIMessage[] {
  // 1. Inject terminal context into last user message.
  const injected = injectContext(messages, live, bufferLines);

  // 2. Strip reasoning parts for models that don't preserve them.
  const processed = modelKeepsReasoning(modelId) ? injected : stripReasoningParts(injected);

  // 3. Apply message compaction if context is getting full.
  const contextLimit = getModelContextLimit(modelId);
  const compactionResult = compact(processed, contextLimit);
  if (compactionResult.compacted) {
    onCompaction?.({ droppedCount: compactionResult.droppedCount });
  }
  return compactionResult.messages;
}

export function createContextAwareTransport(deps: Deps) {
  return {
    async sendMessages(options: { messages: UIMessage[]; [k: string]: unknown }) {
      const live = deps.getLive();
      const modelId = deps.getModelId();
      const projectMemory = await readLabonairMd(live.workspaceRoot);
      const bufferLines = deps.getTerminalContextLines?.() ?? TERMINAL_BUFFER_LINES;
      const agent = await createLabonairAgent({
        keys: deps.getKeys(),
        instances: deps.getInstances?.(),
        instanceKeys: deps.getInstanceKeys?.(),
        modelId,
        customInstructions: deps.getCustomInstructions(),
        agentPersona: deps.getAgentPersona(),
        toolContext: deps.toolContext,
        onStep: deps.onStep,
        onUsage: deps.onUsage,
        onFinishMeta: deps.onFinishMeta,
        lmstudioBaseURL: deps.getLmstudioBaseURL?.(),
        lmstudioChatModelId: deps.getLmstudioChatModelId?.(),
        openaiCompatibleBaseURL: deps.getOpenaiCompatibleBaseURL?.(),
        openaiCompatibleModelId: deps.getOpenaiCompatibleModelId?.(),
        mlxBaseURL: deps.getMlxBaseURL?.(),
        mlxChatModelId: deps.getMlxChatModelId?.(),
        ollamaBaseURL: deps.getOllamaBaseURL?.(),
        ollamaChatModelId: deps.getOllamaChatModelId?.(),
        planMode: deps.getPlanMode?.(),
        projectMemory,
        maxAgentSteps: deps.getMaxAgentSteps?.(),
        temperature: deps.getTemperature?.(),
      });
      const base = new DirectChatTransport({ agent });
      const { modelDefId } = parseModelRef(modelId);
      const finalMessages = prepareMessages(
        options.messages,
        live,
        bufferLines,
        modelDefId as ModelId,
        deps.onCompaction,
      );
      return base.sendMessages({
        ...options,
        messages: finalMessages,
      } as Parameters<typeof base.sendMessages>[0]);
    },
    async reconnectToStream(options: unknown) {
      const live = deps.getLive();
      const modelId = deps.getModelId();
      const projectMemory = await readLabonairMd(live.workspaceRoot);
      const agent = await createLabonairAgent({
        keys: deps.getKeys(),
        instances: deps.getInstances?.(),
        instanceKeys: deps.getInstanceKeys?.(),
        modelId,
        customInstructions: deps.getCustomInstructions(),
        agentPersona: deps.getAgentPersona(),
        toolContext: deps.toolContext,
        onStep: deps.onStep,
        onUsage: deps.onUsage,
        onFinishMeta: deps.onFinishMeta,
        lmstudioBaseURL: deps.getLmstudioBaseURL?.(),
        lmstudioChatModelId: deps.getLmstudioChatModelId?.(),
        openaiCompatibleBaseURL: deps.getOpenaiCompatibleBaseURL?.(),
        openaiCompatibleModelId: deps.getOpenaiCompatibleModelId?.(),
        mlxBaseURL: deps.getMlxBaseURL?.(),
        mlxChatModelId: deps.getMlxChatModelId?.(),
        ollamaBaseURL: deps.getOllamaBaseURL?.(),
        ollamaChatModelId: deps.getOllamaChatModelId?.(),
        planMode: deps.getPlanMode?.(),
        projectMemory,
        maxAgentSteps: deps.getMaxAgentSteps?.(),
        temperature: deps.getTemperature?.(),
      });
      const base = new DirectChatTransport({ agent });
      // For reconnect we don't have a messages array in options directly,
      // so pass through as-is — the agent reconstructs from stream state.
      type ReconnectArg = Parameters<typeof base.reconnectToStream>[0];
      return base.reconnectToStream(options as ReconnectArg);
    },
  };
}

function injectContext(messages: UIMessage[], live: LiveSnapshot, bufferLines: number): UIMessage[] {
  if (!live.cwd && !live.terminal && !live.workspaceRoot) return messages;
  const lastUserIdx = lastIndex(messages, (m) => m.role === "user");
  if (lastUserIdx === -1) return messages;

  const block = formatContextBlock(live, bufferLines);
  return messages.map((m, i) => {
    if (i !== lastUserIdx) return m;
    const contextPart = { type: "text" as const, text: block };
    return {
      ...m,
      parts: [contextPart, ...m.parts] as UIMessage["parts"],
    };
  });
}

function formatContextBlock(live: LiveSnapshot, bufferLines: number): string {
  const lines = [
    '<terminal-context note="auto-injected, read-only">',
    `workspace_root: ${live.workspaceRoot ?? "(unknown)"}`,
    `active_terminal_cwd: ${live.cwd ?? "(unknown)"}`,
  ];
  if (live.activeFile) lines.push(`active_file: ${live.activeFile}`);
  if (live.terminal) {
    const trimmed = capChars(lastNLines(live.terminal, bufferLines), MAX_TERMINAL_CHARS);
    lines.push("recent_terminal_output:");
    lines.push("```");
    lines.push(trimmed);
    lines.push("```");
  }
  lines.push("</terminal-context>");
  lines.push("");
  return lines.join("\n");
}

function lastNLines(s: string, n: number): string {
  const all = s.split("\n");
  return all.length <= n ? s : all.slice(all.length - n).join("\n");
}

function capChars(s: string, max: number): string {
  if (s.length <= max) return s;
  return `…[truncated ${s.length - max} chars]…\n${s.slice(s.length - max)}`;
}

function lastIndex<T>(arr: T[], pred: (x: T) => boolean): number {
  for (let i = arr.length - 1; i >= 0; i--) if (pred(arr[i])) return i;
  return -1;
}

export const CONTEXT_BLOCK_RE = /^<terminal-context[^>]*>[\s\S]*?<\/terminal-context>\n*/;

export function stripContextBlock(text: string): string {
  return text.replace(CONTEXT_BLOCK_RE, "");
}
