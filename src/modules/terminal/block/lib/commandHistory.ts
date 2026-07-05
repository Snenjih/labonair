import { LazyStore } from "@tauri-apps/plugin-store";
import { getStoragePaths } from "@/lib/paths";

// TODO: also search src/modules/snippets (user-saved reusable commands, see
// commandSnippetsStore.ts) as a suggestion source alongside raw history —
// snippets are curated/named, history is just "what you typed before".
// Merging the two lets Tab-complete surface saved snippets as well, not
// just past commands. Not built yet — v1 ghost-text is history-only.

const KEY_HISTORY = "history";
const MAX_HISTORY = 1000;

let _storePromise: Promise<LazyStore> | null = null;
async function getStore(): Promise<LazyStore> {
  if (!_storePromise) {
    _storePromise = getStoragePaths().then(
      (p) => new LazyStore(`${p.data}/labonair-command-history.json`, { defaults: {}, autoSave: 200 }),
    );
  }
  return _storePromise;
}

let cache: string[] | null = null;
// Kicked off at module import time (mirrors preferences.ts's early-load
// pattern) so `suggest()`/`historyList()` — both synchronous, for use in a
// CodeMirror update listener — have data as soon as possible after boot.
const _earlyLoadP: Promise<string[]> = ensureLoaded();

async function ensureLoaded(): Promise<string[]> {
  if (cache) return cache;
  const loaded = (await (await getStore()).get<string[]>(KEY_HISTORY)) ?? [];
  cache = loaded;
  return loaded;
}

export async function preloadCommandHistory(): Promise<void> {
  await _earlyLoadP;
}

export async function recordCommand(command: string): Promise<void> {
  const trimmed = command.trim();
  if (!trimmed) return;
  const list = await ensureLoaded();
  const next = list.filter((c) => c !== trimmed);
  next.push(trimmed);
  if (next.length > MAX_HISTORY) next.splice(0, next.length - MAX_HISTORY);
  cache = next;
  await (await getStore()).set(KEY_HISTORY, next);
}

/** Ghost-text suggestion for `prefix` — the most recently used command that
 *  starts with it (searched newest-first), or null. Caller renders the
 *  remainder after `prefix` as dim inline text, Tab to accept. */
export function suggest(prefix: string): string | null {
  if (!prefix || !cache) return null;
  for (let i = cache.length - 1; i >= 0; i--) {
    if (cache[i] !== prefix && cache[i].startsWith(prefix)) return cache[i];
  }
  return null;
}

/** Oldest-first, for Up/Down history navigation (most recent = last). */
export function historyList(): string[] {
  return cache ?? [];
}
