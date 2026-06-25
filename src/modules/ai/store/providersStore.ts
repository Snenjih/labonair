import { emit, listen, type UnlistenFn } from "@tauri-apps/api/event";
import { LazyStore } from "@tauri-apps/plugin-store";
import { create } from "zustand";
import { getStoragePaths } from "@/lib/paths";
import {
  getProviderDefaultBaseUrl,
  providerNeedsKey,
  type ProviderInstance,
  type ProviderId,
  PROVIDERS,
} from "../config";
import {
  getAllKeys,
  getAllInstanceKeys,
  setInstanceKey,
} from "../lib/keyring";
import { autoName, renameForDuplicates } from "../lib/modelRef";
import { useModelCacheStore } from "./modelCacheStore";

const PROVIDERS_KEY = "ai.providerInstances";
const PROVIDERS_CHANGED_EVENT = "labonair://ai-providers-changed";

let _storePromise: Promise<LazyStore> | null = null;
async function getStore(): Promise<LazyStore> {
  if (!_storePromise) {
    _storePromise = getStoragePaths().then(
      (p) => new LazyStore(`${p.config}/labonair-settings.json`, { defaults: {}, autoSave: 200 }),
    );
  }
  return _storePromise;
}

function generateId(): string {
  return crypto.randomUUID();
}

/** Migrate from old single-per-provider storage to new instance model.
 *  Reads existing keys and preferences to build a starter instance list. */
async function migrateFromLegacy(
  legacyPrefs: LegacyPrefs,
): Promise<ProviderInstance[]> {
  const oldKeys = await getAllKeys();
  const instances: ProviderInstance[] = [];

  for (const p of PROVIDERS) {
    if (!providerNeedsKey(p.id)) {
      // Local providers: always create an instance if settings exist
      const baseUrl = getLegacyBaseUrl(p.id as ProviderId, legacyPrefs);
      const localModelId = getLegacyModelId(p.id as ProviderId, legacyPrefs);
      if (baseUrl || localModelId) {
        instances.push({
          id: generateId(),
          providerId: p.id,
          name: p.id,
          baseUrl: baseUrl || getProviderDefaultBaseUrl(p.id),
          localModelId: localModelId || undefined,
        });
      }
    } else {
      // Cloud providers: create instance only if key was set
      const key = oldKeys[p.id];
      if (key) {
        const inst: ProviderInstance = {
          id: generateId(),
          providerId: p.id,
          name: p.id,
        };
        // Copy key to new instance account
        try {
          await setInstanceKey(inst.id, key);
        } catch {
          // Key copy failed — instance still created but without key
        }
        instances.push(inst);
      }
    }
  }

  return instances;
}

type LegacyPrefs = {
  lmstudioBaseURL?: string;
  lmstudioChatModelId?: string;
  openaiCompatibleBaseURL?: string;
  openaiCompatibleModelId?: string;
  mlxBaseURL?: string;
  mlxChatModelId?: string;
  ollamaBaseURL?: string;
  ollamaChatModelId?: string;
};

function getLegacyBaseUrl(id: ProviderId, p: LegacyPrefs): string {
  switch (id) {
    case "lmstudio": return p.lmstudioBaseURL ?? "";
    case "openai-compatible": return p.openaiCompatibleBaseURL ?? "";
    case "mlx": return p.mlxBaseURL ?? "";
    case "ollama": return p.ollamaBaseURL ?? "";
    default: return "";
  }
}

function getLegacyModelId(id: ProviderId, p: LegacyPrefs): string {
  switch (id) {
    case "lmstudio": return p.lmstudioChatModelId ?? "";
    case "openai-compatible": return p.openaiCompatibleModelId ?? "";
    case "mlx": return p.mlxChatModelId ?? "";
    case "ollama": return p.ollamaChatModelId ?? "";
    default: return "";
  }
}

