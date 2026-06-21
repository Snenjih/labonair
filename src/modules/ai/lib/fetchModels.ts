import {
  getProviderDefaultBaseUrl,
  providerNeedsKey,
  type DynamicModelInfo,
  type ProviderId,
  type ProviderInstance,
} from "../config";

const CLOUD_TTL_MS = 60 * 60 * 1000;     // 1 hour
const LOCAL_TTL_MS = 5 * 60 * 1000;      // 5 minutes
const OPENROUTER_LIMIT = 200;

const LOCAL_PROVIDERS: readonly ProviderId[] = ["ollama", "lmstudio", "mlx", "openai-compatible"];

export function getTtlForProvider(providerId: ProviderId): number {
  return LOCAL_PROVIDERS.includes(providerId) ? LOCAL_TTL_MS : CLOUD_TTL_MS;
}

function modelIdToLabel(id: string): string {
  return id
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\bGpt\b/g, "GPT")
    .replace(/\bLlm\b/g, "LLM")
    .replace(/\bAi\b/g, "AI");
}

function baseUrlFor(instance: ProviderInstance): string {
  return (
    instance.baseUrl?.replace(/\/$/, "") ||
    getProviderDefaultBaseUrl(instance.providerId).replace(/\/$/, "") ||
    ""
  );
}

// ── OpenAI-compatible /v1/models ───────────────────────────────────────────────

type OaiModel = { id: string; owned_by?: string; object?: string };
type OaiModelsResponse = { data: OaiModel[] };

async function fetchOpenAiCompatible(
  url: string,
  apiKey: string | null,
  instance: ProviderInstance,
  filterFn: (m: OaiModel) => boolean = () => true,
  labelFn: (m: OaiModel) => string = (m) => modelIdToLabel(m.id),
): Promise<DynamicModelInfo[]> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

  const res = await fetch(`${url}/v1/models`, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as OaiModelsResponse;
  if (!Array.isArray(json?.data)) throw new Error("Unexpected response shape");

  return json.data
    .filter(filterFn)
    .slice(0, OPENROUTER_LIMIT)
    .map((m) => ({
      id: m.id,
      provider: instance.providerId,
      label: labelFn(m),
      hint: instance.name !== instance.providerId ? instance.name : instance.providerId,
      instanceId: instance.id,
      source: "api" as const,
    }));
}

// ── Provider-specific filters ──────────────────────────────────────────────────

function openAiFilter(m: OaiModel): boolean {
  const id = m.id.toLowerCase();
  // Keep chat/reasoning models; drop embeddings, dall-e, tts, whisper, moderation
  if (id.includes("embedding") || id.includes("embed")) return false;
  if (id.includes("dall-e") || id.includes("tts") || id.includes("whisper")) return false;
  if (id.includes("moderation") || id.includes("realtime") || id.includes("transcribe")) return false;
  return true;
}

function mistralFilter(m: OaiModel): boolean {
  const id = m.id.toLowerCase();
  if (id.includes("embed")) return false;
  if (id.includes("moderation")) return false;
  return true;
}

function groqFilter(m: OaiModel): boolean {
  const id = m.id.toLowerCase();
  if (id.includes("whisper") || id.includes("distil")) return false;
  return true;
}

// ── Anthropic ─────────────────────────────────────────────────────────────────

type AnthropicModel = { id: string; display_name: string };
type AnthropicModelsResponse = { data: AnthropicModel[] };

async function fetchAnthropic(
  instance: ProviderInstance,
  apiKey: string,
): Promise<DynamicModelInfo[]> {
  const res = await fetch("https://api.anthropic.com/v1/models", {
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as AnthropicModelsResponse;
  if (!Array.isArray(json?.data)) throw new Error("Unexpected response shape");

  return json.data.map((m) => ({
    id: m.id,
    provider: "anthropic" as ProviderId,
    label: m.display_name,
    hint: "Anthropic",
    instanceId: instance.id,
    source: "api" as const,
  }));
}

// ── Google ────────────────────────────────────────────────────────────────────

type GoogleModel = { name: string; displayName: string; supportedGenerationMethods?: string[] };
type GoogleModelsResponse = { models: GoogleModel[] };

async function fetchGoogle(
  instance: ProviderInstance,
  apiKey: string,
): Promise<DynamicModelInfo[]> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`,
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as GoogleModelsResponse;
  if (!Array.isArray(json?.models)) throw new Error("Unexpected response shape");

  return json.models
    .filter((m) => {
      const methods = m.supportedGenerationMethods ?? [];
      return methods.includes("generateContent");
    })
    .map((m) => ({
      id: m.name.replace(/^models\//, ""),
      provider: "google" as ProviderId,
      label: m.displayName,
      hint: "Google",
      instanceId: instance.id,
      source: "api" as const,
    }));
}

// ── Ollama fallback to /api/tags ───────────────────────────────────────────────

type OllamaTag = { name: string };
type OllamaTagsResponse = { models: OllamaTag[] };

async function fetchOllamaFallback(
  baseUrl: string,
  instance: ProviderInstance,
): Promise<DynamicModelInfo[]> {
  const res = await fetch(`${baseUrl}/api/tags`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as OllamaTagsResponse;
  if (!Array.isArray(json?.models)) throw new Error("Unexpected response shape");
  return json.models.map((m) => ({
    id: m.name,
    provider: "ollama" as ProviderId,
    label: modelIdToLabel(m.name),
    hint: "Ollama · local",
    instanceId: instance.id,
    source: "api" as const,
  }));
}

// ── Main entry point ───────────────────────────────────────────────────────────

export async function fetchModelsForInstance(
  instance: ProviderInstance,
  apiKey: string | null,
): Promise<DynamicModelInfo[]> {
  const needsKey = providerNeedsKey(instance.providerId);
  if (needsKey && !apiKey) throw new Error("No API key available");

  switch (instance.providerId) {
    case "anthropic":
      return fetchAnthropic(instance, apiKey!);

    case "google":
      return fetchGoogle(instance, apiKey!);

    case "openai":
      return fetchOpenAiCompatible(
        "https://api.openai.com",
        apiKey,
        instance,
        openAiFilter,
      );

    case "xai":
      return fetchOpenAiCompatible("https://api.x.ai", apiKey, instance);

    case "cerebras":
      return fetchOpenAiCompatible("https://api.cerebras.ai", apiKey, instance);

    case "groq":
      return fetchOpenAiCompatible(
        "https://api.groq.com/openai",
        apiKey,
        instance,
        groqFilter,
      );

    case "deepseek":
      return fetchOpenAiCompatible("https://api.deepseek.com", apiKey, instance);

    case "mistral":
      return fetchOpenAiCompatible(
        "https://api.mistral.ai",
        apiKey,
        instance,
        mistralFilter,
      );

    case "openrouter":
      return fetchOpenAiCompatible(
        "https://openrouter.ai/api",
        apiKey,
        instance,
        () => true,
        (m) => modelIdToLabel(m.id.split("/").pop() ?? m.id),
      );

    case "ollama": {
      const base = baseUrlFor(instance) || "http://localhost:11434";
      try {
        const models = await fetchOpenAiCompatible(base, null, instance);
        if (models.length > 0) return models;
      } catch {
        // /v1/models failed, try /api/tags
      }
      return fetchOllamaFallback(base, instance);
    }

    case "lmstudio":
    case "mlx":
    case "openai-compatible": {
      const base = baseUrlFor(instance);
      if (!base) throw new Error("No base URL configured");
      return fetchOpenAiCompatible(base, apiKey, instance);
    }

    default:
      throw new Error(`No fetch adapter for provider: ${instance.providerId}`);
  }
}
