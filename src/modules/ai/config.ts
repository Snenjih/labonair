export const KEYRING_SERVICE = "labonair-ai";

export type ProviderId =
  | "openai"
  | "anthropic"
  | "google"
  | "xai"
  | "cerebras"
  | "groq"
  | "lmstudio"
  | "openai-compatible"
  | "deepseek"
  | "mistral"
  | "openrouter"
  | "mlx"
  | "ollama";

export type ProviderInfo = {
  id: ProviderId;
  label: string;
  keyringAccount: string;
  keyPrefix: string | null;
  consoleUrl: string;
};

export const PROVIDERS: readonly ProviderInfo[] = [
  {
    id: "openai",
    label: "OpenAI",
    keyringAccount: "openai-api-key",
    keyPrefix: "sk-",
    consoleUrl: "https://platform.openai.com/api-keys",
  },
  {
    id: "anthropic",
    label: "Anthropic",
    keyringAccount: "anthropic-api-key",
    keyPrefix: "sk-ant-",
    consoleUrl: "https://console.anthropic.com/settings/keys",
  },
  {
    id: "google",
    label: "Google",
    keyringAccount: "google-api-key",
    keyPrefix: null,
    consoleUrl: "https://aistudio.google.com/apikey",
  },
  {
    id: "xai",
    label: "xAI",
    keyringAccount: "xai-api-key",
    keyPrefix: "xai-",
    consoleUrl: "https://console.x.ai/",
  },
  {
    id: "cerebras",
    label: "Cerebras",
    keyringAccount: "cerebras-api-key",
    keyPrefix: "csk-",
    consoleUrl: "https://cloud.cerebras.ai/",
  },
  {
    id: "groq",
    label: "Groq",
    keyringAccount: "groq-api-key",
    keyPrefix: "gsk_",
    consoleUrl: "https://console.groq.com/keys",
  },
  {
    id: "lmstudio",
    label: "LM Studio",
    keyringAccount: "",
    keyPrefix: null,
    consoleUrl: "https://lmstudio.ai/docs/basics/server",
  },
  {
    id: "openai-compatible",
    label: "OpenAI-compatible",
    keyringAccount: "openai-compatible-api-key",
    keyPrefix: null,
    consoleUrl: "",
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    keyringAccount: "deepseek-api-key",
    keyPrefix: "sk-",
    consoleUrl: "https://platform.deepseek.com/api_keys",
  },
  {
    id: "mistral",
    label: "Mistral",
    keyringAccount: "mistral-api-key",
    keyPrefix: null,
    consoleUrl: "https://console.mistral.ai/api-keys/",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    keyringAccount: "openrouter-api-key",
    keyPrefix: "sk-or-",
    consoleUrl: "https://openrouter.ai/keys",
  },
  {
    id: "mlx",
    label: "MLX (local)",
    keyringAccount: "",
    keyPrefix: null,
    consoleUrl: "https://github.com/ml-explore/mlx",
  },
  {
    id: "ollama",
    label: "Ollama (local)",
    keyringAccount: "",
    keyPrefix: null,
    consoleUrl: "https://ollama.ai",
  },
] as const;

export function getProvider(id: ProviderId): ProviderInfo {
  const p = PROVIDERS.find((x) => x.id === id);
  if (!p) throw new Error(`Unknown provider: ${id}`);
  return p;
}

export type ModelTag = "vision" | "reasoning" | "tools" | "coding";
export type CapabilityScore = 1 | 2 | 3 | 4 | 5;
export type ModelCapabilities = {
  intelligence: CapabilityScore;
  speed: CapabilityScore;
  cost: CapabilityScore; // 5 = cheapest, 1 = most expensive
};

export type ModelInfo = {
  id: string;
  provider: ProviderId;
  label: string;
  hint: string;
  description?: string;
  capabilities?: ModelCapabilities;
  tags?: readonly ModelTag[];
};

/** A model fetched live from a provider's API, bound to a specific instance. */
export type DynamicModelInfo = ModelInfo & {
  instanceId: string;
  source: "api";
};

