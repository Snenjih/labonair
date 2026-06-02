import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { openSettingsWindow } from "@/modules/settings/openSettingsWindow";
import {
  ArrowDown01Icon,
  BrainIcon,
  Cancel01Icon,
  ChatGptIcon,
  ClaudeIcon,
  Clock01Icon,
  ComputerIcon,
  CpuIcon,
  Dollar01Icon,
  FavouriteIcon,
  FlashIcon,
  GoogleGeminiIcon,
  GridViewIcon,
  Grok02Icon,
  Search01Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  MODELS,
  PROVIDERS,
  type ModelId,
  type ModelInfo,
  type ProviderId,
  getModel,
} from "../config";
import { useChatStore } from "../store/chatStore";
import { usePreferencesStore } from "@/modules/settings/preferences";

const PROVIDER_ICON: Record<ProviderId, typeof ChatGptIcon> = {
  openai: ChatGptIcon,
  anthropic: ClaudeIcon,
  google: GoogleGeminiIcon,
  xai: Grok02Icon,
  cerebras: CpuIcon,
  groq: FlashIcon,
  lmstudio: ComputerIcon,
  "openai-compatible": ComputerIcon,
  deepseek: CpuIcon,
  mistral: CpuIcon,
  openrouter: ComputerIcon,
  mlx: ComputerIcon,
  ollama: ComputerIcon,
} as const satisfies Record<ProviderId, typeof ChatGptIcon>;

// ── Capability bars ────────────────────────────────────────────────────────────

function CapabilityBars({ score, max = 5 }: { score: number; max?: number }) {
  return (
    <div className="flex items-end gap-[2px]">
      {Array.from({ length: max }, (_, i) => (
        <div
          key={i}
          className={cn(
            "w-[3px] rounded-[1px] transition-colors duration-150",
            i < score ? "bg-foreground/55" : "bg-foreground/10",
          )}
          style={{ height: `${6 + (i / (max - 1)) * 5}px` }}
        />
      ))}
    </div>
  );
}

function CapabilityGroup({
  icon,
  score,
  label,
}: {
  icon: typeof BrainIcon;
  score: number;
  label: string;
}) {
  return (
    <div className="flex items-center gap-[3px]" title={`${label}: ${score}/5`}>
      <HugeiconsIcon
        icon={icon}
        size={9}
        strokeWidth={1.5}
        className="text-muted-foreground/40 shrink-0"
      />
      <CapabilityBars score={score} />
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1 rounded-md px-2 py-1 text-[11px] transition-colors",
        active
          ? "bg-accent text-foreground font-medium"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function ProviderButton({
  icon,
  active,
  label,
  onClick,
  hasKey,
}: {
  icon: typeof GridViewIcon;
  active: boolean;
  label: string;
  onClick: () => void;
  hasKey: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className={cn(
        "relative mx-1 flex items-center justify-center rounded-md w-8 h-8 transition-colors shrink-0",
        active
          ? "bg-accent text-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {active && (
        <motion.span
          layoutId="picker-provider-indicator"
          className="absolute -left-1 top-1/2 -translate-y-1/2 h-4 w-[2px] rounded-r bg-foreground/80"
          transition={{ type: "spring", stiffness: 450, damping: 32 }}
        />
      )}
      <HugeiconsIcon icon={icon} size={14} strokeWidth={1.5} />
      {!hasKey && (
        <span className="absolute bottom-1 right-1 size-1.5 rounded-full bg-warning/80 ring-1 ring-card" />
      )}
    </button>
  );
}

function ModelRow({
  model,
  index,
  selected,
  hasKey,
  isFavorite,
  providerIcon,
  onSelect,
  onToggleFavorite,
}: {
  model: ModelInfo;
  index: number;
  selected: boolean;
  hasKey: boolean;
  isFavorite: boolean;
  providerIcon: typeof ChatGptIcon;
  onSelect: () => void;
  onToggleFavorite: (e: React.MouseEvent) => void;
}) {
  const caps = model.capabilities;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: Math.min(index * 0.012, 0.12), duration: 0.1 }}
    >
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          "group w-full flex items-center gap-2 px-2 py-[7px] text-left transition-colors",
          selected ? "bg-accent/50" : "hover:bg-muted/60",
          !hasKey && "opacity-40",
        )}
      >
        {/* Favorite */}
        <button
          type="button"
          onClick={onToggleFavorite}
          className={cn(
            "shrink-0 rounded p-0.5 transition-all duration-100",
            isFavorite
              ? "text-warning"
              : "text-transparent group-hover:text-muted-foreground/30 hover:!text-warning",
          )}
          title={isFavorite ? "Remove from favorites" : "Add to favorites"}
        >
          <HugeiconsIcon icon={FavouriteIcon} size={12} strokeWidth={1.75} />
        </button>

        {/* Provider icon */}
        <HugeiconsIcon
          icon={providerIcon}
          size={13}
          strokeWidth={1.25}
          className={cn(
            "shrink-0",
            selected ? "text-foreground" : "text-muted-foreground/65",
          )}
        />

        {/* Name + hint */}
        <div className="flex min-w-0 flex-1 items-baseline gap-1.5 overflow-hidden">
          <span
            className={cn(
              "text-[12px] font-medium leading-tight whitespace-nowrap",
              selected ? "text-foreground" : "text-foreground/90",
            )}
          >
            {model.label}
          </span>
          <span className="min-w-0 truncate text-[10.5px] text-muted-foreground/55 leading-tight">
            {model.hint}
          </span>
        </div>

        {/* Capability bars */}
        <div className="flex items-center gap-2 shrink-0 ml-1">
          {caps ? (
            <>
              <CapabilityGroup icon={BrainIcon} score={caps.intelligence} label="Intelligence" />
              <CapabilityGroup icon={FlashIcon} score={caps.speed} label="Speed" />
              <CapabilityGroup icon={Dollar01Icon} score={caps.cost} label="Cost efficiency" />
            </>
          ) : (
            <span className="text-[9.5px] text-muted-foreground/30 italic">local</span>
          )}
        </div>

        {/* Selected */}
        <div className="w-3 shrink-0 flex justify-end">
          {selected && (
            <HugeiconsIcon
              icon={Tick02Icon}
              size={12}
              strokeWidth={2}
              className="text-foreground"
            />
          )}
        </div>
      </button>
    </motion.div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

