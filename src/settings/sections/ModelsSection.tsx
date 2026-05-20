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
import {
  Cancel01Icon,
  ArrowDown01Icon,
  Settings01Icon,
  ComputerIcon,
} from "@hugeicons/core-free-icons";
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

      {/* Default model */}
      <div className="flex flex-col gap-2">
        <Label>Default model</Label>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              className="h-9 justify-between gap-2 px-2.5 text-[12px]"
            >
              <span className="flex items-center gap-2">
                {defaultModelInfo.provider === "lmstudio" ||
                defaultModelInfo.provider === "openai-compatible" ? (
                  <HugeiconsIcon
                    icon={
                      defaultModelInfo.provider === "openai-compatible"
                        ? Settings01Icon
                        : ComputerIcon
                    }
                    size={14}
                    strokeWidth={1.75}
                    className="text-muted-foreground"
                  />
                ) : (
                  <ProviderIcon provider={defaultModelInfo.provider} size={14} />
                )}
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

      {/* Cloud provider keys */}
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <Label>Cloud providers</Label>
          <span className="text-[10.5px] text-muted-foreground">
            {configuredCount} of {keyedProviders.length} configured
          </span>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {keyedProviders.map((p) => (
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

/* ── Row layout helper for local provider cards ───────────────────── */

function FieldRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-[72px] shrink-0 text-[11px] text-muted-foreground">
        {label}
      </span>
      <div className="flex flex-1 items-center gap-1.5">{children}</div>
    </div>
  );
}

/* ── LM Studio main-chat block ───────────────────────────────────── */

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
      const res = await fetch(urlDraft.replace(/\/$/, "") + "/models", {
        method: "GET",
      });
      setTestStatus(res.ok ? "ok" : "fail");
    } catch {
      setTestStatus("fail");
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-0.5">
        <Label>Local — LM Studio</Label>
        <span className="text-[10.5px] leading-relaxed text-muted-foreground">
          Run any GGUF model on your machine via LM Studio's HTTP server. Enable
          the server in LM Studio → Developer tab.
        </span>
      </div>
      <div className="flex flex-col gap-0 divide-y divide-border/50 rounded-lg border border-border/50 bg-card/50 px-3 py-0 overflow-hidden">
        <div className="py-2.5">
          <FieldRow label="Base URL">
            <Input
              value={urlDraft}
              onChange={(e) => setUrlDraft(e.target.value)}
              placeholder="http://localhost:1234/v1"
              spellCheck={false}
              className="h-8 flex-1 font-mono text-[11.5px]"
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => void handleTest()}
              disabled={!urlDraft.trim() || testStatus === "testing"}
              className="h-8 shrink-0 px-2.5 text-[11px]"
            >
              {testStatus === "testing" ? (
                <Spinner className="size-3" />
              ) : (
                "Test"
              )}
            </Button>
            <Button
              size="sm"
              onClick={() => void handleSave()}
              disabled={!canSave || saving}
              className="h-8 shrink-0 px-2.5 text-[11px]"
            >
              {saving ? <Spinner className="size-3" /> : "Save"}
            </Button>
          </FieldRow>
        </div>
        <div className="py-2.5">
          <FieldRow label="Model ID">
            <Input
              value={modelDraft}
              onChange={(e) => setModelDraft(e.target.value)}
              placeholder="qwen2.5-coder-7b-instruct"
              spellCheck={false}
              className="h-8 flex-1 font-mono text-[11.5px]"
            />
          </FieldRow>
        </div>
        <div className="py-2">
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
          {testStatus === "idle" && (
            <span className="text-[10.5px] text-amber-500">
              Enter the model ID that's loaded in LM Studio — e.g. the one shown on
              the server's /v1/models page.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── OpenAI-compatible block ─────────────────────────────────────── */

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
      const res = await fetch(urlDraft.replace(/\/$/, "") + "/models", {
        method: "GET",
        headers,
      });
      setTestStatus(res.ok ? "ok" : "fail");
    } catch {
      setTestStatus("fail");
    }
  };

  const handleClearKey = async () => {
    setKeyDraft("");
    await onClearKey();
  };

  const maskedKey = currentApiKey
    ? `${currentApiKey.slice(0, 4)}${"•".repeat(9)}${currentApiKey.slice(-4)}`
    : null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-0.5">
        <Label>OpenAI-compatible endpoint</Label>
        <span className="text-[10.5px] leading-relaxed text-muted-foreground">
          Any OpenAI-compatible HTTPS endpoint — vLLM, Z.AI, Fireworks, hosted
          Ollama, etc.
        </span>
      </div>
      <div className="flex flex-col gap-0 divide-y divide-border/50 rounded-lg border border-border/50 bg-card/50 px-3 py-0 overflow-hidden">
        <div className="py-2.5">
          <FieldRow label="Base URL">
            <Input
              value={urlDraft}
              onChange={(e) => setUrlDraft(e.target.value)}
              placeholder={OPENAI_COMPATIBLE_DEFAULT_BASE_URL}
              spellCheck={false}
              className="h-8 flex-1 font-mono text-[11.5px]"
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => void handleTest()}
              disabled={!urlDraft.trim() || testStatus === "testing"}
              className="h-8 shrink-0 px-2.5 text-[11px]"
            >
              {testStatus === "testing" ? (
                <Spinner className="size-3" />
              ) : (
                "Test"
              )}
            </Button>
            <Button
              size="sm"
              onClick={() => void handleSave()}
              disabled={!canSave || saving}
              className="h-8 shrink-0 px-2.5 text-[11px]"
            >
              {saving ? <Spinner className="size-3" /> : "Save"}
            </Button>
          </FieldRow>
        </div>
        <div className="py-2.5">
          <FieldRow label="Model ID">
            <Input
              value={modelDraft}
              onChange={(e) => setModelDraft(e.target.value)}
              placeholder="e.g. Meta-Llama-3-8B-Instruct-4bit"
              spellCheck={false}
              className="h-8 flex-1 font-mono text-[11.5px]"
            />
          </FieldRow>
        </div>
        <div className="py-2.5">
          <FieldRow label="API key">
            <div className="relative flex-1">
              <Input
                type="text"
                autoComplete="off"
                spellCheck={false}
                value={keyDraft}
                onChange={(e) => setKeyDraft(e.target.value)}
                placeholder={maskedKey ?? "Leave blank if not needed"}
                className="h-8 font-mono text-[11.5px]"
              />
            </div>
            {(keyDraft || currentApiKey) && (
              <button
                type="button"
                onClick={() => void handleClearKey()}
                className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
                title="Clear API key"
              >
                <HugeiconsIcon
                  icon={Cancel01Icon}
                  size={14}
                  strokeWidth={1.75}
                />
              </button>
            )}
          </FieldRow>
        </div>
        {(testStatus === "ok" || testStatus === "fail") && (
          <div className="py-2">
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
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Editor autocomplete block ───────────────────────────────────── */

function AutocompleteBlock({ keys }: { keys: KeysMap }) {
  const enabled = usePreferencesStore((s) => s.autocompleteEnabled);
  const provider = usePreferencesStore((s) => s.autocompleteProvider);
  const modelId = usePreferencesStore((s) => s.autocompleteModelId);
  const lmstudioBaseURL = usePreferencesStore((s) => s.lmstudioBaseURL);

  const [modelDraft, setModelDraft] = useState(modelId);
  const [urlDraft, setUrlDraft] = useState(lmstudioBaseURL);
  const [testStatus, setTestStatus] = useState<"idle" | "testing" | "ok" | "fail">("idle");

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
      const res = await fetch(urlDraft.replace(/\/$/, "") + "/models", {
        method: "GET",
      });
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

      <div className="flex flex-col gap-0 divide-y divide-border/50 rounded-lg border border-border/50 bg-card/50 px-3 py-0 overflow-hidden">
        <div className="py-2.5">
          <FieldRow label="Provider">
            <Select
              value={provider}
              onValueChange={(v) => onProviderChange(v as AutocompleteProviderId)}
            >
              <SelectTrigger className="h-8 flex-1 text-[11.5px]">
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
          </FieldRow>
          {!hasKey && (
            <p className="mt-1.5 pl-[84px] text-[10.5px] text-amber-500">
              No API key configured for {providerInfo.label}. Add one above.
            </p>
          )}
        </div>

        <div className="py-2.5">
          <FieldRow label="Model">
            <Input
              value={modelDraft}
              onChange={(e) => setModelDraft(e.target.value)}
              onBlur={() => {
                const v = modelDraft.trim();
                if (v && v !== modelId) void setAutocompleteModelId(v);
              }}
              placeholder={DEFAULT_AUTOCOMPLETE_MODEL[provider]}
              spellCheck={false}
              className="h-8 flex-1 font-mono text-[11.5px]"
            />
          </FieldRow>
        </div>

        {provider === "lmstudio" && (
          <div className="py-2.5">
            <FieldRow label="Base URL">
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
                className="h-8 shrink-0 px-2.5 text-[11px]"
              >
                Test
              </Button>
            </FieldRow>
            {testStatus === "ok" && (
              <p className="mt-1.5 pl-[84px] text-[10.5px] text-emerald-500">
                Connected — server responded.
              </p>
            )}
            {testStatus === "fail" && (
              <p className="mt-1.5 pl-[84px] text-[10.5px] text-destructive">
                Could not reach the server. Is LM Studio running?
              </p>
            )}
          </div>
        )}
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