export const MODELS = [
  // OpenAI
  {
    id: "gpt-5.4-mini",
    provider: "openai",
    label: "GPT-5.4 mini",
    hint: "Fast, default",
    capabilities: { intelligence: 3, speed: 5, cost: 5 },
    tags: ["tools"] as const,
  },
  {
    id: "gpt-5.5",
    provider: "openai",
    label: "GPT-5.5",
    hint: "Higher quality",
    capabilities: { intelligence: 5, speed: 3, cost: 2 },
    tags: ["tools", "coding"] as const,
  },
  {
    id: "gpt-5.3-codex",
    provider: "openai",
    label: "GPT-5.3 Codex",
    hint: "Coding",
    capabilities: { intelligence: 4, speed: 3, cost: 2 },
    tags: ["tools", "coding"] as const,
  },
  // Anthropic
  {
    id: "claude-haiku-4-5",
    provider: "anthropic",
    label: "Claude Haiku 4.5",
    hint: "Fast",
    capabilities: { intelligence: 3, speed: 5, cost: 5 },
    tags: ["tools"] as const,
  },
  {
    id: "claude-sonnet-4-6",
    provider: "anthropic",
    label: "Claude Sonnet 4.6",
    hint: "Balanced",
    capabilities: { intelligence: 4, speed: 3, cost: 3 },
    tags: ["tools", "coding"] as const,
  },
  {
    id: "claude-opus-4-7",
    provider: "anthropic",
    label: "Claude Opus 4.7",
    hint: "Best",
    capabilities: { intelligence: 5, speed: 2, cost: 1 },
    tags: ["reasoning", "tools", "coding"] as const,
  },
  // Google
  {
    id: "gemini-3.1-pro",
    provider: "google",
    label: "Gemini 3.1 Pro",
    hint: "Best",
    capabilities: { intelligence: 4, speed: 3, cost: 2 },
    tags: ["tools", "vision"] as const,
  },
  {
    id: "gemini-3-flash",
    provider: "google",
    label: "Gemini 3 Flash",
    hint: "Fast",
    capabilities: { intelligence: 3, speed: 5, cost: 5 },
    tags: ["tools"] as const,
  },
  // xAI
  {
    id: "grok-4.20-reasoning",
    provider: "xai",
    label: "Grok 4.20 Reasoning",
    hint: "Reasoning",
    capabilities: { intelligence: 5, speed: 2, cost: 2 },
    tags: ["reasoning", "tools"] as const,
  },
  {
    id: "grok-4.20-non-reasoning",
    provider: "xai",
    label: "Grok 4.20",
    hint: "Fast",
    capabilities: { intelligence: 4, speed: 4, cost: 3 },
    tags: ["tools"] as const,
  },
  // Cerebras (autocomplete-tier)
  {
    id: "gpt-oss-120b",
    provider: "cerebras",
    label: "GPT-OSS 120B",
    hint: "Cerebras · ultra-fast",
    capabilities: { intelligence: 3, speed: 5, cost: 5 },
    tags: ["tools"] as const,
  },
  // Groq (autocomplete-tier)
  {
    id: "openai/gpt-oss-20b",
    provider: "groq",
    label: "GPT-OSS 20B",
    hint: "Groq · ultra-fast",
    capabilities: { intelligence: 2, speed: 5, cost: 5 },
    tags: ["tools"] as const,
  },
  // LM Studio (local; model id is user-supplied at runtime)
  {
    id: "lmstudio-local",
    provider: "lmstudio",
    label: "LM Studio (local)",
    hint: "Custom local model",
  },
  // OpenAI-compatible endpoint (model id is user-supplied at runtime)
  {
    id: "openai-compatible-custom",
    provider: "openai-compatible",
    label: "Custom Endpoint",
    hint: "OpenAI-compatible",
  },
  // DeepSeek
  {
    id: "deepseek-chat",
    provider: "deepseek",
    label: "DeepSeek Chat",
    hint: "Strong coder",
    capabilities: { intelligence: 4, speed: 4, cost: 5 },
    tags: ["coding", "tools"] as const,
  },
  {
    id: "deepseek-reasoner",
    provider: "deepseek",
    label: "DeepSeek Reasoner",
    hint: "Reasoning",
    capabilities: { intelligence: 5, speed: 2, cost: 4 },
    tags: ["reasoning"] as const,
  },
  // Mistral
  {
    id: "mistral-large-latest",
    provider: "mistral",
    label: "Mistral Large",
    hint: "Best",
    capabilities: { intelligence: 4, speed: 3, cost: 3 },
    tags: ["tools"] as const,
  },
  {
    id: "mistral-small-latest",
    provider: "mistral",
    label: "Mistral Small",
    hint: "Fast",
    capabilities: { intelligence: 3, speed: 5, cost: 5 },
    tags: ["tools"] as const,
  },
  // OpenRouter (meta-model gateway; runtime model ID supplied by user)
  {
    id: "openrouter-auto",
    provider: "openrouter",
    label: "OpenRouter Auto",
    hint: "Best available",
  },
  // MLX (local Apple Silicon; model id is user-supplied at runtime)
  {
    id: "mlx-local",
    provider: "mlx",
    label: "MLX (local)",
    hint: "Apple Silicon",
  },
  // Ollama (local; model id is user-supplied at runtime)
  {
    id: "ollama-local",
    provider: "ollama",
    label: "Ollama (local)",
    hint: "Custom local",
  },
] as const satisfies readonly ModelInfo[];

