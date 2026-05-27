import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { AGENT_ICONS } from "@/modules/ai/components/AgentSwitcher";
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
import {
  BUILTIN_AGENTS,
  type Agent,
  type AgentIconId,
} from "@/modules/ai/lib/agents";
import {
  isValidHandle,
  normalizeHandle,
  type Directive,
} from "@/modules/ai/lib/directives";
import { newAgentId, useAgentsStore } from "@/modules/ai/store/agentsStore";
import {
  newDirectiveId,
  useDirectivesStore,
} from "@/modules/ai/store/directivesStore";
import { usePreferencesStore } from "@/modules/settings/preferences";
import {
  emitKeysChanged,
  setAiEnabled,
  setAutocompleteEnabled,
  setAutocompleteModelId,
  setAutocompleteProvider,
  setCustomInstructions,
  setDefaultModel,
  setLmstudioBaseURL,
  setLmstudioChatModelId,
  setOpenaiCompatibleBaseURL,
  setOpenaiCompatibleModelId,
  setShowEditPrediction,
  setAiWarnDestructiveCommands,
  setAiMaxAgentSteps,
  setAiTerminalContextLines,
  setAiTemperature,
} from "@/modules/settings/store";
import {
  Add01Icon,
  ArrowDown01Icon,
  Cancel01Icon,
  CheckmarkCircle02Icon,
  ComputerIcon,
  Delete02Icon,
  Edit02Icon,
  Settings01Icon,
  SparklesIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useRef, useState } from "react";
import { ProviderIcon } from "../components/ProviderIcon";
import { ProviderKeyCard } from "../components/ProviderKeyCard";
import { SectionHeader } from "../components/SectionHeader";
import { SettingRow } from "../components/SettingRow";

type KeysMap = Record<ProviderId, string | null>;

const ICON_OPTIONS: AgentIconId[] = [
  "coder",
  "architect",
  "reviewer",
  "security",
  "designer",
  "spark",
];

function SubSectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[13px] font-semibold tracking-tight text-foreground">
      {children}
    </h3>
  );
}

function SectionDivider() {
  return <div className="border-t border-border/40" />;
}

export function AiSection() {
  const [keys, setKeys] = useState<KeysMap | null>(null);

  useEffect(() => {
    void getAllKeys().then(setKeys);
  }, []);

  const onSaveKey = async (provider: ProviderId, value: string) => {
    await setKey(provider, value);
    setKeys((prev) => (prev ? { ...prev, [provider]: value } : prev));
    await emitKeysChanged();
  };

  const onClearKey = async (provider: ProviderId) => {
    await clearKey(provider);
    setKeys((prev) => (prev ? { ...prev, [provider]: null } : prev));
    await emitKeysChanged();
  };

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title="AI"
        description="Configure AI features, models, edit predictions, agents, and directives."
      />

      {/* General */}
      <div className="flex flex-col gap-4">
        <SubSectionTitle>General</SubSectionTitle>
        <GeneralContent />
      </div>

      <SectionDivider />

      {/* Behaviour */}
      <div className="flex flex-col gap-4">
        <SubSectionTitle>Behaviour</SubSectionTitle>
        <BehaviourContent />
      </div>

      <SectionDivider />

      {/* Models */}
      <div className="flex flex-col gap-4">
        <SubSectionTitle>Models</SubSectionTitle>
        {keys ? (
          <ModelsContent keys={keys} onSaveKey={onSaveKey} onClearKey={onClearKey} />
        ) : (
          <div className="text-[12px] text-muted-foreground">Loading…</div>
        )}
      </div>

      <SectionDivider />

      {/* Edit Prediction */}
      <div className="flex flex-col gap-4">
        <SubSectionTitle>Edit Prediction</SubSectionTitle>
        <EditPredictionContent keys={keys} />
      </div>

      <SectionDivider />

      {/* Agents */}
      <div className="flex flex-col gap-4">
        <SubSectionTitle>Agents</SubSectionTitle>
        <AgentsContent />
      </div>

      <SectionDivider />

      {/* Directives */}
      <div className="flex flex-col gap-4">
        <SubSectionTitle>Directives</SubSectionTitle>
        <DirectivesContent />
      </div>
    </div>
  );
}

/* ── General ─────────────────────────────────────────────────────── */

