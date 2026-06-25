import { LazyStore } from "@tauri-apps/plugin-store";
import { getStoragePaths } from "@/lib/paths";

export type Directive = {
  id: string;
  /** The "#handle" used in the composer. Lowercase, [a-z0-9-]+. */
  handle: string;
  name: string;
  description: string;
  content: string;
};

const KEY_LIST = "directives";

let _storePromise: Promise<LazyStore> | null = null;
async function getStore(): Promise<LazyStore> {
  if (!_storePromise) {
    _storePromise = getStoragePaths().then(
      (p) => new LazyStore(`${p.config}/labonair-directives.json`, { defaults: {}, autoSave: 200 }),
    );
  }
  return _storePromise;
}

async function migrateFromSnippets(): Promise<Directive[]> {
  try {
    const p = await getStoragePaths();
    const oldStore = new LazyStore(`${p.config}/labonair-snippets.json`, { defaults: {}, autoSave: false });
    const old = await oldStore.get<Directive[]>("snippets");
    return old ?? [];
  } catch {
    return [];
  }
}

export async function loadDirectives(): Promise<Directive[]> {
  const store = await getStore();
  const list = await store.get<Directive[]>(KEY_LIST);
  if (!list) {
    const migrated = await migrateFromSnippets();
    if (migrated.length > 0) {
      await saveDirectives(migrated);
      return migrated;
    }
    return [];
  }
  return list;
}

export async function saveDirectives(list: Directive[]): Promise<void> {
  const store = await getStore();
  await store.set(KEY_LIST, list);
  await store.save();
}

export function newDirectiveId(): string {
  return `dir-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

const HANDLE_RE = /^[a-z0-9][a-z0-9-]*$/;

export function normalizeHandle(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function isValidHandle(h: string): boolean {
  return HANDLE_RE.test(h);
}

/**
 * Replace `#handle` tokens in `text` with their directive bodies, wrapped in
 * `<directive name="…">…</directive>` blocks, prepended to the message. Tokens
 * that don't match a known directive are left as-is.
 *
 * Returns the rewritten body (with tokens stripped) and the list of expanded
 * directive blocks to prepend.
 */
export function expandDirectiveTokens(
  text: string,
  directives: readonly Directive[],
): { body: string; blocks: string[] } {
  const byHandle = new Map(directives.map((d) => [d.handle, d]));
  const matched = new Map<string, Directive>();
  // (^|\s)#handle  — handle is [a-z0-9][a-z0-9-]*
  const re = /(^|\s)#([a-z0-9][a-z0-9-]*)\b/gi;
  const body = text.replace(re, (full, lead: string, raw: string) => {
    const h = raw.toLowerCase();
    const dir = byHandle.get(h);
    if (!dir) return full;
    matched.set(dir.id, dir);
    return lead;
  });
  const blocks = Array.from(matched.values()).map(
    (d) => `<directive name="${d.handle}">\n${d.content}\n</directive>`,
  );
  return { body: body.replace(/[ \t]+\n/g, "\n").trim(), blocks };
}
