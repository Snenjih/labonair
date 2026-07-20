import { load } from "@tauri-apps/plugin-store";
import { create } from "zustand";
import { getStoragePaths } from "@/lib/paths";
import type { Host } from "@/modules/hosts";

export type PathBookmark = {
  id: string;
  path: string;
  label?: string;
  /** undefined = local */
  hostId?: string;
};

type BookmarksFile = { bookmarks: PathBookmark[] };

export function bookmarkKey(hostId: string | undefined, path: string): string {
  return `${hostId ?? "local"}::${path}`;
}

/** Live lookup, no persisted flag — a bookmark whose host was deleted is kept
 *  (inert user data, not a DB referential-integrity problem), just flagged in
 *  the UI so it can be manually removed. */
export function isBookmarkOrphaned(bm: PathBookmark, hosts: Host[]): boolean {
  return bm.hostId !== undefined && !hosts.some((h) => h.id === bm.hostId);
}

/** Pure dedup/insert logic, split out so it's testable without the
 *  persistence layer: an existing (hostId, path) pair updates its label (if a
 *  non-empty, different one was passed) or no-ops, never creates a second
 *  entry for the same key. */
export function computeAddBookmark(
  current: PathBookmark[],
  hostId: string | undefined,
  path: string,
  label?: string,
): PathBookmark[] {
  const key = bookmarkKey(hostId, path);
  const existingIdx = current.findIndex((b) => bookmarkKey(b.hostId, b.path) === key);
  if (existingIdx === -1) {
    return [...current, { id: crypto.randomUUID(), path, hostId, label }];
  }
  const existing = current[existingIdx];
  if (!label || label === existing.label) return current; // no-op
  return current.map((b, i) => (i === existingIdx ? { ...b, label } : b));
}

export function computeRemoveByPath(
  current: PathBookmark[],
  hostId: string | undefined,
  path: string,
): PathBookmark[] {
  const key = bookmarkKey(hostId, path);
  return current.filter((b) => bookmarkKey(b.hostId, b.path) !== key);
}

interface PathBookmarksState {
  bookmarks: PathBookmark[];
  hydrated: boolean;
  hydrate: () => Promise<void>;
  addBookmark: (hostId: string | undefined, path: string, label?: string) => Promise<void>;
  removeBookmark: (id: string) => Promise<void>;
  removeByPath: (hostId: string | undefined, path: string) => Promise<void>;
  isBookmarked: (hostId: string | undefined, path: string) => boolean;
  findBookmark: (hostId: string | undefined, path: string) => PathBookmark | undefined;
}

// Single shared promise prevents double-initialization on concurrent calls.
let _storePromise: ReturnType<typeof load> | null = null;

function getStore() {
  if (!_storePromise) {
    _storePromise = getStoragePaths().then((p) =>
      load(`${p.data}/labonair-path-bookmarks.json`, { autoSave: true, defaults: {} }),
    );
  }
  return _storePromise;
}

// Serialize all writes so concurrent addBookmark/removeBookmark calls (from
// the breadcrumb, SFTP menu, and explorer entry points) never read stale
// state and overwrite each other's result.
let _writeLock: Promise<void> = Promise.resolve();

function enqueueWrite(fn: () => Promise<void>) {
  _writeLock = _writeLock.then(fn).catch(() => {});
  return _writeLock;
}

export const usePathBookmarksStore = create<PathBookmarksState>((set, get) => ({
  bookmarks: [],
  hydrated: false,

  hydrate: async () => {
    if (get().hydrated) return;
    const store = await getStore();
    const raw = await store.get<BookmarksFile>("bookmarks");
    set({ bookmarks: raw?.bookmarks ?? [], hydrated: true });
  },

  addBookmark: (hostId, path, label) =>
    enqueueWrite(async () => {
      const current = get().bookmarks;
      const next = computeAddBookmark(current, hostId, path, label);
      if (next === current) return; // no-op, already bookmarked with this label
      set({ bookmarks: next });
      const store = await getStore();
      await store.set("bookmarks", { bookmarks: next });
    }),

  removeBookmark: (id) =>
    enqueueWrite(async () => {
      const next = get().bookmarks.filter((b) => b.id !== id);
      set({ bookmarks: next });
      const store = await getStore();
      await store.set("bookmarks", { bookmarks: next });
    }),

  removeByPath: (hostId, path) =>
    enqueueWrite(async () => {
      const next = computeRemoveByPath(get().bookmarks, hostId, path);
      set({ bookmarks: next });
      const store = await getStore();
      await store.set("bookmarks", { bookmarks: next });
    }),

  isBookmarked: (hostId, path) => {
    const key = bookmarkKey(hostId, path);
    return get().bookmarks.some((b) => bookmarkKey(b.hostId, b.path) === key);
  },

  findBookmark: (hostId, path) => {
    const key = bookmarkKey(hostId, path);
    return get().bookmarks.find((b) => bookmarkKey(b.hostId, b.path) === key);
  },
}));
