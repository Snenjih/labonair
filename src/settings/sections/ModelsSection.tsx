import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  AUTOCOMPLETE_PROVIDERS,
  DEFAULT_AUTOCOMPLETE_MODEL,
  MODELS,
  OPENAI_COMPATIBLE_DEFAULT_BASE_URL,
  PROVIDERS,
  getModel,
  getProvider,
  providerNeedsKey,
  type AutocompleteProviderId,
  type ModelId,
  type ProviderId,
} from "@/modules/ai/config";
import { clearKey, getAllKeys, setKey } from "@/modules/ai/lib/keyring";
import { usePreferencesStore } from "@/modules/settings/preferences";
import {
  emitKeysChanged,
  setAutocompleteEnabled,
  setAutocompleteModelId,
  setAutocompleteProvider,
  setDefaultModel,
  setLmstudioBaseURL,
  setLmstudioChatModelId,
  setOpenaiCompatibleBaseURL,
  setOpenaiCompatibleModelId,
} from "@/modules/settings/store";
import { Cancel01Icon, ArrowDown01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useState } from "react";
import { ProviderIcon } from "../components/ProviderIcon";
import { ProviderKeyCard } from "../components/ProviderKeyCard";
import { SectionHeader } from "../components/SectionHeader";

type KeysMap = Record<ProviderId, string | null>;

