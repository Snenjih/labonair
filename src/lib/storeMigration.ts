import { load } from "@tauri-apps/plugin-store";

const LS_MIGRATIONS: [string, string][] = [
  ["nexum-selected-model", "labonair-selected-model"],
  ["nexum-recent-models", "labonair-recent-models"],
  ["nexum-favorite-models", "labonair-favorite-models"],
  ["nexum-ui-theme-shadow", "labonair-ui-theme-shadow"],
  ["nexum-palette-recent", "labonair-palette-recent"],
  ["nexum:updater:last-check", "labonair:updater:last-check"],
];

const STORE_MIGRATIONS: [string, string][] = [
  ["nexum-settings.json", "labonair-settings.json"],
  ["nexum-keybinds.json", "labonair-keybinds.json"],
  ["nexum-directives.json", "labonair-directives.json"],
  ["nexum-agents.json", "labonair-agents.json"],
  ["nexum-session.json", "labonair-session.json"],
  ["nexum-sessions.json", "labonair-sessions.json"],
  ["nexum-todos.json", "labonair-todos.json"],
  ["nexum-bookmarks.json", "labonair-bookmarks.json"],
  ["nexum-git.json", "labonair-git.json"],
];

const MIGRATION_DONE_KEY = "labonair:store-migration-v1";

export async function runStoreMigration(): Promise<void> {
  if (localStorage.getItem(MIGRATION_DONE_KEY)) return;

  // localStorage key migration
  for (const [oldKey, newKey] of LS_MIGRATIONS) {
    const value = localStorage.getItem(oldKey);
    if (value !== null && !localStorage.getItem(newKey)) {
      localStorage.setItem(newKey, value);
      localStorage.removeItem(oldKey);
    }
  }

  // Tauri store file migration
  for (const [oldPath, newPath] of STORE_MIGRATIONS) {
    try {
      const oldStore = await load(oldPath, { autoSave: false, defaults: {} });
      const entries = await oldStore.entries();
      if (entries.length === 0) continue;
      const newStore = await load(newPath, { autoSave: false, defaults: {} });
      for (const [key, value] of entries) {
        const existing = await newStore.get(key);
        if (existing === undefined || existing === null) {
          await newStore.set(key, value);
        }
      }
      await newStore.save();
    } catch {
      // Old store doesn't exist or is empty — nothing to migrate
    }
  }

  localStorage.setItem(MIGRATION_DONE_KEY, "1");
}