export type ModelId = (typeof MODELS)[number]["id"];

export function getModel(id: ModelId): ModelInfo {
  const m = MODELS.find((x) => x.id === id);
  if (!m) throw new Error(`Unknown model: ${id}`);
  return m;
}

export const DEFAULT_MODEL_ID: ModelId = "gpt-5.4-mini";

/** Approximate context window (in tokens) per model. Used for the
 *  context-usage indicator in the AI mini-window header. Conservative
 *  estimates — actual provider limits may shift. */
export const MODEL_CONTEXT_LIMITS: Record<string, number> = {
  "gpt-5.4-mini": 400_000,
  "gpt-5.5": 1_050_000,
  "gpt-5.3-codex": 400_000,
  "claude-haiku-4-5": 200_000,
  "claude-sonnet-4-6": 200_000,
  "claude-opus-4-7": 200_000,
  "gemini-3.1-pro": 1_000_000,
  "gemini-3-flash": 1_000_000,
  "grok-4.20-reasoning": 2_000_000,
  "grok-4.20-non-reasoning": 2_000_000,
  "gpt-oss-120b": 128_000,
  "openai/gpt-oss-20b": 128_000,
  "lmstudio-local": 32_000,
  "openai-compatible-custom": 128_000,
  "deepseek-chat": 64_000,
  "deepseek-reasoner": 64_000,
  "mistral-large-latest": 128_000,
  "mistral-small-latest": 128_000,
  "openrouter-auto": 128_000,
  "mlx-local": 32_000,
  "ollama-local": 32_000,
};

export function getModelContextLimit(modelId: string | undefined): number {
  if (!modelId) return 128_000;
  return MODEL_CONTEXT_LIMITS[modelId] ?? 128_000;
}

/** True if the model preserves reasoning / thinking tokens across turns. */
export function modelKeepsReasoning(modelId: string): boolean {
  return (MODELS as readonly ModelInfo[]).find((m) => m.id === modelId)?.tags?.includes("reasoning") ?? false;
}

/** Returns a shorter system prompt for small / fast models. */
export function selectSystemPrompt(modelId: string): string {
  const m = (MODELS as readonly ModelInfo[]).find((x) => x.id === modelId);
  if (m?.capabilities?.speed === 5) return SYSTEM_PROMPT_LITE;
  return SYSTEM_PROMPT;
}

/** Pricing per million tokens (USD). Used for cost estimation in the UI. */
export type ModelPricing = {
  input: number;
  output: number;
  cacheRead?: number;
};