function GeneralContent() {
  const aiEnabled = usePreferencesStore((s) => s.aiEnabled);
  const aiWarnDestructiveCommands = usePreferencesStore((s) => s.aiWarnDestructiveCommands);
  return (
    <div className="flex flex-col gap-4">
      <SettingRow
        title="Disable AI"
        description="Turn off all AI features across the app. The AI panel, input bar, and autocomplete will be hidden."
      >
        <Switch
          checked={!aiEnabled}
          onCheckedChange={(v) => void setAiEnabled(!v)}
        />
      </SettingRow>
      <SettingRow
        title="Warn on destructive commands"
        description="Show an amber warning badge on the approval card when the AI tries to run rm -rf, DROP TABLE, git reset --hard, or similar."
      >
        <Switch
          checked={aiWarnDestructiveCommands}
          onCheckedChange={(v) => void setAiWarnDestructiveCommands(v)}
        />
      </SettingRow>
    </div>
  );
}

/* ── Behaviour ───────────────────────────────────────────────────── */

function BehaviourContent() {
  const aiMaxAgentSteps = usePreferencesStore((s) => s.aiMaxAgentSteps);
  const aiTerminalContextLines = usePreferencesStore((s) => s.aiTerminalContextLines);
  const aiTemperature = usePreferencesStore((s) => s.aiTemperature);

  return (
    <div className="flex flex-col gap-3">
      <SettingRow
        title="Max agent steps"
        description="Maximum number of tool-use steps the agent may take before stopping. Lower = faster, more predictable. Higher = can handle complex multi-step tasks."
      >
        <NumInput
          value={aiMaxAgentSteps}
          min={5}
          max={50}
          step={1}
          onChange={(v) => void setAiMaxAgentSteps(v)}
        />
      </SettingRow>
      <SettingRow
        title="Temperature"
        description="Controls response creativity. 0.0 = deterministic, 1.0 = more varied. Default 0.7."
      >
        <NumInput
          value={aiTemperature}
          min={0}
          max={1}
          step={0.1}
          onChange={(v) => void setAiTemperature(Math.round(v * 10) / 10)}
        />
      </SettingRow>
      <SettingRow
        title="Terminal context lines"
        description="How many lines of terminal output are sent to the AI with each message."
      >
        <NumInput
          value={aiTerminalContextLines}
          min={50}
          max={1000}
          step={50}
          onChange={(v) => void setAiTerminalContextLines(v)}
        />
      </SettingRow>
    </div>
  );
}

/* ── Models ──────────────────────────────────────────────────────── */

