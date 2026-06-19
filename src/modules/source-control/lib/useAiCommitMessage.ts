import { useState } from "react";
import { generateText } from "ai";
import { git } from "./gitInvoke";
import { getAllKeys } from "@/modules/ai/lib/keyring";
import { buildLanguageModel } from "@/modules/ai/lib/agent";
import { PROVIDERS, providerNeedsKey, type ProviderId } from "@/modules/ai/config";

const COMMIT_MSG_SYSTEM_PROMPT = `You are a git commit message generator. Given a unified diff, produce a single conventional commit message. Format: type(scope): subject. Subject must be under 72 characters. Types: feat, fix, docs, style, refactor, perf, test, chore, ci. Only output the commit message — no explanation, no markdown, no quotes.`;

/** Picks the first cloud provider that has a key configured, in order. */
const PREFERRED_PROVIDERS: ProviderId[] = [
  "openai",
  "anthropic",
  "google",
  "xai",
  "deepseek",
  "mistral",
  "groq",
  "cerebras",
  "openrouter",
];

/** Default model IDs for each provider — cheap/fast choices preferred. */
const DEFAULT_MODEL_FOR_PROVIDER: Partial<Record<ProviderId, string>> = {
  openai: "gpt-4.1-mini",
  anthropic: "claude-haiku-4-5",
  google: "gemini-2.0-flash",
  xai: "grok-3-mini",
  deepseek: "deepseek-chat",
  mistral: "mistral-small-latest",
  groq: "llama-3.3-70b-versatile",
  cerebras: "llama3.1-8b",
  openrouter: "openrouter/auto",
};

export function useAiCommitMessage(repoRoot: string | null) {
  const [isGenerating, setIsGenerating] = useState(false);

  async function generate(): Promise<string | null> {
    if (!repoRoot) return null;
    setIsGenerating(true);
    try {
      // 1. Get staged diff, fall back to unstaged if nothing staged
      let diff = "";
      try {
        diff = await git.getDiff(repoRoot, ".", true);
      } catch {
        // ignore
      }
      if (!diff.trim()) {
        try {
          diff = await git.getDiff(repoRoot, ".", false);
        } catch {
          // ignore
        }
      }
      if (!diff.trim()) return null;

      // 2. Get all configured provider keys
      const keys = await getAllKeys();

      // 3. Pick the first provider that has a key
      let selectedProvider: ProviderId | null = null;
      let selectedModelId = "";
      for (const providerId of PREFERRED_PROVIDERS) {
        if (providerNeedsKey(providerId) && keys[providerId]) {
          selectedProvider = providerId;
          selectedModelId = DEFAULT_MODEL_FOR_PROVIDER[providerId] ?? "";
          break;
        }
      }

      // Also check keyless providers (lmstudio, mlx, ollama) from PROVIDERS list
      if (!selectedProvider) {
        for (const p of PROVIDERS) {
          if (!providerNeedsKey(p.id)) {
            selectedProvider = p.id;
            selectedModelId = DEFAULT_MODEL_FOR_PROVIDER[p.id] ?? "";
            break;
          }
        }
      }

      if (!selectedProvider) {
        throw new Error("No AI API key configured. Add one in Settings → AI.");
      }

      // 4. Build model and generate commit message
      const model = await buildLanguageModel(
        selectedProvider,
        keys,
        selectedModelId,
      );

      const { text } = await generateText({
        model,
        system: COMMIT_MSG_SYSTEM_PROMPT,
        prompt: diff.slice(0, 10_000),
      });

      return text.trim();
    } finally {
      setIsGenerating(false);
    }
  }

  return { generate, isGenerating };
}