type Tab = "all" | "favorites" | "recent";

export function ModelPicker() {
  const selected = useChatStore((s) => s.selectedModelId);
  const apiKeys = useChatStore((s) => s.apiKeys);
  const setSelected = useChatStore((s) => s.setSelectedModelId);
  const favorites = useChatStore((s) => s.favoriteModelIds);
  const recents = useChatStore((s) => s.recentModelIds);
  const toggleFavorite = useChatStore((s) => s.toggleFavoriteModel);

  const onlyConfigured = usePreferencesStore((s) => s.aiModelPickerOnlyConfigured);

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<Tab>("all");
  const [activeProvider, setActiveProvider] = useState<ProviderId | null>(null);

  const searchRef = useRef<HTMLInputElement>(null);

  const current = getModel(selected);
  const hasKey = !!apiKeys[current.provider];

  useEffect(() => {
    if (open) {
      const t = setTimeout(() => searchRef.current?.focus(), 60);
      return () => clearTimeout(t);
    } else {
      setSearch("");
      setTab("all");
      setActiveProvider(null);
    }
  }, [open]);

  const providersWithModels = useMemo(
    () => PROVIDERS.filter((p) => {
      const hasModels = MODELS.some((m) => m.provider === p.id);
      if (!hasModels) return false;
      if (onlyConfigured && !apiKeys[p.id] && p.id !== "lmstudio" && p.id !== "mlx" && p.id !== "ollama") return false;
      return true;
    }),
    [onlyConfigured, apiKeys],
  );

  const filtered = useMemo<ModelInfo[]>(() => {
    let list: readonly ModelInfo[] = onlyConfigured
      ? MODELS.filter((m) => {
          const p = m.provider as ProviderId;
          return !!apiKeys[p] || p === "lmstudio" || p === "mlx" || p === "ollama";
        })
      : MODELS;

    if (tab === "favorites") {
      list = list.filter((m) => favorites.includes(m.id));
    } else if (tab === "recent") {
      const ordered: ModelInfo[] = [];
      for (const id of recents) {
        const found = (MODELS as readonly ModelInfo[]).find((m) => m.id === id);
        if (found) ordered.push(found);
      }
      list = ordered;
    }

    if (activeProvider) {
      list = list.filter((m) => m.provider === activeProvider);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (m) =>
          m.label.toLowerCase().includes(q) ||
          m.hint.toLowerCase().includes(q) ||
          m.provider.toLowerCase().includes(q) ||
          m.tags?.some((t) => t.includes(q)),
      );
    }

    return list as ModelInfo[];
  }, [tab, activeProvider, search, favorites, recents, onlyConfigured, apiKeys]);

  const onPick = (id: string, provider: ProviderId) => {
    if (!apiKeys[provider]) {
      void openSettingsWindow("models");
      setOpen(false);
      return;
    }
    setSelected(id as ModelId);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn(
            "h-5.5 gap-1 rounded-md px-1.5 my-1 text-xs hover:bg-accent hover:text-foreground",
            hasKey ? "text-muted-foreground" : "text-warning",
          )}
          title={hasKey ? `Model: ${current.label}` : `${current.label} — no key configured`}
        >
          {current.label}
          <HugeiconsIcon
            icon={ArrowDown01Icon}
            size={11}
            strokeWidth={2}
            className="opacity-70"
          />
        </Button>
      </PopoverTrigger>

      <PopoverContent
        side="top"
        align="end"
        sideOffset={8}
        className="w-[460px] p-0 overflow-hidden flex flex-col"
        style={{ maxHeight: "min(540px, calc(100vh - 80px))" }}
      >
        {/* Search */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border/50 shrink-0">
          <HugeiconsIcon
            icon={Search01Icon}
            size={13}
            strokeWidth={1.75}
            className="text-muted-foreground/40 shrink-0"
          />
          <input
            ref={searchRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setOpen(false);
              if (e.key === "Enter" && filtered.length === 1) {
                onPick(filtered[0].id, filtered[0].provider as ProviderId);
              }
            }}
            placeholder="Search models, providers, capabilities…"
            className="flex-1 bg-transparent text-[12px] outline-none placeholder:text-muted-foreground/35"
          />
          <AnimatePresence>
            {search && (
              <motion.button
                type="button"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.1 }}
                onClick={() => setSearch("")}
                className="text-muted-foreground/40 hover:text-muted-foreground transition-colors"
              >
                <HugeiconsIcon icon={Cancel01Icon} size={11} strokeWidth={2} />
              </motion.button>
            )}
          </AnimatePresence>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-0.5 px-2 py-1 border-b border-border/50 shrink-0">
          <TabButton
            active={tab === "all"}
            onClick={() => {
              setTab("all");
              setActiveProvider(null);
            }}
          >
            <HugeiconsIcon icon={GridViewIcon} size={11} strokeWidth={1.75} />
            All
          </TabButton>
          <TabButton active={tab === "favorites"} onClick={() => setTab("favorites")}>
            <HugeiconsIcon icon={FavouriteIcon} size={11} strokeWidth={1.75} />
            Favorites
          </TabButton>
          <TabButton active={tab === "recent"} onClick={() => setTab("recent")}>
            <HugeiconsIcon icon={Clock01Icon} size={11} strokeWidth={1.75} />
            Recent
            {recents.length > 0 && (
              <span className="ml-0.5 rounded bg-muted px-1 py-px text-[9px] text-muted-foreground font-medium tabular-nums">
                {recents.length}
              </span>
            )}
          </TabButton>
        </div>

        {/* Body */}
        <div className="flex min-h-0 flex-1 overflow-hidden">
          {/* Provider Sidebar */}
          <div className="flex flex-col gap-0.5 border-r border-border/50 py-1.5 w-[44px] shrink-0 overflow-y-auto">
            <ProviderButton
              icon={GridViewIcon}
              active={activeProvider === null}
              label="All providers"
              onClick={() => setActiveProvider(null)}
              hasKey
            />
            <div className="mx-2 my-0.5 h-px bg-border/50" />
            {providersWithModels.map((p) => (
              <ProviderButton
                key={p.id}
                icon={PROVIDER_ICON[p.id]}
                active={activeProvider === p.id}
                label={p.label}
                onClick={() =>
                  setActiveProvider(activeProvider === p.id ? null : p.id)
                }
                hasKey={!!apiKeys[p.id]}
              />
            ))}
          </div>

          {/* Model List */}
          <div className="flex-1 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-2">
                <span className="text-[12px] text-muted-foreground/60">No models found</span>
                {tab !== "all" && (
                  <button
                    type="button"
                    onClick={() => {
                      setTab("all");
                      setActiveProvider(null);
                    }}
                    className="text-[11px] text-muted-foreground/40 hover:text-muted-foreground underline-offset-2 hover:underline transition-colors"
                  >
                    Show all models
                  </button>
                )}
              </div>
            ) : (
              filtered.map((m, i) => (
                <ModelRow
                  key={m.id}
                  model={m}
                  index={i}
                  selected={m.id === selected}
                  hasKey={!!apiKeys[m.provider as ProviderId]}
                  isFavorite={favorites.includes(m.id)}
                  providerIcon={PROVIDER_ICON[m.provider as ProviderId] ?? ComputerIcon}
                  onSelect={() => onPick(m.id, m.provider as ProviderId)}
                  onToggleFavorite={(e) => {
                    e.stopPropagation();
                    toggleFavorite(m.id);
                  }}
                />
              ))
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