function ModelsContent({
  keys,
  onSaveKey,
  onClearKey,
}: {
  keys: KeysMap;
  onSaveKey: (p: ProviderId, v: string) => Promise<void>;
  onClearKey: (p: ProviderId) => Promise<void>;
}) {
  const defaultModel = usePreferencesStore((s) => s.defaultModelId);

  const defaultModelInfo = getModel(defaultModel);
  const keyedProviders = PROVIDERS.filter(
    (p) => providerNeedsKey(p.id) && p.id !== "openai-compatible",
  );
  const configuredCount = keyedProviders.filter((p) => !!keys[p.id]).length;

  return (
    <div className="flex flex-col gap-7">
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
                <span className="text-muted-foreground">· {defaultModelInfo.hint}</span>
              </span>
              <HugeiconsIcon icon={ArrowDown01Icon} size={12} strokeWidth={2} className="opacity-70" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[260px]">
            {PROVIDERS.map((p) => {
              const models = MODELS.filter((m) => m.provider === p.id);
              const hasKey = providerNeedsKey(p.id) ? !!keys[p.id] : true;
              const isEnabled =
                p.id === "openai-compatible" || p.id === "lmstudio" ? true : hasKey;
              return (
                <div key={p.id} className="px-1 pt-1.5">
                  <div className="mb-1 flex items-center gap-1.5 px-2 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
                    <ProviderIcon provider={p.id} size={11} />
                    <span>{p.label}</span>
                    {!hasKey && p.id !== "lmstudio" && p.id !== "openai-compatible" && (
                      <span className="ml-auto text-[9.5px] normal-case tracking-normal text-muted-foreground/70">
                        no key
                      </span>
                    )}
                  </div>
                  {models.map((m) => (
                    <DropdownMenuItem
                      key={m.id}
                      disabled={!isEnabled}
                      onSelect={() => isEnabled && void setDefaultModel(m.id as ModelId)}
                      className={cn(
                        "flex items-center justify-between gap-2 text-[12px]",
                        m.id === defaultModel && "bg-accent/50",
                      )}
                    >
                      <span className="flex flex-col">
                        <span>{m.label}</span>
                        <span className="text-[10px] text-muted-foreground">{m.hint}</span>
                      </span>
                    </DropdownMenuItem>
                  ))}
                </div>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

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
              onSave={(v: string) => onSaveKey(p.id, v)}
              onClear={() => onClearKey(p.id)}
            />
          ))}
        </div>
      </div>

      <LmStudioChatBlock />
      <OpenAICompatibleBlock
        keys={keys}
        onSaveKey={(v) => onSaveKey("openai-compatible", v)}
        onClearKey={() => onClearKey("openai-compatible")}
      />
    </div>
  );
}

/* ── Edit Prediction ─────────────────────────────────────────────── */

function EditPredictionContent({ keys }: { keys: KeysMap | null }) {
  const autocompleteEnabled = usePreferencesStore((s) => s.autocompleteEnabled);

  const handleToggle = (v: boolean) => {
    void setAutocompleteEnabled(v);
    void setShowEditPrediction(v);
  };

  return (
    <div className="flex flex-col gap-5">
      <SettingRow
        title="Show edit completion"
        description="Enable or disable inline ghost-text edit predictions in the code editor."
      >
        <Switch
          checked={autocompleteEnabled}
          onCheckedChange={handleToggle}
        />
      </SettingRow>

      {keys && autocompleteEnabled && <AutocompleteBlock keys={keys} />}
    </div>
  );
}

/* ── Agents ──────────────────────────────────────────────────────── */

function AgentsContent() {
  const customInstructions = usePreferencesStore((s) => s.customInstructions);
  const customAgents = useAgentsStore((s) => s.customAgents);
  const activeAgentId = useAgentsStore((s) => s.activeId);
  const setActiveAgentId = useAgentsStore((s) => s.setActiveId);
  const upsertAgent = useAgentsStore((s) => s.upsert);
  const removeAgent = useAgentsStore((s) => s.remove);
  const hydrateAgents = useAgentsStore((s) => s.hydrate);

  useEffect(() => {
    void hydrateAgents();
  }, [hydrateAgents]);

  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);

  return (
    <div className="flex flex-col gap-7">
      <CustomInstructionsBlock value={customInstructions} />

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Label>Agents</Label>
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1.5 px-2 text-[11px]"
            onClick={() =>
              setEditingAgent({
                id: newAgentId(),
                name: "New agent",
                description: "",
                instructions: "",
                icon: "spark",
                builtIn: false,
              })
            }
          >
            <HugeiconsIcon icon={Add01Icon} size={12} strokeWidth={1.75} />
            New agent
          </Button>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {[...BUILTIN_AGENTS, ...customAgents].map((a) => (
            <AgentCard
              key={a.id}
              agent={a}
              active={a.id === activeAgentId}
              onActivate={() => setActiveAgentId(a.id)}
              onEdit={a.builtIn ? null : () => setEditingAgent(a)}
              onDelete={a.builtIn ? null : () => removeAgent(a.id)}
            />
          ))}
        </div>
      </section>

      <AgentEditorDialog
        agent={editingAgent}
        existing={customAgents}
        onClose={() => setEditingAgent(null)}
        onSave={(a) => {
          upsertAgent(a);
          setEditingAgent(null);
        }}
      />
    </div>
  );
}

/* ── Directives ──────────────────────────────────────────────────── */

