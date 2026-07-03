import { generateText } from "ai";
import { useState } from "react";
import { type ProviderId, providerNeedsKey } from "@/modules/ai/config";
import { buildLanguageModelFromInstance } from "@/modules/ai/lib/agent";
import { useProvidersStore } from "@/modules/ai/store/providersStore";
import { git } from "./gitInvoke";

const COMMIT_MSG_SYSTEM_PROMPT = `You are a git commit message generator. Given a unified diff, produce a single conventional commit message. Format: type(scope): subject. Subject must be under 72 characters. Types: feat, fix, docs, style, refactor, perf, test, chore, ci. Only output the commit message — no explanation, no markdown, no quotes.`;

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

/** Default cheap/fast model IDs per provider for commit message generation. */
const DEFAULT_MODEL_FOR_PROVIDER: Partial<Record<ProviderId, string>> = {
  openai: "gpt-4o-mini",
  anthropic: "claude-haiku-4-5",
  google: "gemini-2.0-flash",
  xai: "grok-3-mini",
  deepseek: "deepseek-chat",
  mistral: "mistral-small-latest",
  groq: "llama-3.3-70b-versatile",
  cerebras: "llama3.1-8b",
  openrouter: "openrouter/auto",
};

export function useAiCommitMessage(repoRoot: string | null, sessionId?: string) {
  const [isGenerating, setIsGenerating] = useState(false);
  const instances = useProvidersStore((s) => s.instances);
  const instanceKeys = useProvidersStore((s) => s.instanceKeys);

  async function generate(): Promise<string | null> {
    if (!repoRoot) return null;
    setIsGenerating(true);
    try {
      // 1. Get staged diff, fall back to unstaged if nothing staged
      let diff = "";
      try {
        diff = await git.getDiff(repoRoot, ".", true, undefined, sessionId);
      } catch {
        // ignore
      }
      if (!diff.trim()) {
        try {
          diff = await git.getDiff(repoRoot, ".", false, undefined, sessionId);
        } catch {
          // ignore
        }
      }
      if (!diff.trim()) return null;

      // 2. Pick the first cloud provider instance that has a key, in preference order
      let selectedInstance = null;
      let selectedModelId = "";

      for (const providerId of PREFERRED_PROVIDERS) {
        const inst = instances.find((i) => i.providerId === providerId);
        if (!inst) continue;
        if (providerNeedsKey(providerId) && !instanceKeys[inst.id]) continue;
        selectedInstance = inst;
        selectedModelId = DEFAULT_MODEL_FOR_PROVIDER[providerId] ?? "";
        break;
      }

      // Fallback: any local provider (lmstudio, mlx, ollama, openai-compatible)
      if (!selectedInstance) {
        for (const inst of instances) {
          if (!providerNeedsKey(inst.providerId)) {
            selectedInstance = inst;
            selectedModelId = inst.localModelId ?? "";
            break;
          }
        }
      }

      if (!selectedInstance) {
        throw new Error("No AI provider configured. Add one in Settings → AI.");
      }

      // 3. Build model and generate commit message
      const key = instanceKeys[selectedInstance.id] ?? null;
      const model = await buildLanguageModelFromInstance(selectedInstance, key, selectedModelId);

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
