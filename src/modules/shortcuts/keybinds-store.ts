import { emit, listen, type UnlistenFn } from "@tauri-apps/api/event";
import { LazyStore } from "@tauri-apps/plugin-store";
import { getStoragePaths } from "@/lib/paths";
import type { KeyBindingMap, KeyBindingOrDisabled } from "./types";

let _storePromise: Promise<LazyStore> | null = null;

async function getStore(): Promise<LazyStore> {
  if (!_storePromise) {
    _storePromise = getStoragePaths().then(
      (p) => new LazyStore(`${p.config}/labonair-keybinds.json`, { defaults: {}, autoSave: 200 }),
    );
  }
  return _storePromise;
}

export async function loadKeybinds(): Promise<KeyBindingMap> {
  try {
    const store = await getStore();
    const entries = await store.entries();
    const map: KeyBindingMap = {};
    for (const [key, value] of entries) {
      map[key] = value as KeyBindingOrDisabled;
    }
    return map;
  } catch {
    return {};
  }
}

export async function saveKeybind(id: string, binding: KeyBindingOrDisabled): Promise<void> {
  const store = await getStore();
  await store.set(id, binding);
  await store.save();
  await emitKeybindsChanged();
}

export async function resetKeybind(id: string): Promise<void> {
  const store = await getStore();
  await store.delete(id);
  await store.save();
  await emitKeybindsChanged();
}

export async function resetAllKeybinds(): Promise<void> {
  const store = await getStore();
  await store.clear();
  await store.save();
  await emitKeybindsChanged();
}

export async function onKeybindsChange(
  cb: (id: string, binding: KeyBindingOrDisabled) => void,
): Promise<UnlistenFn> {
  const store = await getStore();
  return store.onChange<KeyBindingOrDisabled>((key, value) => {
    cb(key, value ?? null);
  });
}

const KEYBINDS_CHANGED_EVENT = "labonair://keybinds-changed";

export async function emitKeybindsChanged(): Promise<void> {
  await emit(KEYBINDS_CHANGED_EVENT);
}

export function onKeybindsChanged(cb: () => void): Promise<UnlistenFn> {
  return listen(KEYBINDS_CHANGED_EVENT, () => cb());
}
