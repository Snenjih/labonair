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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { AGENT_ICONS } from "@/modules/ai/components/AgentSwitcher";
import {
  AUTOCOMPLETE_PROVIDERS,
  DEFAULT_AUTOCOMPLETE_MODEL,
  DEFAULT_MODEL_ID,
  MODELS,
  PROVIDERS,
  getModel,
  getProvider,
  providerNeedsKey,
  type AutocompleteProviderId,
  type ModelId,
  type ProviderId,
} from "@/modules/ai/config";
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
import { useProvidersStore } from "@/modules/ai/store/providersStore";
import { usePreferencesStore } from "@/modules/settings/preferences";
import {
  setAutocompleteEnabled,
  setAutocompleteModelId,
  setAutocompleteProvider,
  setCustomInstructions,
  setDefaultModel,
  setShowEditPrediction,
  setAiEnabled,
  setAiWarnDestructiveCommands,
  setAiMaxAgentSteps,
  setAiTerminalContextLines,
  setAiTemperature,
  setAiModelPickerOnlyConfigured,
} from "@/modules/settings/store";
import {
  Add01Icon,
  ArrowDown01Icon,
  CheckmarkCircle02Icon,
  ComputerIcon,
  Delete02Icon,
  Edit02Icon,
  Settings01Icon,
  SparklesIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useRef, useState } from "react";
import { AddProviderDropdown } from "../components/AddProviderDropdown";
import { ProviderIcon } from "../components/ProviderIcon";
import { ProviderInstanceCard } from "../components/ProviderInstanceCard";
import { SectionHeader } from "../components/SectionHeader";
import { SettingRow } from "../components/SettingRow";

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
    <h3 className="text-sm font-semibold tracking-tight text-foreground">
      {children}
    </h3>
  );
}

function SectionDivider() {
  return <div className="border-t border-border/40" />;
}