export const MODEL_PRICING: Record<string, ModelPricing> = {
  "gpt-5.4-mini": { input: 0.15, output: 0.6 },
  "gpt-5.5": { input: 2.5, output: 10.0 },
  "gpt-5.3-codex": { input: 3.0, output: 15.0 },
  "claude-haiku-4-5": { input: 0.25, output: 1.25, cacheRead: 0.03 },
  "claude-sonnet-4-6": { input: 3.0, output: 15.0, cacheRead: 0.3 },
  "claude-opus-4-7": { input: 15.0, output: 75.0, cacheRead: 1.5 },
  "gemini-3.1-pro": { input: 3.5, output: 10.5 },
  "gemini-3-flash": { input: 0.075, output: 0.3 },
  "deepseek-chat": { input: 0.27, output: 1.1 },
  "deepseek-reasoner": { input: 0.55, output: 2.19 },
  "mistral-large-latest": { input: 2.0, output: 6.0 },
  "mistral-small-latest": { input: 0.1, output: 0.3 },
};

export function estimateCost(
  modelId: string,
  usage: { inputTokens: number; outputTokens: number; cacheReadTokens?: number },
): number | null {
  const p = MODEL_PRICING[modelId];
  if (!p) return null;
  const freshInput = usage.inputTokens - (usage.cacheReadTokens ?? 0);
  return (
    (freshInput / 1_000_000) * p.input +
    ((usage.cacheReadTokens ?? 0) / 1_000_000) * (p.cacheRead ?? p.input) +
    (usage.outputTokens / 1_000_000) * p.output
  );
}

/** Providers that do not require an API key (e.g. local servers). */
export const KEYLESS_PROVIDERS: readonly ProviderId[] = ["lmstudio", "mlx", "ollama"] as const;

export function providerNeedsKey(id: ProviderId): boolean {
  return !KEYLESS_PROVIDERS.includes(id);
}

/** Providers eligible for the editor's inline autocomplete (latency-critical). */
export type AutocompleteProviderId = "cerebras" | "groq" | "lmstudio" | "openai-compatible";

export const AUTOCOMPLETE_PROVIDERS: readonly AutocompleteProviderId[] = [
  "cerebras",
  "groq",
  "lmstudio",
  "openai-compatible",
] as const;

export const DEFAULT_AUTOCOMPLETE_MODEL: Record<AutocompleteProviderId, string> = {
  cerebras: "gpt-oss-120b",
  groq: "openai/gpt-oss-20b",
  lmstudio: "qwen2.5-coder-7b-instruct",
  "openai-compatible": "",
};

export const LMSTUDIO_DEFAULT_BASE_URL = "http://localhost:1234/v1";
export const OPENAI_COMPATIBLE_DEFAULT_BASE_URL = "http://localhost:8080/v1";
export const MLX_DEFAULT_BASE_URL = "http://127.0.0.1:8080/v1";
export const OLLAMA_DEFAULT_BASE_URL = "http://localhost:11434/v1";

/** Provider IDs that belong to the "cloud" group in the Add Provider dropdown. */
export const CLOUD_PROVIDER_IDS: readonly ProviderId[] = [
  "openai",
  "anthropic",
  "google",
  "xai",
  "cerebras",
  "groq",
  "deepseek",
  "mistral",
  "openrouter",
] as const;

/** Provider IDs that belong to the "local & custom" group. */
export const LOCAL_PROVIDER_IDS: readonly ProviderId[] = [
  "openai-compatible",
  "lmstudio",
  "mlx",
  "ollama",
] as const;

export function getProviderDefaultBaseUrl(id: ProviderId): string {
  switch (id) {
    case "lmstudio":
      return LMSTUDIO_DEFAULT_BASE_URL;
    case "mlx":
      return MLX_DEFAULT_BASE_URL;
    case "ollama":
      return OLLAMA_DEFAULT_BASE_URL;
    case "openai-compatible":
      return OPENAI_COMPATIBLE_DEFAULT_BASE_URL;
    default:
      return "";
  }
}

/** Short descriptions shown on provider cards. */
export const PROVIDER_DESCRIPTIONS: Partial<Record<ProviderId, string>> = {
  openrouter: "Any model on OpenRouter — type its full provider/model id.",
  "openai-compatible": "Any OpenAI-compatible endpoint — vLLM, Z.AI, Fireworks, etc.",
  lmstudio: "Run GGUF models via LM Studio's HTTP server (Developer tab → enable).",
  mlx: "Apple-silicon inference via mlx_lm.server (pip install mlx-lm).",
  ollama: "Local models via Ollama's built-in OpenAI-compatible API.",
};