function DirectivesContent() {
  const directives = useDirectivesStore((s) => s.directives);
  const upsertDirective = useDirectivesStore((s) => s.upsert);
  const removeDirective = useDirectivesStore((s) => s.remove);
  const hydrateDirectives = useDirectivesStore((s) => s.hydrate);

  useEffect(() => {
    void hydrateDirectives();
  }, [hydrateDirectives]);

  const [editingDirective, setEditingDirective] = useState<Directive | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="text-[10.5px] text-muted-foreground">
          Reusable instructions you can drop into any prompt with{" "}
          <code className="rounded bg-muted/50 px-1 font-mono">#handle</code>.
        </span>
        <Button
          size="sm"
          variant="outline"
          className="h-7 gap-1.5 px-2 text-[11px]"
          onClick={() =>
            setEditingDirective({
              id: newDirectiveId(),
              handle: "",
              name: "",
              description: "",
              content: "",
            })
          }
        >
          <HugeiconsIcon icon={Add01Icon} size={12} strokeWidth={1.75} />
          New directive
        </Button>
      </div>

      {directives.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border/60 bg-card/30 px-4 py-6 text-center text-[11px] text-muted-foreground">
          No directives yet. Create one and insert it with{" "}
          <code className="font-mono">#handle</code> in the AI input.
        </div>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {directives.map((d) => (
            <li
              key={d.id}
              className="flex items-center gap-2 rounded-lg border border-border/60 bg-card/60 px-3 py-2"
            >
              <code className="rounded bg-muted/50 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                #{d.handle}
              </code>
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[12px] font-medium">{d.name}</span>
                {d.description ? (
                  <span className="truncate text-[10.5px] text-muted-foreground">
                    {d.description}
                  </span>
                ) : null}
              </div>
              <Button
                size="icon"
                variant="ghost"
                className="size-7"
                onClick={() => setEditingDirective(d)}
                title="Edit"
              >
                <HugeiconsIcon icon={Edit02Icon} size={12} strokeWidth={1.75} />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="size-7 text-muted-foreground hover:text-destructive"
                onClick={() => removeDirective(d.id)}
                title="Delete"
              >
                <HugeiconsIcon icon={Delete02Icon} size={12} strokeWidth={1.75} />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <DirectiveEditorDialog
        directive={editingDirective}
        existing={directives}
        onClose={() => setEditingDirective(null)}
        onSave={(d) => {
          upsertDirective(d);
          setEditingDirective(null);
        }}
      />
    </div>
  );
}

/* ── Shared sub-components ───────────────────────────────────────── */

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-[72px] shrink-0 text-[11px] text-muted-foreground">{label}</span>
      <div className="flex flex-1 items-center gap-1.5">{children}</div>
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
      const res = await fetch(urlDraft.replace(/\/$/, "") + "/models", { method: "GET" });
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
          Run any GGUF model on your machine via LM Studio's HTTP server. Enable the server in LM Studio → Developer tab.
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
              {testStatus === "testing" ? <Spinner className="size-3" /> : "Test"}
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
            <span className="text-[10.5px] text-success">Connected — server responded.</span>
          )}
          {testStatus === "fail" && (
            <span className="text-[10.5px] text-destructive">
              Could not reach the server. Is LM Studio running?
            </span>
          )}
          {testStatus === "idle" && (
            <span className="text-[10.5px] text-warning">
              Enter the model ID that's loaded in LM Studio — e.g. the one shown on the server's /v1/models page.
            </span>
          )}
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
          Any OpenAI-compatible HTTPS endpoint — vLLM, Z.AI, Fireworks, hosted Ollama, etc.
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
              {testStatus === "testing" ? <Spinner className="size-3" /> : "Test"}
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
                <HugeiconsIcon icon={Cancel01Icon} size={14} strokeWidth={1.75} />
              </button>
            )}
          </FieldRow>
        </div>
        {(testStatus === "ok" || testStatus === "fail") && (
          <div className="py-2">
            {testStatus === "ok" && (
              <span className="text-[10.5px] text-success">Connected — endpoint responded.</span>
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

function AutocompleteBlock({ keys }: { keys: KeysMap }) {
  const provider = usePreferencesStore((s) => s.autocompleteProvider);
  const modelId = usePreferencesStore((s) => s.autocompleteModelId);
  const lmstudioBaseURL = usePreferencesStore((s) => s.lmstudioBaseURL);
  const openaiCompatibleBaseURL = usePreferencesStore((s) => s.openaiCompatibleBaseURL);
  const currentCompatKey = keys["openai-compatible"];

  const [modelDraft, setModelDraft] = useState(modelId);
  const [lmUrlDraft, setLmUrlDraft] = useState(lmstudioBaseURL);
  const [compatUrlDraft, setCompatUrlDraft] = useState(openaiCompatibleBaseURL);
  const [compatKeyDraft, setCompatKeyDraft] = useState("");
  const [testStatus, setTestStatus] = useState<"idle" | "testing" | "ok" | "fail">("idle");

  useEffect(() => setModelDraft(modelId), [modelId]);
  useEffect(() => setLmUrlDraft(lmstudioBaseURL), [lmstudioBaseURL]);
  useEffect(() => setCompatUrlDraft(openaiCompatibleBaseURL), [openaiCompatibleBaseURL]);
  useEffect(() => setTestStatus("idle"), [provider]);

  const onProviderChange = (next: AutocompleteProviderId) => {
    void setAutocompleteProvider(next);
    const knownDefaults = Object.values(DEFAULT_AUTOCOMPLETE_MODEL);
    if (knownDefaults.includes(modelId)) {
      void setAutocompleteModelId(DEFAULT_AUTOCOMPLETE_MODEL[next]);
    }
  };

  const providerInfo = getProvider(provider);
  const hasKey =
    provider === "lmstudio" || provider === "openai-compatible"
      ? true
      : !!keys[provider];

  const testUrl = async (url: string, apiKey?: string | null) => {
    setTestStatus("testing");
    try {
      const headers: Record<string, string> = {};
      if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
      const res = await fetch(url.replace(/\/$/, "") + "/models", { method: "GET", headers });
      setTestStatus(res.ok ? "ok" : "fail");
    } catch {
      setTestStatus("fail");
    }
  };

  const maskedCompatKey = currentCompatKey
    ? `${currentCompatKey.slice(0, 4)}${"•".repeat(9)}${currentCompatKey.slice(-4)}`
    : null;

  return (
    <div className="flex flex-col gap-3">
      <Label>Editor autocomplete provider</Label>

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
            <p className="mt-1.5 pl-[84px] text-[10.5px] text-warning">
              No API key configured for {providerInfo.label}. Add one in Models above.
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
                if (v !== modelId) void setAutocompleteModelId(v);
              }}
              placeholder={DEFAULT_AUTOCOMPLETE_MODEL[provider] || "e.g. qwen2.5-coder-7b-instruct"}
              spellCheck={false}
              className="h-8 flex-1 font-mono text-[11.5px]"
            />
          </FieldRow>
        </div>

        {provider === "lmstudio" && (
          <div className="py-2.5">
            <FieldRow label="Base URL">
              <Input
                value={lmUrlDraft}
                onChange={(e) => setLmUrlDraft(e.target.value)}
                onBlur={() => {
                  const v = lmUrlDraft.trim();
                  if (v && v !== lmstudioBaseURL) void setLmstudioBaseURL(v);
                }}
                placeholder="http://localhost:1234/v1"
                spellCheck={false}
                className="h-8 flex-1 font-mono text-[11.5px]"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() => void testUrl(lmUrlDraft)}
                disabled={!lmUrlDraft.trim() || testStatus === "testing"}
                className="h-8 shrink-0 px-2.5 text-[11px]"
              >
                {testStatus === "testing" ? <Spinner className="size-3" /> : "Test"}
              </Button>
            </FieldRow>
            {testStatus === "ok" && (
              <p className="mt-1.5 pl-[84px] text-[10.5px] text-success">Connected — server responded.</p>
            )}
            {testStatus === "fail" && (
              <p className="mt-1.5 pl-[84px] text-[10.5px] text-destructive">
                Could not reach the server. Is LM Studio running?
              </p>
            )}
          </div>
        )}

        {provider === "openai-compatible" && (
          <>
            <div className="py-2.5">
              <FieldRow label="Base URL">
                <Input
                  value={compatUrlDraft}
                  onChange={(e) => setCompatUrlDraft(e.target.value)}
                  onBlur={() => {
                    const v = compatUrlDraft.trim();
                    if (v && v !== openaiCompatibleBaseURL) void setOpenaiCompatibleBaseURL(v);
                  }}
                  placeholder={OPENAI_COMPATIBLE_DEFAULT_BASE_URL}
                  spellCheck={false}
                  className="h-8 flex-1 font-mono text-[11.5px]"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void testUrl(compatUrlDraft, compatKeyDraft.trim() || currentCompatKey)}
                  disabled={!compatUrlDraft.trim() || testStatus === "testing"}
                  className="h-8 shrink-0 px-2.5 text-[11px]"
                >
                  {testStatus === "testing" ? <Spinner className="size-3" /> : "Test"}
                </Button>
              </FieldRow>
              {testStatus === "ok" && (
                <p className="mt-1.5 pl-[84px] text-[10.5px] text-success">Connected — endpoint responded.</p>
              )}
              {testStatus === "fail" && (
                <p className="mt-1.5 pl-[84px] text-[10.5px] text-destructive">
                  Could not reach the endpoint. Check the URL and key.
                </p>
              )}
            </div>
            <div className="py-2.5">
              <FieldRow label="API key">
                <div className="relative flex-1">
                  <Input
                    type="text"
                    autoComplete="off"
                    spellCheck={false}
                    value={compatKeyDraft}
                    onChange={(e) => setCompatKeyDraft(e.target.value)}
                    onBlur={async () => {
                      const v = compatKeyDraft.trim();
                      if (v) {
                        await setKey("openai-compatible", v);
                        await emitKeysChanged();
                        setCompatKeyDraft("");
                      }
                    }}
                    placeholder={maskedCompatKey ?? "Leave blank if not needed"}
                    className="h-8 font-mono text-[11.5px]"
                  />
                </div>
                {(compatKeyDraft || currentCompatKey) && (
                  <button
                    type="button"
                    onClick={async () => {
                      setCompatKeyDraft("");
                      await clearKey("openai-compatible");
                      await emitKeysChanged();
                    }}
                    className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
                    title="Clear API key"
                  >
                    <HugeiconsIcon icon={Cancel01Icon} size={14} strokeWidth={1.75} />
                  </button>
                )}
              </FieldRow>
              <p className="mt-1.5 pl-[84px] text-[10.5px] text-muted-foreground">
                Shared with Models → OpenAI-compatible endpoint.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function AgentCard({
  agent,
  active,
  onActivate,
  onEdit,
  onDelete,
}: {
  agent: Agent;
  active: boolean;
  onActivate: () => void;
  onEdit: (() => void) | null;
  onDelete: (() => void) | null;
}) {
  const Icon = AGENT_ICONS[agent.icon] ?? SparklesIcon;
  return (
    <div
      className={cn(
        "group relative flex flex-col gap-1.5 rounded-lg border bg-card/60 px-3 py-2.5 transition-colors",
        active
          ? "border-foreground/30 ring-1 ring-foreground/10"
          : "border-border/60 hover:border-border",
      )}
    >
      <div className="flex items-start gap-2">
        <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted/40">
          <HugeiconsIcon icon={Icon} size={14} strokeWidth={1.5} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="flex items-center gap-1.5 text-[12.5px] font-medium">
            {agent.name}
            {agent.builtIn ? (
              <span className="rounded bg-muted/50 px-1 py-0.5 text-[9px] tracking-wide text-muted-foreground uppercase">
                Built-in
              </span>
            ) : null}
          </span>
          <span className="line-clamp-2 text-[10.5px] leading-relaxed text-muted-foreground">
            {agent.description}
          </span>
        </div>
      </div>
      <div className="mt-auto flex items-center justify-between gap-1">
        <Button
          size="sm"
          variant={active ? "default" : "outline"}
          onClick={onActivate}
          className="h-6 gap-1 px-2 text-[10.5px]"
        >
          {active ? (
            <>
              <HugeiconsIcon icon={CheckmarkCircle02Icon} size={10} strokeWidth={2} />
              Active
            </>
          ) : (
            "Use agent"
          )}
        </Button>
        <div className="flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          {onEdit ? (
            <Button size="icon" variant="ghost" className="size-6" onClick={onEdit} title="Edit">
              <HugeiconsIcon icon={Edit02Icon} size={11} strokeWidth={1.75} />
            </Button>
          ) : null}
          {onDelete ? (
            <Button
              size="icon"
              variant="ghost"
              className="size-6 text-muted-foreground hover:text-destructive"
              onClick={onDelete}
              title="Delete"
            >
              <HugeiconsIcon icon={Delete02Icon} size={11} strokeWidth={1.75} />
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function AgentEditorDialog({
  agent,
  existing,
  onClose,
  onSave,
}: {
  agent: Agent | null;
  existing: Agent[];
  onClose: () => void;
  onSave: (a: Agent) => void;
}) {
  const [draft, setDraft] = useState<Agent | null>(agent);
  useEffect(() => setDraft(agent), [agent]);
  if (!draft) return null;

  const isNew = !existing.some((a) => a.id === draft.id);
  const canSave = draft.name.trim().length > 0 && draft.instructions.trim().length > 0;

  return (
    <Dialog open={!!agent} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-[14px]">{isNew ? "New agent" : "Edit agent"}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex gap-2">
            <div className="flex flex-col gap-1">
              <Label>Icon</Label>
              <div className="flex flex-wrap gap-1">
                {ICON_OPTIONS.map((id) => {
                  const Icon = AGENT_ICONS[id] ?? SparklesIcon;
                  const active = draft.icon === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setDraft({ ...draft, icon: id })}
                      className={cn(
                        "flex size-7 items-center justify-center rounded-md border transition-colors",
                        active
                          ? "border-foreground/40 bg-accent"
                          : "border-border/60 hover:bg-accent/60",
                      )}
                    >
                      <HugeiconsIcon icon={Icon} size={13} strokeWidth={1.75} />
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex flex-1 flex-col gap-1">
              <Label>Name</Label>
              <Input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                className="h-8 text-[12px]"
                placeholder="e.g. Test Engineer"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <Label>Description</Label>
            <Input
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              placeholder="One line — shown in the agent picker"
              className="h-8 text-[12px]"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label>Instructions</Label>
            <Textarea
              value={draft.instructions}
              onChange={(e) => setDraft({ ...draft, instructions: e.target.value })}
              placeholder="Persona & rules. Appended to Nexum's core system prompt."
              className="min-h-40 resize-y text-[12px] leading-relaxed"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" disabled={!canSave} onClick={() => onSave({ ...draft, builtIn: false })}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DirectiveEditorDialog({
  directive,
  existing,
  onClose,
  onSave,
}: {
  directive: Directive | null;
  existing: Directive[];
  onClose: () => void;
  onSave: (d: Directive) => void;
}) {
  const [draft, setDraft] = useState<Directive | null>(directive);
  useEffect(() => setDraft(directive), [directive]);
  if (!draft) return null;

  const handleErr = !draft.handle
    ? "Required."
    : !isValidHandle(draft.handle)
      ? "Lowercase letters, digits, and dashes only."
      : existing.some((d) => d.id !== draft.id && d.handle === draft.handle)
        ? "Already in use."
        : null;
  const canSave =
    !handleErr &&
    draft.name.trim().length > 0 &&
    draft.content.trim().length > 0;

  return (
    <Dialog open={!!directive} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-[14px]">
            {existing.some((d) => d.id === draft.id) ? "Edit directive" : "New directive"}
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex gap-2">
            <div className="flex w-32 flex-col gap-1">
              <Label>Handle</Label>
              <div className="relative">
                <span className="absolute top-1/2 left-2 -translate-y-1/2 font-mono text-[11.5px] text-muted-foreground">
                  #
                </span>
                <Input
                  value={draft.handle}
                  onChange={(e) =>
                    setDraft({ ...draft, handle: normalizeHandle(e.target.value) })
                  }
                  placeholder="review"
                  className="h-8 pl-5 font-mono text-[11.5px]"
                />
              </div>
              {handleErr ? (
                <span className="text-[10px] text-destructive">{handleErr}</span>
              ) : null}
            </div>
            <div className="flex flex-1 flex-col gap-1">
              <Label>Name</Label>
              <Input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="e.g. Pre-merge review checklist"
                className="h-8 text-[12px]"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <Label>Description</Label>
            <Input
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              placeholder="One line — shown in the # picker"
              className="h-8 text-[12px]"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label>Content</Label>
            <Textarea
              value={draft.content}
              onChange={(e) => setDraft({ ...draft, content: e.target.value })}
              placeholder="Inserted into the prompt as a <directive> block when you use #handle."
              className="min-h-40 resize-y font-mono text-[11.5px] leading-relaxed"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" disabled={!canSave} onClick={() => onSave(draft)}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CustomInstructionsBlock({ value }: { value: string }) {
  const [draft, setDraft] = useState(value);
  const hadFirstSync = useRef(false);

  useEffect(() => {
    if (!hadFirstSync.current) {
      hadFirstSync.current = true;
      setDraft(value);
    }
  }, [value]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <Label>Custom instructions</Label>
        {draft && (
          <Button size="xs" onClick={() => void setCustomInstructions(draft)}>
            Save
          </Button>
        )}
      </div>
      <Textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="e.g. Always reply in concise bullet points. Prefer pnpm over npm. My machine is an M-series Mac."
        className="min-h-[100px] resize-y bg-card/60 font-sans text-[12px] leading-relaxed border border-border"
      />
    </div>
  );
}

function NumInput({
  value,
  min,
  max,
  step,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <input
      type="number"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="h-7 w-20 rounded-md border border-border/60 bg-transparent px-2 text-center text-[11.5px] focus:outline-none focus:ring-1 focus:ring-ring"
    />
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[11px] font-medium tracking-tight text-muted-foreground">
      {children}
    </span>
  );
}