type ProvidersState = {
  instances: ProviderInstance[];
  /** Keys loaded for each instance id. */
  instanceKeys: Record<string, string | null>;
  hydrated: boolean;
  init: (legacyPrefs?: LegacyPrefs) => Promise<void>;
  /** Re-read instances from disk without migration. Safe to call from any window after a cross-window update. */
  reload: () => Promise<void>;
  add: (providerId: ProviderId) => Promise<ProviderInstance>;
  update: (id: string, patch: Partial<ProviderInstance>) => Promise<void>;
  remove: (id: string) => Promise<void>;
  reloadKeys: () => Promise<void>;
  onProvidersChanged: (cb: () => void) => Promise<UnlistenFn>;
};

let initialized = false;

export const useProvidersStore = create<ProvidersState>((set, get) => ({
  instances: [],
  instanceKeys: {},
  hydrated: false,

  init: async (legacyPrefs?: LegacyPrefs) => {
    if (initialized) return;
    initialized = true;

    const store = await getStore();
    let instances = (await store.get<ProviderInstance[]>(PROVIDERS_KEY)) ?? null;

    if (!instances || instances.length === 0) {
      // First run or empty — attempt migration
      instances = await migrateFromLegacy(legacyPrefs ?? {});
      if (instances.length > 0) {
        await store.set(PROVIDERS_KEY, instances);
        await store.save();
      }
    }

    // Remove instances whose provider no longer exists (e.g., from reverted features)
    const knownIds = new Set(PROVIDERS.map((p) => p.id));
    const cleaned = instances.filter((i) => knownIds.has(i.providerId));
    if (cleaned.length !== instances.length) {
      await store.set(PROVIDERS_KEY, cleaned);
      await store.save();
      instances = cleaned;
    }

    const keys = await loadInstanceKeys(instances);
    set({ instances, instanceKeys: keys, hydrated: true });

    const mc = useModelCacheStore.getState();
    void mc.hydrate().then(() => mc.fetchAllConfigured(instances, keys));
  },

  reload: async () => {
    const store = await getStore();
    const instances = (await store.get<ProviderInstance[]>(PROVIDERS_KEY)) ?? [];
    const keys = await loadInstanceKeys(instances);
    set({ instances, instanceKeys: keys });
  },

  add: async (providerId) => {
    const { instances } = get();
    const newInst: ProviderInstance = {
      id: generateId(),
      providerId,
      name: autoName(providerId, instances),
      baseUrl: getProviderDefaultBaseUrl(providerId) || undefined,
    };
    const updated = renameForDuplicates([...instances, newInst]);
    await persist(updated);
    set({ instances: updated });
    await emit(PROVIDERS_CHANGED_EVENT);
    const keys = get().instanceKeys;
    void useModelCacheStore.getState().fetchAllConfigured(updated, keys);
    return newInst;
  },

  update: async (id, patch) => {
    const { instances } = get();
    const updated = instances.map((i) => (i.id === id ? { ...i, ...patch } : i));
    await persist(updated);
    set({ instances: updated });
    await emit(PROVIDERS_CHANGED_EVENT);
    // Invalidate and re-fetch this instance in case baseUrl/key changed
    useModelCacheStore.getState().invalidate(id);
    const keys = get().instanceKeys;
    void useModelCacheStore.getState().fetchAllConfigured(updated, keys);
  },

  remove: async (id) => {
    const { instances } = get();
    const filtered = renameForDuplicates(instances.filter((i) => i.id !== id));
    await persist(filtered);
    const keys = { ...get().instanceKeys };
    delete keys[id];
    set({ instances: filtered, instanceKeys: keys });
    await emit(PROVIDERS_CHANGED_EVENT);
  },

  reloadKeys: async () => {
    const { instances } = get();
    const keys = await loadInstanceKeys(instances);
    set({ instanceKeys: keys });
  },

  onProvidersChanged: (cb) => listen(PROVIDERS_CHANGED_EVENT, () => cb()),
}));

async function persist(instances: ProviderInstance[]): Promise<void> {
  const store = await getStore();
  await store.set(PROVIDERS_KEY, instances);
  await store.save();
}

async function loadInstanceKeys(
  instances: ProviderInstance[],
): Promise<Record<string, string | null>> {
  const keyedIds = instances
    .filter((i) => providerNeedsKey(i.providerId))
    .map((i) => i.id);
  return getAllInstanceKeys(keyedIds);
}