export function ModelsSection() {
  const [keys, setKeys] = useState<KeysMap | null>(null);
  const defaultModel = usePreferencesStore((s) => s.defaultModelId);

  useEffect(() => {
    void getAllKeys().then(setKeys);
  }, []);

  const onSave = async (provider: ProviderId, value: string) => {
    await setKey(provider, value);
    setKeys((prev) => (prev ? { ...prev, [provider]: value } : prev));
    await emitKeysChanged();
  };

  const onClear = async (provider: ProviderId) => {
    await clearKey(provider);
    setKeys((prev) => (prev ? { ...prev, [provider]: null } : prev));
    await emitKeysChanged();
  };

  if (!keys) {
    return <div className="text-[12px] text-muted-foreground">Loading…</div>;
  }

  const defaultModelInfo = getModel(defaultModel);

  // Only count cloud providers toward the "N of M configured" badge
  const keyedProviders = PROVIDERS.filter(
    (p) => providerNeedsKey(p.id) && p.id !== "openai-compatible",
  );
  const configuredCount = keyedProviders.filter((p) => !!keys[p.id]).length;

  return (
    <div className="flex flex-col gap-7">
      <SectionHeader
        title="Models"
        description="Bring your own keys. They live in your OS keychain and are used only by Nexum."
      />

      {/* Default model dropdown — includes all providers */}
      <div className="flex flex-col gap-2">
        <Label>Default model</Label>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              className="h-9 justify-between gap-2 px-2.5 text-[12px]"
            >
              <span className="flex items-center gap-2">
                <ProviderIcon provider={defaultModelInfo.provider} size={14} />
                <span>{defaultModelInfo.label}</span>
                <span className="text-muted-foreground">
                  · {defaultModelInfo.hint}
                </span>
              </span>
              <HugeiconsIcon
                icon={ArrowDown01Icon}
                size={12}
                strokeWidth={2}
                className="opacity-70"
              />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[260px]">
            {PROVIDERS.map((p) => {
              const models = MODELS.filter((m) => m.provider === p.id);
              // Cloud providers need a key; local/compatible providers are always enabled
              const hasKey = providerNeedsKey(p.id) ? !!keys[p.id] : true;
              const isEnabled =
                p.id === "openai-compatible" || p.id === "lmstudio"
                  ? true
                  : hasKey;
              return (
                <div key={p.id} className="px-1 pt-1.5">
                  <div className="mb-1 flex items-center gap-1.5 px-2 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
                    <ProviderIcon provider={p.id} size={11} />
                    <span>{p.label}</span>
                    {!hasKey &&
                      p.id !== "lmstudio" &&
                      p.id !== "openai-compatible" && (
                        <span className="ml-auto text-[9.5px] normal-case tracking-normal text-muted-foreground/70">
                          no key
                        </span>
                      )}
                  </div>
                  {models.map((m) => (
                    <DropdownMenuItem
                      key={m.id}
                      disabled={!isEnabled}
                      onSelect={() =>
                        isEnabled && void setDefaultModel(m.id as ModelId)
                      }
                      className={cn(
                        "flex items-center justify-between gap-2 text-[12px]",
                        m.id === defaultModel && "bg-accent/50",
                      )}
                    >
                      <span className="flex flex-col">
                        <span>{m.label}</span>
                        <span className="text-[10px] text-muted-foreground">
                          {m.hint}
                        </span>
                      </span>
                    </DropdownMenuItem>
                  ))}
                </div>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* API keys grid — excludes openai-compatible (has its own block) */}
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <Label>API keys</Label>
          <span className="text-[10.5px] text-muted-foreground">
            {configuredCount} of {keyedProviders.length} configured
          </span>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {PROVIDERS.filter(
            (p) => providerNeedsKey(p.id) && p.id !== "openai-compatible",
          ).map((p) => (
            <ProviderKeyCard
              key={p.id}
              provider={p}
              currentKey={keys[p.id]}
              onSave={(v: string) => onSave(p.id, v)}
              onClear={() => onClear(p.id)}
            />
          ))}
        </div>
      </div>

      {/* Local providers */}
      <LmStudioChatBlock />
      <OpenAICompatibleBlock
        keys={keys}
        onSaveKey={(v) => onSave("openai-compatible", v)}
        onClearKey={() => onClear("openai-compatible")}
      />

      <AutocompleteBlock keys={keys} />
    </div>
  );
}

function LmStudioChatBlock() {
  const baseURL = usePreferencesStore((s) => s.lmstudioBaseURL);
  const chatModelId = usePreferencesStore((s) => s.lmstudioChatModelId);

  const [urlDraft, setUrlDraft] = useState(baseURL);
  const [modelDraft, setModelDraft] = useState(chatModelId);
  const [testStatus, setTestStatus] = useState<"idle" | "testing" | "ok" | "fail">("idle");
  const [saving, setSaving] = useState(false);

  useEffect(() => setUrlDraft(baseURL), [baseURL]);
  useEffect(() => setModelDraft(chatModelId), [chatModelId]);
  useEffect(() => setTestStatus("idle"), [urlDraft]);

  const canSave = urlDraft.trim().length > 0 && modelDraft.trim().length > 0;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    await setLmstudioBaseURL(urlDraft.trim());
    await setLmstudioChatModelId(modelDraft.trim());
    setSaving(false);
  };

  const handleTest = async () => {
    if (testStatus === "testing") return;
    setTestStatus("testing");
    try {
      const url = urlDraft.replace(/\/$/, "") + "/models";
      const res = await fetch(url, { method: "GET" });
      setTestStatus(res.ok ? "ok" : "fail");
    } catch {
      setTestStatus("fail");
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <Label>Local — LM Studio</Label>
        <span className="text-[10.5px] leading-relaxed text-muted-foreground">
          Run any GGUF model on your machine via LM Studio's HTTP server. Enable
          the server in LM Studio → Developer tab.
        </span>
      </div>
      <div className="flex flex-col gap-2 rounded-lg border border-border/60 bg-card/60 px-3 py-2.5">
        <div className="flex flex-col gap-1.5">
          <Label>Base URL</Label>
          <Input
            value={urlDraft}
            onChange={(e) => setUrlDraft(e.target.value)}
            placeholder="http://localhost:1234/v1"
            spellCheck={false}
            className="h-8 font-mono text-[11.5px]"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Model ID</Label>
          <Input
            value={modelDraft}
            onChange={(e) => setModelDraft(e.target.value)}
            placeholder="e.g. qwen2.5-coder-7b-instruct"
            spellCheck={false}
            className="h-8 font-mono text-[11.5px]"
          />
          <span className="text-[10.5px] text-muted-foreground">
            Enter the model ID that's loaded in LM Studio — e.g. shown on the
            server's /v1/models page.
          </span>
        </div>
        {testStatus === "ok" && (
          <span className="text-[10.5px] text-emerald-500">
            Connected — server responded.
          </span>
        )}
        {testStatus === "fail" && (
          <span className="text-[10.5px] text-destructive">
            Could not reach the server. Is LM Studio running?
          </span>
        )}
        {testStatus === "testing" && (
          <span className="text-[10.5px] text-muted-foreground">Testing…</span>
        )}
        <div className="flex justify-end gap-1.5">
          <Button
            size="sm"
            variant="outline"
            onClick={() => void handleTest()}
            disabled={!urlDraft.trim() || testStatus === "testing"}
            className="h-8 px-2.5 text-[11px]"
          >
            Test
          </Button>
          <Button
            size="sm"
            onClick={() => void handleSave()}
            disabled={!canSave || saving}
            className="h-8 px-2.5 text-[11px]"
          >
            {saving && <Spinner className="mr-1 size-3" />}
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}

function OpenAICompatibleBlock({
  keys,
  onSaveKey,
  onClearKey,
}: {
  keys: KeysMap;
  onSaveKey: (v: string) => Promise<void>;
  onClearKey: () => Promise<void>;
}) {
  const baseURL = usePreferencesStore((s) => s.openaiCompatibleBaseURL);
  const modelId = usePreferencesStore((s) => s.openaiCompatibleModelId);
  const currentApiKey = keys["openai-compatible"];

  const [urlDraft, setUrlDraft] = useState(baseURL);
  const [modelDraft, setModelDraft] = useState(modelId);
  const [keyDraft, setKeyDraft] = useState("");
  const [testStatus, setTestStatus] = useState<"idle" | "testing" | "ok" | "fail">("idle");
  const [saving, setSaving] = useState(false);

  useEffect(() => setUrlDraft(baseURL), [baseURL]);
  useEffect(() => setModelDraft(modelId), [modelId]);
  useEffect(() => setTestStatus("idle"), [urlDraft]);

  const canSave = urlDraft.trim().length > 0 && modelDraft.trim().length > 0;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    await setOpenaiCompatibleBaseURL(urlDraft.trim());
    await setOpenaiCompatibleModelId(modelDraft.trim());
    if (keyDraft.trim()) {
      await onSaveKey(keyDraft.trim());
      setKeyDraft("");
    }
    setSaving(false);
  };

  const handleTest = async () => {
    if (testStatus === "testing") return;
    setTestStatus("testing");
    try {
      const headers: Record<string, string> = {};
      const key = keyDraft.trim() || currentApiKey;
      if (key) headers["Authorization"] = `Bearer ${key}`;
      const url = urlDraft.replace(/\/$/, "") + "/models";
      const res = await fetch(url, { method: "GET", headers });
      setTestStatus(res.ok ? "ok" : "fail");
    } catch {
      setTestStatus("fail");
    }
  };

  const handleClearKey = async () => {
    setKeyDraft("");
    await onClearKey();
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <Label>OpenAI-compatible endpoint</Label>
        <span className="text-[10.5px] leading-relaxed text-muted-foreground">
          Any OpenAI-compatible HTTPS endpoint — vLLM, Z.AI, Fireworks, hosted
          Ollama, etc.
        </span>
      </div>
      <div className="flex flex-col gap-2 rounded-lg border border-border/60 bg-card/60 px-3 py-2.5">
        <div className="flex flex-col gap-1.5">
          <Label>Base URL</Label>
          <Input
            value={urlDraft}
            onChange={(e) => setUrlDraft(e.target.value)}
            placeholder={OPENAI_COMPATIBLE_DEFAULT_BASE_URL}
            spellCheck={false}
            className="h-8 font-mono text-[11.5px]"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Model ID</Label>
          <Input
            value={modelDraft}
            onChange={(e) => setModelDraft(e.target.value)}
            placeholder="e.g. Meta-Llama-3-8B-Instruct-4bit"
            spellCheck={false}
            className="h-8 font-mono text-[11.5px]"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>
            API key{" "}
            <span className="text-muted-foreground">(optional)</span>
          </Label>
          <div className="flex gap-1.5">
            <Input
              type="password"
              value={keyDraft}
              onChange={(e) => setKeyDraft(e.target.value)}
              placeholder={
                currentApiKey ? "••••••••" : "Leave blank if not needed"
              }
              autoComplete="off"
              spellCheck={false}
              className="h-8 flex-1 font-mono text-[11.5px]"
            />
            {(keyDraft || currentApiKey) && (
              <Button
                size="icon"
                variant="ghost"
                onClick={() => void handleClearKey()}
                className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
                title="Clear API key"
              >
                <HugeiconsIcon
                  icon={Cancel01Icon}
                  size={12}
                  strokeWidth={1.75}
                />
              </Button>
            )}
          </div>
          {currentApiKey && !keyDraft && (
            <span className="text-[10.5px] text-emerald-500">
              API key stored in keychain.
            </span>
          )}
        </div>
        {testStatus === "ok" && (
          <span className="text-[10.5px] text-emerald-500">
            Connected — endpoint responded.
          </span>
        )}
        {testStatus === "fail" && (
          <span className="text-[10.5px] text-destructive">
            Could not reach the endpoint. Check the URL and key.
          </span>
        )}
        {testStatus === "testing" && (
          <span className="text-[10.5px] text-muted-foreground">Testing…</span>
        )}
        <div className="flex justify-end gap-1.5">
          <Button
            size="sm"
            variant="outline"
            onClick={() => void handleTest()}
            disabled={!urlDraft.trim() || testStatus === "testing"}
            className="h-8 px-2.5 text-[11px]"
          >
            Test
          </Button>
          <Button
            size="sm"
            onClick={() => void handleSave()}
            disabled={!canSave || saving}
            className="h-8 px-2.5 text-[11px]"
          >
            {saving && <Spinner className="mr-1 size-3" />}
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}

function AutocompleteBlock({ keys }: { keys: KeysMap }) {
  const enabled = usePreferencesStore((s) => s.autocompleteEnabled);
  const provider = usePreferencesStore((s) => s.autocompleteProvider);
  const modelId = usePreferencesStore((s) => s.autocompleteModelId);
  const lmstudioBaseURL = usePreferencesStore((s) => s.lmstudioBaseURL);

  const [modelDraft, setModelDraft] = useState(modelId);
  const [urlDraft, setUrlDraft] = useState(lmstudioBaseURL);
  const [testStatus, setTestStatus] = useState<
    "idle" | "testing" | "ok" | "fail"
  >("idle");

  useEffect(() => setModelDraft(modelId), [modelId]);
  useEffect(() => setUrlDraft(lmstudioBaseURL), [lmstudioBaseURL]);

  const onProviderChange = (next: AutocompleteProviderId) => {
    void setAutocompleteProvider(next);
    const knownDefaults = Object.values(DEFAULT_AUTOCOMPLETE_MODEL);
    if (knownDefaults.includes(modelId)) {
      void setAutocompleteModelId(DEFAULT_AUTOCOMPLETE_MODEL[next]);
    }
  };

  const providerInfo = getProvider(provider);
  const hasKey = providerNeedsKey(provider) ? !!keys[provider] : true;

  const testLmStudio = async () => {
    setTestStatus("testing");
    try {
      const url = urlDraft.replace(/\/$/, "") + "/models";
      const res = await fetch(url, { method: "GET" });
      setTestStatus(res.ok ? "ok" : "fail");
    } catch {
      setTestStatus("fail");
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-0.5">
          <Label>Editor autocomplete</Label>
          <span className="text-[10.5px] leading-relaxed text-muted-foreground">
            Inline ghost-text suggestions in the code editor. Powered by
            ultra-fast inference (Cerebras / Groq) or a local LM Studio server.
          </span>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={(v) => void setAutocompleteEnabled(v)}
        />
      </div>

      <div className="flex flex-col gap-2 rounded-lg border border-border/60 bg-card/60 px-3 py-2.5">
        <div className="flex flex-col gap-1.5">
          <Label>Provider</Label>
          <Select
            value={provider}
            onValueChange={(v) => onProviderChange(v as AutocompleteProviderId)}
          >
            <SelectTrigger className="h-8 w-full text-[11.5px]">
              <SelectValue>
                <span className="flex items-center gap-1.5">
                  <ProviderIcon provider={provider} size={12} />
                  <span>{providerInfo.label}</span>
                </span>
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {AUTOCOMPLETE_PROVIDERS.map((id) => {
                const info = getProvider(id);
                return (
                  <SelectItem key={id} value={id}>
                    <span className="flex items-center gap-1.5">
                      <ProviderIcon provider={id} size={12} />
                      <span>{info.label}</span>
                    </span>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          {!hasKey ? (
            <span className="text-[10.5px] text-amber-500">
              No API key configured for {providerInfo.label}. Add one above.
            </span>
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Model</Label>
          <Input
            value={modelDraft}
            onChange={(e) => setModelDraft(e.target.value)}
            onBlur={() => {
              const v = modelDraft.trim();
              if (v && v !== modelId) void setAutocompleteModelId(v);
            }}
            placeholder={DEFAULT_AUTOCOMPLETE_MODEL[provider]}
            spellCheck={false}
            className="h-8 font-mono text-[11.5px]"
          />
        </div>

        {provider === "lmstudio" ? (
          <div className="flex flex-col gap-1.5">
            <Label>LM Studio base URL</Label>
            <div className="flex gap-1.5">
              <Input
                value={urlDraft}
                onChange={(e) => setUrlDraft(e.target.value)}
                onBlur={() => {
                  const v = urlDraft.trim();
                  if (v && v !== lmstudioBaseURL) void setLmstudioBaseURL(v);
                }}
                placeholder="http://localhost:1234/v1"
                spellCheck={false}
                className="h-8 flex-1 font-mono text-[11.5px]"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => void testLmStudio()}
                className="h-8 px-2.5 text-[11px]"
              >
                Test
              </Button>
            </div>
            {testStatus === "ok" ? (
              <span className="text-[10.5px] text-emerald-500">
                Connected — server responded.
              </span>
            ) : testStatus === "fail" ? (
              <span className="text-[10.5px] text-destructive">
                Could not reach the server. Is LM Studio running?
              </span>
            ) : testStatus === "testing" ? (
              <span className="text-[10.5px] text-muted-foreground">
                Testing…
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[11px] font-medium tracking-tight text-muted-foreground">
      {children}
    </span>
  );
}
