import type { ProviderInstance } from "../config";
import type { ProviderId } from "../config";

/** A model reference: either "modelDefId" or "modelDefId@instanceId" */
export type ModelRef = string;

export function parseModelRef(ref: ModelRef): { modelDefId: string; instanceId: string | null } {
  const idx = ref.lastIndexOf("@");
  if (idx === -1) return { modelDefId: ref, instanceId: null };
  return { modelDefId: ref.slice(0, idx), instanceId: ref.slice(idx + 1) };
}

export function makeModelRef(modelDefId: string, instanceId?: string | null): ModelRef {
  return instanceId ? `${modelDefId}@${instanceId}` : modelDefId;
}

/** Finds the instance to use for a given model ref + provider.
 *  If instanceId is set, finds by id. Otherwise returns first instance for that provider. */
export function resolveInstance(
  providerId: ProviderId,
  instanceId: string | null,
  instances: ProviderInstance[],
): ProviderInstance | null {
  if (instanceId) {
    return instances.find((i) => i.id === instanceId) ?? null;
  }
  return instances.find((i) => i.providerId === providerId) ?? null;
}

/** Auto-generates a name for a new instance of providerId given existing instances. */
export function autoName(providerId: ProviderId, existing: ProviderInstance[]): string {
  const same = existing.filter((i) => i.providerId === providerId);
  if (same.length === 0) return providerId;
  return `${providerId}${same.length + 1}`;
}

/** When a second instance of the same type is added, rename the first to "{providerId}1".
 *  Returns the updated instances array. */
export function renameForDuplicates(instances: ProviderInstance[]): ProviderInstance[] {
  const countByProvider: Record<string, number> = {};
  for (const inst of instances) {
    countByProvider[inst.providerId] = (countByProvider[inst.providerId] ?? 0) + 1;
  }
  const indexByProvider: Record<string, number> = {};
  return instances.map((inst) => {
    if (countByProvider[inst.providerId]! > 1) {
      const idx = (indexByProvider[inst.providerId] ?? 0) + 1;
      indexByProvider[inst.providerId] = idx;
      // Only rename if it's still the bare provider name (hasn't been custom-named)
      const isDefaultName = inst.name === inst.providerId || /^[a-z-]+\d+$/.test(inst.name);
      if (isDefaultName) {
        return { ...inst, name: `${inst.providerId}${idx}` };
      }
    }
    return inst;
  });
}