export function AiSection() {
  const initProviders = useProvidersStore((s) => s.init);
  const prefsHydrated = usePreferencesStore((s) => s.hydrated);
  const lmstudioBaseURL = usePreferencesStore((s) => s.lmstudioBaseURL);
  const lmstudioChatModelId = usePreferencesStore((s) => s.lmstudioChatModelId);
  const openaiCompatibleBaseURL = usePreferencesStore((s) => s.openaiCompatibleBaseURL);
  const openaiCompatibleModelId = usePreferencesStore((s) => s.openaiCompatibleModelId);
  const mlxBaseURL = usePreferencesStore((s) => s.mlxBaseURL);
  const mlxChatModelId = usePreferencesStore((s) => s.mlxChatModelId);
  const ollamaBaseURL = usePreferencesStore((s) => s.ollamaBaseURL);
  const ollamaChatModelId = usePreferencesStore((s) => s.ollamaChatModelId);

  useEffect(() => {
    if (!prefsHydrated) return;
    void initProviders({
      lmstudioBaseURL,
      lmstudioChatModelId,
      openaiCompatibleBaseURL,
      openaiCompatibleModelId,
      mlxBaseURL,
      mlxChatModelId,
      ollamaBaseURL,
      ollamaChatModelId,
    });
  }, [prefsHydrated, initProviders]);

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title="AI"
        description="Configure AI features, models, providers, agents, and directives."
      />

      {/* Defaults */}
      <div className="flex flex-col gap-4">
        <SubSectionTitle>Defaults</SubSectionTitle>
        <DefaultsContent />
      </div>

      <SectionDivider />

      {/* Providers */}
      <ProvidersContent />

      <SectionDivider />

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

/* ── Defaults ────────────────────────────────────────────────────── */

function DefaultsContent() {
  const defaultModel = usePreferencesStore((s) => s.defaultModelId);
  const autocompleteEnabled = usePreferencesStore((s) => s.autocompleteEnabled);
  const autocompleteProvider = usePreferencesStore((s) => s.autocompleteProvider);
  const autocompleteModelId = usePreferencesStore((s) => s.autocompleteModelId);
  const instanceKeys = useProvidersStore((s) => s.instanceKeys);
  const instances = useProvidersStore((s) => s.instances);

  // Guard against stale model IDs left over from reverted features
  const isValidModel = MODELS.some((m) => m.id === (defaultModel as string));
  const safeModel: ModelId = isValidModel ? defaultModel : DEFAULT_MODEL_ID;
  const defaultModelInfo = getModel(safeModel);

  useEffect(() => {
    if (!isValidModel) void setDefaultModel(DEFAULT_MODEL_ID);
  }, [isValidModel]);

  // Determine if a provider has at least one configured instance with a key
  const providerHasKey = (id: ProviderId): boolean => {
    if (!providerNeedsKey(id)) return true;
    return instances
      .filter((i) => i.providerId === id)
      .some((i) => !!instanceKeys[i.id]);
  };

  const handleAutocompleteToggle = (v: boolean) => {
    void setAutocompleteEnabled(v);
    void setShowEditPrediction(v);
  };

  const onAutocompleteProviderChange = (next: AutocompleteProviderId) => {
    void setAutocompleteProvider(next);
    const knownDefaults = Object.values(DEFAULT_AUTOCOMPLETE_MODEL);
    if (knownDefaults.includes(autocompleteModelId)) {
      void setAutocompleteModelId(DEFAULT_AUTOCOMPLETE_MODEL[next]);
    }
  };

  return (
    <div className="overflow-hidden rounded-lg border border-border/50 bg-card/30 divide-y divide-border/50">
      {/* Chat model row */}
      <div className="flex items-center gap-3 px-4 py-3">
        <span className="w-24 shrink-0 text-[12px] text-muted-foreground">Chat model</span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="h-9 flex-1 justify-between gap-2 px-2.5 text-[12px] border border-border/40 bg-background/50 hover:bg-muted"
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
              if (models.length === 0) return null;
              const hasKey = providerHasKey(p.id);
              const isEnabled = !providerNeedsKey(p.id) || hasKey;
              return (
                <div key={p.id} className="px-1 pt-1.5">
                  <div className="mb-1 flex items-center gap-1.5 px-2 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
                    <ProviderIcon provider={p.id} size={11} />
                    <span>{p.label}</span>
                    {!hasKey && providerNeedsKey(p.id) && (
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
                        m.id === safeModel && "bg-accent/50",
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

      {/* Autocomplete row */}
      <div className="flex items-center gap-3 px-4 py-3">
        <span className="w-24 shrink-0 text-[12px] text-muted-foreground">Autocomplete</span>
        <Switch
          checked={autocompleteEnabled}
          onCheckedChange={handleAutocompleteToggle}
          className="shrink-0"
        />
        {autocompleteEnabled && (
          <div className="flex flex-1 items-center gap-1.5">
            <Select
              value={autocompleteProvider}
              onValueChange={(v) => onAutocompleteProviderChange(v as AutocompleteProviderId)}
            >
              <SelectTrigger className="h-8 w-36 text-[11.5px]">
                <SelectValue>
                  <span className="flex items-center gap-1.5">
                    <ProviderIcon provider={autocompleteProvider} size={11} />
                    <span>{getProvider(autocompleteProvider).label}</span>
                  </span>
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {AUTOCOMPLETE_PROVIDERS.map((id) => (
                  <SelectItem key={id} value={id}>
                    <span className="flex items-center gap-1.5">
                      <ProviderIcon provider={id} size={11} />
                      <span>{getProvider(id).label}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              value={autocompleteModelId}
              onChange={(e) => void setAutocompleteModelId(e.target.value)}
              placeholder={DEFAULT_AUTOCOMPLETE_MODEL[autocompleteProvider] || "model id"}
              spellCheck={false}
              className="h-8 flex-1 font-mono text-[11px]"
            />
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Providers ───────────────────────────────────────────────────── */

function ProvidersContent() {
  const allInstances = useProvidersStore((s) => s.instances);
  const hydrated = useProvidersStore((s) => s.hydrated);
  const add = useProvidersStore((s) => s.add);

  const knownProviderIds = new Set(PROVIDERS.map((p) => p.id));
  const instances = allInstances.filter((i) => knownProviderIds.has(i.providerId));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <SubSectionTitle>Providers</SubSectionTitle>
        <AddProviderDropdown onSelect={(id) => void add(id)} />
      </div>

      {!hydrated ? (
        <div className="text-[12px] text-muted-foreground">Loading…</div>
      ) : instances.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border/60 bg-card/20 px-6 py-8 text-center">
          <p className="text-[13px] font-medium text-foreground/70">No providers connected yet.</p>
          <p className="mt-1 text-[11.5px] text-muted-foreground">
            Click "Add provider" to connect a cloud or local model source.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {instances.map((inst) => {
            const sameCount = instances.filter((i) => i.providerId === inst.providerId).length;
            return (
              <ProviderInstanceCard key={inst.id} instance={inst} sameProviderCount={sameCount} />
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── General ─────────────────────────────────────────────────────── */

function GeneralContent() {
  const aiEnabled = usePreferencesStore((s) => s.aiEnabled);
  const aiWarnDestructiveCommands = usePreferencesStore((s) => s.aiWarnDestructiveCommands);
  const onlyConfigured = usePreferencesStore((s) => s.aiModelPickerOnlyConfigured);
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
      <SettingRow
        title="Show only configured providers"
        description="Hide models from providers without an API key in the model picker."
      >
        <Switch
          checked={onlyConfigured}
          onCheckedChange={(v) => void setAiModelPickerOnlyConfigured(v)}
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
            {!existing.some((d) => d.id === draft.id) ? "New directive" : "Edit directive"}
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex gap-2">
            <div className="flex flex-1 flex-col gap-1">
              <Label>Handle</Label>
              <Input
                value={draft.handle}
                onChange={(e) => setDraft({ ...draft, handle: normalizeHandle(e.target.value) })}
                placeholder="e.g. concise"
                className="h-8 font-mono text-[12px]"
              />
              {handleErr && (
                <span className="text-[10.5px] text-destructive">{handleErr}</span>
              )}
            </div>
            <div className="flex flex-1 flex-col gap-1">
              <Label>Name</Label>
              <Input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="e.g. Be concise"
                className="h-8 text-[12px]"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <Label>Description</Label>
            <Input
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              placeholder="One line — shown in the directive picker"
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
