import {
  Experimental_Agent as Agent,
  DirectChatTransport,
  stepCountIs,
  type LanguageModel,
} from "ai";
import {
  DEFAULT_MODEL_ID,
  getModel,
  LMSTUDIO_DEFAULT_BASE_URL,
  MLX_DEFAULT_BASE_URL,
  OLLAMA_DEFAULT_BASE_URL,
  OPENAI_COMPATIBLE_DEFAULT_BASE_URL,
  MAX_AGENT_STEPS,
  modelKeepsReasoning,
  providerNeedsKey,
  selectSystemPrompt,
  type ModelId,
  type ProviderId,
  type ProviderInstance,
} from "../config";
import type { ProviderKeys } from "./keyring";
import { parseModelRef, resolveInstance } from "./modelRef";
import { buildTools, type ToolContext } from "../tools/tools";

export type AgentUsageDelta = {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  reasoningTokens: number;
  hitStepCap: boolean;
  isFinal: boolean;
};

type AgentDeps = {
  keys: ProviderKeys;
  /** Provider instances from the new multi-instance system. When provided,
   *  modelRef is resolved against instances to find the right key/config. */
  instances?: ProviderInstance[];
  instanceKeys?: Record<string, string | null>;
  /** Model reference: "modelDefId" or "modelDefId@instanceId". */
  modelId?: ModelId | string;
  customInstructions?: string;
  /** Persona / role for this conversation (system prompt addendum). */
  agentPersona?: { name: string; instructions: string } | null;
  toolContext: ToolContext;
  onStep?: (step: string | null) => void;
  /** Called on each step with token usage and on final completion. */
  onUsage?: (delta: AgentUsageDelta) => void;
  /** Called once on final completion with finish metadata. */
  onFinishMeta?: (info: { hitStepCap: boolean; finishReason: string }) => void;
  /** Override base URL for OpenAI-compatible providers (LM Studio). */
  lmstudioBaseURL?: string;
  /** User-configured model name for LM Studio main chat (overrides "lmstudio-local" placeholder). */
  lmstudioChatModelId?: string;
  /** Base URL for the openai-compatible custom endpoint. */
  openaiCompatibleBaseURL?: string;
  /** Model ID for the openai-compatible custom endpoint. */
  openaiCompatibleModelId?: string;
  /** Base URL for MLX local server. */
  mlxBaseURL?: string;
  /** User-configured model name for MLX (overrides "mlx-local" placeholder). */
  mlxChatModelId?: string;
  /** Base URL for Ollama local server. */
  ollamaBaseURL?: string;
  /** User-configured model name for Ollama (overrides "ollama-local" placeholder). */
  ollamaChatModelId?: string;
  /** True when /plan is active — agent should batch edits for review. */
  planMode?: boolean;
  /** Contents of NEXUM.md at workspace root, if present. Appended verbatim. */
  projectMemory?: string | null;
  /** Max number of agentic steps before stopping. Overrides MAX_AGENT_STEPS. */
  maxAgentSteps?: number;
  /** Model temperature (0.0–1.0). Undefined = provider default. */
  temperature?: number;
};

const TOOL_LABELS: Record<string, (input: Record<string, unknown>) => string> = {
  read_file: (i) => `Reading ${shortPath(i.path)}`,
  list_directory: (i) => `Listing ${shortPath(i.path)}`,
  grep: (i) => `Grepping ${ellipsize(String(i.pattern ?? ""), 40)}`,
  glob: (i) => `Globbing ${ellipsize(String(i.pattern ?? ""), 40)}`,
  edit: (i) => `Editing ${shortPath(i.path)}`,
  multi_edit: (i) => `Editing ${shortPath(i.path)}`,
  write_file: (i) => `Writing ${shortPath(i.path)}`,
  create_directory: (i) => `Creating ${shortPath(i.path)}`,
  bash_run: (i) => `Running ${ellipsize(String(i.command ?? ""), 60)}`,
  bash_background: (i) =>
    `Spawning ${ellipsize(String(i.command ?? ""), 60)}`,
  bash_logs: () => `Reading logs`,
  bash_list: () => `Listing background processes`,
  bash_kill: () => `Stopping background process`,
  suggest_command: (i) =>
    `Suggesting ${ellipsize(String(i.command ?? ""), 60)}`,
  todo_write: (i) =>
    `Updating plan (${Array.isArray(i.todos) ? i.todos.length : 0} items)`,
  run_subagent: (i) => `Spawning ${String(i.type ?? "subagent")} subagent`,
  spawn_claude_session: (i) =>
    `Spawning Claude in ${i.target === "new" ? "new terminal" : i.target === "current" ? "current terminal" : `terminal ${i.target}`}`,
};

