import { LazyStore } from "@tauri-apps/plugin-store";
import { getStoragePaths } from "@/lib/paths";
import { type SessionSnapshot, SESSION_SNAPSHOT_VERSION } from "./types";

const SNAPSHOT_KEY = "snapshot";

let _storePromise: Promise<LazyStore> | null = null;

async function getStore(): Promise<LazyStore> {
  if (!_storePromise) {
    _storePromise = getStoragePaths().then(
      (p) => new LazyStore(`${p.config}/labonair-session.json`, { defaults: {}, autoSave: 200 }),
    );
  }
  return _storePromise;
}

export async function saveSnapshot(snapshot: SessionSnapshot): Promise<void> {
  const store = await getStore();
  await store.set(SNAPSHOT_KEY, snapshot);
  await store.save();
}

export async function loadSnapshot(): Promise<SessionSnapshot | null> {
  const store = await getStore();
  const raw = await store.get<SessionSnapshot>(SNAPSHOT_KEY);
  if (!raw || typeof raw !== "object") return null;
  if ((raw as SessionSnapshot).version !== SESSION_SNAPSHOT_VERSION) {
    await store.delete(SNAPSHOT_KEY);
    await store.save();
    return null;
  }
  return raw as SessionSnapshot;
}

export async function clearSnapshot(): Promise<void> {
  const store = await getStore();
  await store.delete(SNAPSHOT_KEY);
  await store.save();
}