/** Documentation URLs shown on local/custom provider cards. */
export const PROVIDER_DOCS_URLS: Partial<Record<ProviderId, string>> = {
  openrouter: "https://openrouter.ai/docs",
  "openai-compatible": "https://platform.openai.com/docs/api-reference",
  lmstudio: "https://lmstudio.ai/docs/basics/server",
  mlx: "https://github.com/ml-explore/mlx-lm",
  ollama: "https://ollama.ai",
};

/** A configured provider instance — one entry per provider the user has set up. */
export type ProviderInstance = {
  id: string;
  providerId: ProviderId;
  /** Display name, auto-set to providerId or "openai2" when duplicates exist. */
  name: string;
  /** Base URL for local / custom providers. */
  baseUrl?: string;
  /** Model ID for local / custom providers (the model running on the server). */
  localModelId?: string;
  /** Context window override for openai-compatible. */
  contextWindowSize?: number;
  /** Comma-separated model IDs for OpenRouter. */
  openrouterModelIds?: string;
};
export const MAX_AGENT_STEPS = 10;
export const TERMINAL_BUFFER_LINES = 300;

export const SYSTEM_PROMPT = `You are Labonair, an AI assistant embedded in a developer terminal emulator.

Every turn includes a <terminal-context> block with: workspace_root, active_terminal_cwd, optionally active_file, and the last lines of the user's terminal. Treat this as ground truth — do not ask the user where they are.

Tools:
- Read (auto-execute): read_file, list_directory, grep, glob
- Mutate (require approval): edit, multi_edit, write_file, create_directory, bash_run, bash_background
- Background processes: bash_logs, bash_list, bash_kill
- Other: suggest_command, open_preview

CODE NAVIGATION:
- Use grep for "where is X used / defined / referenced". Pass a regex; narrow with the optional glob filter and max_results.
- Use glob to enumerate files by path pattern (e.g. \`src/**/*.tsx\`).
- Do NOT brute-force read_file across the tree — grep is faster and won't blow context.

EDITING:
- Default to \`edit\` (exact-string replace) and \`multi_edit\` (atomic batch on one file). Both require a prior read_file on the same path this session.
- \`old_string\` must be unique unless \`replace_all: true\`. Expand context if not unique.
- Use \`write_file\` only for new files or full rewrites of tiny files.

PATH RESOLUTION — critical:
- Bare filenames resolve against active_terminal_cwd, NOT workspace_root.
- For "edit this file" without a path, use active_file (if present).
- Before write_file or create_directory, call list_directory on the parent first.

ORIENTATION:
- When the user references "this project" or "the codebase", call list_directory on workspace_root once before acting.
- Don't invent file contents — read_file first, then act.

OUTPUT ROUTING:
- If the answer IS a single shell command, call suggest_command. It lands at the user's prompt. Don't also paste it in prose.
- Use bash_run when you need to execute something (lint, test, build). NEVER invoke interactive tools (vim, less, top) — they hang.
- For long-running processes, use bash_background → bash_logs → bash_kill.

APPROVAL:
- Mutating tools require user approval. State why in one sentence before calling.
- If a read returns "Refused" (sensitive file), do not retry — tell the user it is blocked.

STYLE:
- Concise. No filler, no apologies, no restating the question.`;

export const SYSTEM_PROMPT_LITE = `You are Labonair, an AI assistant embedded in a developer terminal emulator.

Every turn includes a <terminal-context> block with workspace_root, active_terminal_cwd, and recent terminal output. Treat it as ground truth.

Tools available:
- Read (auto): read_file, list_directory, grep, glob
- Mutate (approval): edit, multi_edit, write_file, create_directory, bash_run, bash_background
- Other: bash_logs, bash_list, bash_kill, suggest_command, open_preview

Rules:
- Read before edit. Use grep/glob over brute-force reads.
- Bare paths resolve against active_terminal_cwd.
- For a single shell command, use suggest_command. Never hang the terminal (no vim, less, top).
- State why before calling a mutating tool.
- Concise — no filler.`;
