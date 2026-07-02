import { LazyStore } from "@tauri-apps/plugin-store";
import { create } from "zustand";
import { getStoragePaths } from "@/lib/paths";
import type { DynamicModelInfo, ProviderInstance, ProviderId } from "../config";
import { fetchModelsForInstance, getTtlForProvider } from "../lib/fetchModels";

const CACHE_STORE_KEY = "ai.modelCache";

export type InstanceModelCache = {
  models: DynamicModelInfo[];
  fetchedAt: number;
  status: "idle" | "loading" | "success" | "error";
  error?: string;
};

type ModelCacheState = {
  cache: Record<string, InstanceModelCache>;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  fetchForInstance: (instance: ProviderInstance, apiKey: string | null) => Promise<void>;
  fetchAllConfigured: (
    instances: ProviderInstance[],
    instanceKeys: Record<string, string | null>,
  ) => Promise<void>;
  getModelsForInstance: (instanceId: string) => DynamicModelInfo[];
  getModelsForProvider: (providerId: ProviderId, instanceIds: string[]) => DynamicModelInfo[];
  isLoading: (instanceId: string) => boolean;
  isAnyLoading: () => boolean;
  getError: (instanceId: string) => string | null;
  invalidate: (instanceId: string) => void;
};

let _storePromise: Promise<LazyStore> | null = null;
async function getStore(): Promise<LazyStore> {
  if (!_storePromise) {
    _storePromise = getStoragePaths().then(
      (p) => new LazyStore(`${p.config}/labonair-settings.json`, { defaults: {}, autoSave: 200 }),
    );
  }
  return _storePromise;
}

async function persistCache(cache: Record<string, InstanceModelCache>): Promise<void> {
  try {
    const store = await getStore();
    // Only persist successful entries; strip loading states to avoid stale status on restart
    const persisted: Record<string, InstanceModelCache> = {};
    for (const [id, entry] of Object.entries(cache)) {
      if (entry.status === "success") persisted[id] = entry;
    }
    await store.set(CACHE_STORE_KEY, persisted);
    await store.save();
  } catch {
    // Non-fatal: cache is in-memory either way
  }
}

let hydrated = false;

export const useModelCacheStore = create<ModelCacheState>((set, get) => ({
  cache: {},
  hydrated: false,

  hydrate: async () => {
    if (hydrated) return;
    hydrated = true;
    try {
      const store = await getStore();
      const persisted = await store.get<Record<string, InstanceModelCache>>(CACHE_STORE_KEY);
      if (persisted && typeof persisted === "object") {
        set({ cache: persisted, hydrated: true });
      } else {
        set({ hydrated: true });
      }
    } catch {
      set({ hydrated: true });
    }
  },

  fetchForInstance: async (instance, apiKey) => {
    const { cache } = get();
    const existing = cache[instance.id];
    const ttl = getTtlForProvider(instance.providerId);

    // Skip if still fresh
    if (existing?.status === "success" && Date.now() - existing.fetchedAt < ttl) {
      return;
    }

    // Mark loading (keep old models visible during refresh)
    set((s) => ({
      cache: {
        ...s.cache,
        [instance.id]: {
          models: existing?.models ?? [],
          fetchedAt: existing?.fetchedAt ?? 0,
          status: "loading",
        },
      },
    }));

    try {
      const models = await fetchModelsForInstance(instance, apiKey);
      const entry: InstanceModelCache = {
        models,
        fetchedAt: Date.now(),
        status: "success",
      };
      const next = { ...get().cache, [instance.id]: entry };
      set({ cache: next });
      void persistCache(next);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      set((s) => ({
        cache: {
          ...s.cache,
          [instance.id]: {
            models: existing?.models ?? [],
            fetchedAt: existing?.fetchedAt ?? 0,
            status: "error",
            error: errorMsg,
          },
        },
      }));
    }
  },

  fetchAllConfigured: async (instances, instanceKeys) => {
    await Promise.allSettled(
      instances.map((inst) => get().fetchForInstance(inst, instanceKeys[inst.id] ?? null)),
    );
  },

  getModelsForInstance: (instanceId) => {
    return get().cache[instanceId]?.models ?? [];
  },

  getModelsForProvider: (providerId, instanceIds) => {
    const out: DynamicModelInfo[] = [];
    for (const id of instanceIds) {
      const entry = get().cache[id];
      if (entry?.models) {
        out.push(...entry.models.filter((m) => m.provider === providerId));
      }
    }
    return out;
  },

  isLoading: (instanceId) => get().cache[instanceId]?.status === "loading",

  isAnyLoading: () => Object.values(get().cache).some((e) => e.status === "loading"),

  getError: (instanceId) => {
    const entry = get().cache[instanceId];
    if (entry?.status === "error") return entry.error ?? "Unknown error";
    return null;
  },

  invalidate: (instanceId) => {
    set((s) => {
      const existing = s.cache[instanceId];
      if (!existing) return s;
      return {
        cache: {
          ...s.cache,
          [instanceId]: { ...existing, fetchedAt: 0 },
        },
      };
    });
  },
}));
