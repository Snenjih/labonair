import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  PROVIDER_DESCRIPTIONS,
  PROVIDER_DOCS_URLS,
  PROVIDERS,
  providerNeedsKey,
  type ProviderInstance,
} from "@/modules/ai/config";
import {
  getInstanceKey,
  setInstanceKey,
} from "@/modules/ai/lib/keyring";
import { useProvidersStore } from "@/modules/ai/store/providersStore";
import {
  ArrowUpRight01Icon,
  Cancel01Icon,
  ViewIcon,
  ViewOffSlashIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useEffect, useState } from "react";
import { ProviderIcon } from "./ProviderIcon";
import { handleApiError } from "@/lib/errors";

type Props = {
  instance: ProviderInstance;
  /** Count of instances sharing the same providerId (including this one). */
  sameProviderCount: number;
};

function maskKey(key: string): string {
  if (key.length <= 8) return "•".repeat(key.length);
  return `${key.slice(0, 4)}${"•".repeat(Math.min(8, key.length - 8))}${key.slice(-4)}`;
}

export function ProviderInstanceCard({ instance, sameProviderCount }: Props) {
  const update = useProvidersStore((s) => s.update);
  const remove = useProvidersStore((s) => s.remove);
  const reloadKeys = useProvidersStore((s) => s.reloadKeys);

  const providerInfo = PROVIDERS.find((p) => p.id === instance.providerId);
  const needsKey = providerNeedsKey(instance.providerId);
  const isLocal = !needsKey && instance.providerId !== "openrouter";
  const docsUrl = PROVIDER_DOCS_URLS[instance.providerId] ?? providerInfo?.consoleUrl ?? "";
  const description = PROVIDER_DESCRIPTIONS[instance.providerId];
  const showNameField = sameProviderCount > 1 || instance.providerId === "openai-compatible";

  const [currentKey, setCurrentKey] = useState<string | null>(null);
  const [keyDraft, setKeyDraft] = useState("");
  const [reveal, setReveal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<"ok" | "fail" | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Local config drafts
  const [baseUrl, setBaseUrl] = useState(instance.baseUrl ?? "");
  const [localModelId, setLocalModelId] = useState(instance.localModelId ?? "");
  const [contextSize, setContextSize] = useState(String(instance.contextWindowSize ?? 128000));
  const [openrouterModelIds, setOpenrouterModelIds] = useState(instance.openrouterModelIds ?? "");
  const [name, setName] = useState(instance.name);

  useEffect(() => {
    if (needsKey) {
      void getInstanceKey(instance.id).then(setCurrentKey);
    }
  }, [instance.id, needsKey]);

  const handleSaveKey = async () => {
    const trimmed = keyDraft.trim();
    if (!trimmed) { setError("Enter your API key."); return; }
    const prefix = providerInfo?.keyPrefix;
    if (prefix && !trimmed.startsWith(prefix)) {
      setError(`Keys start with "${prefix}".`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await setInstanceKey(instance.id, trimmed);
      setCurrentKey(trimmed);
      setKeyDraft("");
      setReveal(false);
      await reloadKeys();
    } catch (e) {
      setError(`Failed to save: ${String(e)}`);
      handleApiError(e, "Failed to save API key", "AI Providers");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveConfig = async () => {
    setSaving(true);
    setError(null);
    try {
      const patch: Partial<ProviderInstance> = {};
      if (isLocal || instance.providerId === "openrouter" || instance.providerId === "openai-compatible") {
        if (baseUrl !== instance.baseUrl) patch.baseUrl = baseUrl || undefined;
        if (localModelId !== instance.localModelId) patch.localModelId = localModelId || undefined;
      }
      if (instance.providerId === "openai-compatible") {
        const sz = parseInt(contextSize, 10);
        if (!isNaN(sz) && sz !== instance.contextWindowSize) patch.contextWindowSize = sz;
      }
      if (instance.providerId === "openrouter") {
        if (openrouterModelIds !== instance.openrouterModelIds) patch.openrouterModelIds = openrouterModelIds;
      }
      if (needsKey && keyDraft.trim()) {
        const trimmed = keyDraft.trim();
        const prefix = providerInfo?.keyPrefix;
        if (prefix && !trimmed.startsWith(prefix)) {
          setError(`Keys start with "${prefix}".`);
          setSaving(false);
          return;
        }
        await setInstanceKey(instance.id, trimmed);
        setCurrentKey(trimmed);
        setKeyDraft("");
        await reloadKeys();
      }
      if (Object.keys(patch).length > 0) await update(instance.id, patch);
    } catch (e) {
      setError(`Failed to save: ${String(e)}`);
      handleApiError(e, "Failed to save provider config", "AI Providers");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveName = async () => {
    if (name.trim() && name.trim() !== instance.name) {
      await update(instance.id, { name: name.trim() });
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const url = baseUrl.replace(/\/$/, "") + "/models";
      await invoke("shell_run_command", { command: `curl -sf "${url}" -o /dev/null` });
      setTestResult("ok");
    } catch {
      setTestResult("fail");
    } finally {
      setTesting(false);
      setTimeout(() => setTestResult(null), 3000);
    }
  };

  const keyPlaceholder = currentKey
    ? maskKey(currentKey)
    : instance.providerId === "openrouter"
      ? "Optional — leave empty for unauthenticated endpoints"
      : instance.providerId === "openai-compatible"
        ? "Optional — leave empty for unauthenticated endpoints"
        : providerInfo?.keyPrefix
          ? `${providerInfo.keyPrefix}…`
          : "Paste API key";

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border/60 bg-card/60 px-4 py-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2">
          <ProviderIcon provider={instance.providerId} size={15} />
          <span className="text-[13px] font-semibold">
            {instance.providerId === "openai-compatible" &&
             instance.name !== instance.providerId &&
             !/^[a-z-]+\d+$/.test(instance.name)
              ? instance.name
              : (providerInfo?.label ?? instance.providerId)}
          </span>
        </span>
        <span className="flex items-center gap-2">
          {docsUrl && (
            <button
              type="button"
              onClick={() => void openUrl(docsUrl)}
              className="flex items-center gap-0.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
            >
              {needsKey && !isLocal ? "Get key" : "Docs"}
              <HugeiconsIcon icon={ArrowUpRight01Icon} size={10} strokeWidth={2} />
            </button>
          )}
          <button
            type="button"
            onClick={() => void remove(instance.id)}
            className="text-muted-foreground hover:text-foreground transition-colors"
            title="Remove provider"
          >
            <HugeiconsIcon icon={Cancel01Icon} size={13} strokeWidth={2} />
          </button>
        </span>
      </div>

      {/* Description */}
      {description && (
        <p className="text-[11px] text-muted-foreground">{description}</p>
      )}

      {/* Name field (only when >1 instance of same provider) */}
      {showNameField && (
        <div className="flex items-center gap-2">
          <span className="w-20 shrink-0 text-[11.5px] text-muted-foreground">Name</span>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => void handleSaveName()}
            className="h-8 text-[12px]"
            placeholder={instance.providerId === "openai-compatible" ? "e.g. My Company API" : "e.g. openai1"}
          />
        </div>
      )}

      {/* Local/custom provider fields */}
      {(isLocal || instance.providerId === "openai-compatible") && (
        <>
          <div className="flex items-center gap-2">
            <span className="w-20 shrink-0 text-[11.5px] text-muted-foreground">Base URL</span>
            <div className="flex flex-1 gap-1.5">
              <Input
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                className="h-8 flex-1 font-mono text-[11.5px]"
                placeholder="http://localhost:11434/v1"
              />
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-3 text-[11px]"
                onClick={() => void handleTest()}
                disabled={testing || !baseUrl}
              >
                {testing ? <Spinner className="size-3" /> : testResult === "ok" ? "✓" : testResult === "fail" ? "✗" : "Test"}
              </Button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-20 shrink-0 text-[11.5px] text-muted-foreground">Model ID</span>
            <Input
              value={localModelId}
              onChange={(e) => setLocalModelId(e.target.value)}
              className="h-8 flex-1 font-mono text-[11.5px]"
              placeholder={
                instance.providerId === "lmstudio"
                  ? "qwen2.5-coder-7b-instruct"
                  : instance.providerId === "mlx"
                    ? "mlx-community/Qwen2.5-Coder-7B-Instruct-4bit"
                    : instance.providerId === "ollama"
                      ? "qwen2.5-coder:7b"
                      : "gpt-4o, qwen3-max, …"
              }
            />
          </div>
          {instance.providerId === "openai-compatible" && (
            <div className="flex items-center gap-2">
              <span className="w-20 shrink-0 text-[11.5px] text-muted-foreground">Context</span>
              <div className="flex items-center gap-1.5">
                <Input
                  value={contextSize}
                  onChange={(e) => setContextSize(e.target.value)}
                  className="h-8 w-28 font-mono text-[11.5px]"
                  placeholder="128000"
                />
                <span className="text-[11px] text-muted-foreground">tokens</span>
              </div>
            </div>
          )}
        </>
      )}

      {/* OpenRouter model IDs */}
      {instance.providerId === "openrouter" && (
        <div className="flex items-center gap-2">
          <span className="w-20 shrink-0 text-[11.5px] text-muted-foreground">Model ID</span>
          <Input
            value={openrouterModelIds}
            onChange={(e) => setOpenrouterModelIds(e.target.value)}
            className="h-8 flex-1 font-mono text-[11.5px]"
            placeholder="anthropic/claude-sonnet-4-6, openai/gpt-5.5, …"
          />
        </div>
      )}

      {/* API key (cloud + openrouter + openai-compatible) */}
      {(needsKey || instance.providerId === "openai-compatible") && (
        <div className={isLocal ? "" : "flex items-center gap-2"}>
          {!isLocal && (
            <span className="w-20 shrink-0 text-[11.5px] text-muted-foreground">
              {instance.providerId === "openrouter" || instance.providerId === "openai-compatible"
                ? "API key"
                : ""}
            </span>
          )}
          <div className="flex flex-1 gap-1.5">
            <div className="relative flex-1">
              <Input
                type={reveal ? "text" : "password"}
                autoComplete="off"
                spellCheck={false}
                placeholder={keyPlaceholder}
                value={keyDraft}
                disabled={saving}
                onChange={(e) => { setKeyDraft(e.target.value); if (error) setError(null); }}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void (isLocal || instance.providerId === "openrouter" ? handleSaveConfig() : handleSaveKey()); } }}
                className="h-8 pr-8 font-mono text-[11.5px]"
              />
              <button
                type="button"
                onClick={() => setReveal((v) => !v)}
                tabIndex={-1}
                className="absolute top-1/2 right-2.5 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <HugeiconsIcon icon={reveal ? ViewOffSlashIcon : ViewIcon} size={12} strokeWidth={1.75} />
              </button>
            </div>
            <Button
              size="sm"
              onClick={() => void (isLocal || instance.providerId === "openrouter" || instance.providerId === "openai-compatible" ? handleSaveConfig() : handleSaveKey())}
              disabled={saving}
              className="h-8 px-3 text-[11px]"
            >
              {saving ? <Spinner className="mr-1 size-3" /> : null}
              Save
            </Button>
          </div>
        </div>
      )}

      {/* Save button for local providers (no key) */}
      {isLocal && instance.providerId !== "openai-compatible" && (
        <div className="flex justify-end">
          <Button
            size="sm"
            onClick={() => void handleSaveConfig()}
            disabled={saving}
            className="h-8 px-3 text-[11px]"
          >
            {saving ? <Spinner className="mr-1 size-3" /> : null}
            Save
          </Button>
        </div>
      )}

      {/* Footer hint for local providers */}
      {instance.providerId === "lmstudio" && (
        <p className="text-[10.5px] text-muted-foreground">
          The model id loaded in LM Studio — see the server's /v1/models page.
        </p>
      )}
      {instance.providerId === "ollama" && (
        <p className="text-[10.5px] text-muted-foreground">
          The model name from <code className="font-mono">ollama list</code> / <code className="font-mono">ollama pull</code>.
        </p>
      )}
      {instance.providerId === "mlx" && (
        <p className="text-[10.5px] text-muted-foreground">
          The Hugging Face repo path you launched mlx_lm.server with.
        </p>
      )}
      {instance.providerId === "openrouter" && (
        <p className="text-[10.5px] text-muted-foreground">
          Browse ids at openrouter.ai/models.
        </p>
      )}

      {error && <p className="text-[10.5px] text-destructive">{error}</p>}
    </div>
  );
}