function shortPath(p: unknown): string {
  if (typeof p !== "string") return "";
  const i = p.lastIndexOf("/");
  return i === -1 ? p : p.slice(i + 1);
}

function ellipsize(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

export type BuildModelOptions = {
  /** Override the model id (used by autocomplete with custom LM Studio model). */
  modelIdOverride?: string;
  /** Override LM Studio base URL. Defaults to `LMSTUDIO_DEFAULT_BASE_URL`. */
  lmstudioBaseURL?: string;
  /** Base URL for openai-compatible provider. Defaults to `OPENAI_COMPATIBLE_DEFAULT_BASE_URL`. */
  openaiCompatibleBaseURL?: string;
  /** Base URL for MLX local server. Defaults to `MLX_DEFAULT_BASE_URL`. */
  mlxBaseURL?: string;
  /** Base URL for Ollama local server. Defaults to `OLLAMA_DEFAULT_BASE_URL`. */
  ollamaBaseURL?: string;
};

// Memoize built models. Provider clients are not free to construct — they
// register middleware and parse keys — and we'd otherwise rebuild one per
// `sendMessages` call. Keyed on the full identity that affects the result.
const modelCache = new Map<string, LanguageModel>();

async function buildWithSubscriptionAuth(resolvedModelId: string): Promise<LanguageModel> {
  const { invoke: tauriInvoke } = await import("@tauri-apps/api/core");
  type ClaudeCreds = { access_token: string; source: string };
  const creds = await tauriInvoke<ClaudeCreds>("ai_claude_credentials_read");
  const { createAnthropic } = await import("@ai-sdk/anthropic");
  return createAnthropic({
    authToken: creds.access_token,
    headers: { "anthropic-beta": "oauth-2025-04-20" },
  })(resolvedModelId);
}

export async function buildLanguageModel(
  provider: ProviderId,
  keys: ProviderKeys,
  resolvedModelId: string,
  options: BuildModelOptions = {},
): Promise<LanguageModel> {
  if (provider === "anthropic-subscription") {
    return buildWithSubscriptionAuth(resolvedModelId);
  }
  if (providerNeedsKey(provider) && provider !== "openai-compatible" && !keys[provider]) {
    throw new Error(
      `No API key configured for ${provider}. Open Settings → AI to add one.`,
    );
  }
  const key = keys[provider] ?? "";
  const baseURL = options.lmstudioBaseURL ?? LMSTUDIO_DEFAULT_BASE_URL;
  const compatBaseURL = options.openaiCompatibleBaseURL ?? OPENAI_COMPATIBLE_DEFAULT_BASE_URL;
  const mlxURL = options.mlxBaseURL ?? MLX_DEFAULT_BASE_URL;
  const ollamaURL = options.ollamaBaseURL ?? OLLAMA_DEFAULT_BASE_URL;
  const cacheKey = [provider, key, resolvedModelId, baseURL, compatBaseURL, mlxURL, ollamaURL].join(" ");
  const hit = modelCache.get(cacheKey);
  if (hit) return hit;

  let built: LanguageModel;
  switch (provider) {
    case "openai": {
      const { createOpenAI } = await import("@ai-sdk/openai");
      built = createOpenAI({ apiKey: key })(resolvedModelId);
      break;
    }
    case "anthropic": {
      const { createAnthropic } = await import("@ai-sdk/anthropic");
      built = createAnthropic({ apiKey: key })(resolvedModelId);
      break;
    }
    case "google": {
      const { createGoogleGenerativeAI } = await import("@ai-sdk/google");
      built = createGoogleGenerativeAI({ apiKey: key })(resolvedModelId);
      break;
    }
    case "xai": {
      const { createXai } = await import("@ai-sdk/xai");
      built = createXai({ apiKey: key })(resolvedModelId);
      break;
    }
    case "cerebras": {
      const { createCerebras } = await import("@ai-sdk/cerebras");
      built = createCerebras({ apiKey: key })(resolvedModelId);
      break;
    }
    case "groq": {
      const { createGroq } = await import("@ai-sdk/groq");
      built = createGroq({ apiKey: key })(resolvedModelId);
      break;
    }
    case "lmstudio": {
      const { createOpenAICompatible } = await import(
        "@ai-sdk/openai-compatible"
      );
      built = createOpenAICompatible({ name: "lmstudio", baseURL })(
        resolvedModelId,
      );
      break;
    }
    case "openai-compatible": {
      const { createOpenAICompatible } = await import(
        "@ai-sdk/openai-compatible"
      );
      const compat = createOpenAICompatible({
        name: "openai-compatible",
        baseURL: compatBaseURL,
        ...(key ? { apiKey: key } : {}),
      });
      built = compat(resolvedModelId);
      break;
    }
    case "deepseek": {
      const { createDeepSeek } = await import("@ai-sdk/deepseek");
      built = createDeepSeek({ apiKey: key })(resolvedModelId);
      break;
    }
    case "mistral": {
      const { createMistral } = await import("@ai-sdk/mistral");
      built = createMistral({ apiKey: key })(resolvedModelId);
      break;
    }
    case "openrouter": {
      const { createOpenRouter } = await import("@openrouter/ai-sdk-provider");
      built = createOpenRouter({ apiKey: key })(resolvedModelId);
      break;
    }
    case "mlx": {
      const { createOpenAICompatible: createMlx } = await import("@ai-sdk/openai-compatible");
      built = createMlx({ name: "mlx", baseURL: mlxURL })(resolvedModelId);
      break;
    }
    case "ollama": {
      const { createOpenAICompatible: createOllama } = await import("@ai-sdk/openai-compatible");
      built = createOllama({ name: "ollama", baseURL: ollamaURL })(resolvedModelId);
      break;
    }
    default: {
      const _exhaustive: never = provider;
      throw new Error(`Unsupported provider: ${_exhaustive as ProviderId}`);
    }
  }
  modelCache.set(cacheKey, built);
  return built;
}

type BuildModelExtras = {
  lmstudioBaseURL?: string;
  lmstudioChatModelId?: string;
  openaiCompatibleBaseURL?: string;
  openaiCompatibleModelId?: string;
  mlxBaseURL?: string;
  mlxChatModelId?: string;
  ollamaBaseURL?: string;
  ollamaChatModelId?: string;
};

/** Build a language model from a ProviderInstance + pre-fetched key. */
export async function buildLanguageModelFromInstance(
  instance: ProviderInstance,
  key: string | null,
  resolvedModelId: string,
): Promise<LanguageModel> {
  const { providerId } = instance;
  if (providerId === "anthropic-subscription") {
    return buildWithSubscriptionAuth(resolvedModelId);
  }
  const baseURL = instance.baseUrl;
  const cacheKey = [providerId, instance.id, key ?? "", resolvedModelId, baseURL ?? ""].join(" ");
  const hit = modelCache.get(cacheKey);
  if (hit) return hit;

  let built: LanguageModel;
  switch (providerId) {
    case "openai": {
      const { createOpenAI } = await import("@ai-sdk/openai");
      built = createOpenAI({ apiKey: key ?? "" })(resolvedModelId);
      break;
    }
    case "anthropic": {
      const { createAnthropic } = await import("@ai-sdk/anthropic");
      built = createAnthropic({ apiKey: key ?? "" })(resolvedModelId);
      break;
    }
    case "google": {
      const { createGoogleGenerativeAI } = await import("@ai-sdk/google");
      built = createGoogleGenerativeAI({ apiKey: key ?? "" })(resolvedModelId);
      break;
    }
    case "xai": {
      const { createXai } = await import("@ai-sdk/xai");
      built = createXai({ apiKey: key ?? "" })(resolvedModelId);
      break;
    }
    case "cerebras": {
      const { createCerebras } = await import("@ai-sdk/cerebras");
      built = createCerebras({ apiKey: key ?? "" })(resolvedModelId);
      break;
    }
    case "groq": {
      const { createGroq } = await import("@ai-sdk/groq");
      built = createGroq({ apiKey: key ?? "" })(resolvedModelId);
      break;
    }
    case "lmstudio": {
      const { createOpenAICompatible } = await import("@ai-sdk/openai-compatible");
      built = createOpenAICompatible({ name: "lmstudio", baseURL: baseURL ?? LMSTUDIO_DEFAULT_BASE_URL })(resolvedModelId);
      break;
    }
    case "openai-compatible": {
      const { createOpenAICompatible } = await import("@ai-sdk/openai-compatible");
      built = createOpenAICompatible({
        name: "openai-compatible",
        baseURL: baseURL ?? OPENAI_COMPATIBLE_DEFAULT_BASE_URL,
        ...(key ? { apiKey: key } : {}),
      })(resolvedModelId);
      break;
    }
    case "deepseek": {
      const { createDeepSeek } = await import("@ai-sdk/deepseek");
      built = createDeepSeek({ apiKey: key ?? "" })(resolvedModelId);
      break;
    }
    case "mistral": {
      const { createMistral } = await import("@ai-sdk/mistral");
      built = createMistral({ apiKey: key ?? "" })(resolvedModelId);
      break;
    }
    case "openrouter": {
      const { createOpenRouter } = await import("@openrouter/ai-sdk-provider");
      built = createOpenRouter({ apiKey: key ?? "" })(resolvedModelId);
      break;
    }
    case "mlx": {
      const { createOpenAICompatible: createMlx } = await import("@ai-sdk/openai-compatible");
      built = createMlx({ name: "mlx", baseURL: baseURL ?? MLX_DEFAULT_BASE_URL })(resolvedModelId);
      break;
    }
    case "ollama": {
      const { createOpenAICompatible: createOllama } = await import("@ai-sdk/openai-compatible");
      built = createOllama({ name: "ollama", baseURL: baseURL ?? OLLAMA_DEFAULT_BASE_URL })(resolvedModelId);
      break;
    }
    default: {
      const _exhaustive: never = providerId;
      throw new Error(`Unsupported provider: ${_exhaustive as ProviderId}`);
    }
  }
  modelCache.set(cacheKey, built);
  return built;
}

function buildModel(
  modelId: ModelId | string,
  keys: ProviderKeys,
  extras: BuildModelExtras = {},
  instances?: ProviderInstance[],
  instanceKeys?: Record<string, string | null>,
): Promise<LanguageModel> {
  // New path: resolve via provider instances
  if (instances && instanceKeys) {
    const { modelDefId, instanceId } = parseModelRef(modelId);
    const baseModelId = modelDefId as ModelId;
    const m = getModel(baseModelId);
    const instance = resolveInstance(m.provider, instanceId, instances);
    if (instance) {
      const key = providerNeedsKey(m.provider) ? (instanceKeys[instance.id] ?? null) : null;
      let resolvedModelId: string = m.apiModelId ?? m.id;
      if (m.provider === "lmstudio" || m.provider === "mlx" || m.provider === "ollama" || m.provider === "openai-compatible") {
        if (!instance.localModelId?.trim()) {
          throw new Error(`No model ID configured for ${instance.name}. Open Settings → AI → Providers.`);
        }
        resolvedModelId = instance.localModelId;
      }
      return buildLanguageModelFromInstance(instance, key, resolvedModelId);
    }
    // Fall through to legacy path if no instance found
    return buildModelLegacy(baseModelId, keys, extras);
  }
  return buildModelLegacy(modelId as ModelId, keys, extras);
}

function buildModelLegacy(
  modelId: ModelId,
  keys: ProviderKeys,
  extras: BuildModelExtras = {},
): Promise<LanguageModel> {
  const m = getModel(modelId);
  // Use apiModelId when set (e.g. subscription models map to base Claude model IDs)
  let resolvedModelId = m.apiModelId ?? m.id;
  if (m.provider === "lmstudio") {
    if (!extras.lmstudioChatModelId?.trim()) {
      throw new Error("No LM Studio model ID configured. Open Settings → AI → Providers.");
    }
    resolvedModelId = extras.lmstudioChatModelId;
  } else if (m.provider === "openai-compatible") {
    if (!extras.openaiCompatibleModelId?.trim()) {
      throw new Error("No model ID configured for Custom Endpoint. Open Settings → AI → Providers.");
    }
    resolvedModelId = extras.openaiCompatibleModelId;
  } else if (m.provider === "mlx") {
    if (!extras.mlxChatModelId?.trim()) {
      throw new Error("No MLX model ID configured. Open Settings → AI → Providers.");
    }
    resolvedModelId = extras.mlxChatModelId;
  } else if (m.provider === "ollama") {
    if (!extras.ollamaChatModelId?.trim()) {
      throw new Error("No Ollama model ID configured. Open Settings → AI → Providers.");
    }
    resolvedModelId = extras.ollamaChatModelId;
  }
  return buildLanguageModel(m.provider, keys, resolvedModelId, {
    lmstudioBaseURL: extras.lmstudioBaseURL,
    openaiCompatibleBaseURL: extras.openaiCompatibleBaseURL,
    mlxBaseURL: extras.mlxBaseURL,
    ollamaBaseURL: extras.ollamaBaseURL,
  });
}

export async function createNexumAgent({
  keys,
  instances,
  instanceKeys,
  modelId = DEFAULT_MODEL_ID,
  customInstructions,
  agentPersona,
  toolContext,
  onStep,
  onUsage,
  onFinishMeta,
  lmstudioBaseURL,
  lmstudioChatModelId,
  openaiCompatibleBaseURL,
  openaiCompatibleModelId,
  mlxBaseURL,
  mlxChatModelId,
  ollamaBaseURL,
  ollamaChatModelId,
  planMode,
  projectMemory,
  maxAgentSteps,
  temperature,
}: AgentDeps) {
  const trimmedCustom = customInstructions?.trim();
  const personaBlock = agentPersona?.instructions.trim()
    ? `\n\n## ACTIVE AGENT — ${agentPersona.name}\n${agentPersona.instructions.trim()}`
    : "";
  const customBlock = trimmedCustom
    ? `\n\n## USER CUSTOM INSTRUCTIONS — follow unless they conflict with safety rules above\n${trimmedCustom}`
    : "";
  const memoryBlock =
    projectMemory && projectMemory.trim().length > 0
      ? `\n\n## PROJECT — NEXUM.md\n${projectMemory.trim()}`
      : "";
  const planBlock = planMode
    ? `\n\n## PLAN MODE — ACTIVE\nMutating tools (write_file, edit, multi_edit, create_directory) will queue their changes for the user to review as a single diff. Do NOT execute bash_run or bash_background while plan mode is active — restrict yourself to reads (read_file, grep, glob, list_directory) and the queued mutations. After queueing the full set of edits, stop and return a brief summary; do not continue acting until the user has accepted/rejected.`
    : "";
  const { modelDefId } = parseModelRef(modelId);
  const basePrompt = selectSystemPrompt(modelDefId);
  const instructions = `${basePrompt}${memoryBlock}${personaBlock}${customBlock}${planBlock}`;
  const baseModel = await buildModel(modelId, keys, {
    lmstudioBaseURL,
    lmstudioChatModelId,
    openaiCompatibleBaseURL,
    openaiCompatibleModelId,
    mlxBaseURL,
    mlxChatModelId,
    ollamaBaseURL,
    ollamaChatModelId,
  }, instances, instanceKeys);
  const model =
    temperature !== undefined &&
    typeof (baseModel as unknown as { withSettings?: unknown }).withSettings === "function"
      ? (baseModel as unknown as { withSettings: (s: { temperature: number }) => LanguageModel }).withSettings({ temperature })
      : baseModel;
  const steps = maxAgentSteps ?? MAX_AGENT_STEPS;

  // Apply Anthropic prompt-caching breakpoint on system message.
  const m = getModel(modelDefId as ModelId);
  const isAnthropic = m.provider === "anthropic";
  const providerOptions = isAnthropic
    ? { anthropic: { cacheControl: { type: "ephemeral" as const } } }
    : undefined;

  return new Agent({
    model,
    instructions,
    tools: buildTools(toolContext),
    stopWhen: stepCountIs(steps),
    ...(providerOptions ? { providerOptions } : {}),
    onStepFinish: (step) => {
      // Step label for UI spinner
      if (onStep) {
        const last = step.toolCalls?.[step.toolCalls.length - 1];
        if (last) {
          const label = TOOL_LABELS[last.toolName];
          onStep(
            label
              ? label((last.input ?? {}) as Record<string, unknown>)
              : `Calling ${last.toolName}`,
          );
        } else if (step.text) {
          onStep("Writing");
        }
      }
      // Per-step token tracking
      if (onUsage && step.usage) {
        const u = step.usage;
        onUsage({
          inputTokens: u.inputTokens ?? 0,
          outputTokens: u.outputTokens ?? 0,
          cacheReadTokens: (u as unknown as { inputTokenDetails?: { cacheReadTokens?: number } }).inputTokenDetails?.cacheReadTokens ?? 0,
          reasoningTokens: (u as unknown as { outputTokenDetails?: { reasoningTokens?: number } }).outputTokenDetails?.reasoningTokens ?? 0,
          hitStepCap: false,
          isFinal: false,
        });
      }
    },
    onFinish: (event) => {
      onStep?.(null);
      const hitStepCap = event.finishReason === "length";
      onFinishMeta?.({ hitStepCap, finishReason: event.finishReason });
      if (onUsage && event.totalUsage) {
        const tu = event.totalUsage;
        onUsage({
          inputTokens: tu.inputTokens ?? 0,
          outputTokens: tu.outputTokens ?? 0,
          cacheReadTokens: (tu as unknown as { inputTokenDetails?: { cacheReadTokens?: number } }).inputTokenDetails?.cacheReadTokens ?? 0,
          reasoningTokens: (tu as unknown as { outputTokenDetails?: { reasoningTokens?: number } }).outputTokenDetails?.reasoningTokens ?? 0,
          hitStepCap,
          isFinal: true,
        });
      }
    },
  });
}

export { modelKeepsReasoning };

export type NexumAgent = Awaited<ReturnType<typeof createNexumAgent>>;

export function createNexumTransport(agent: NexumAgent) {
  return new DirectChatTransport({ agent });
}
