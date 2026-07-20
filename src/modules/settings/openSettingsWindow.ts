import { invoke } from "@tauri-apps/api/core";

export type SettingsTab =
  | "general"
  | "appearance"
  | "themes"
  | "terminal"
  | "file-manager"
  | "editor"
  | "connections"
  | "source-control"
  | "command-palette"
  | "shortcuts"
  | "models"
  | "agents"
  | "ai"
  | "directives"
  | "security"
  | "bookmarks"
  | "about";

export async function openSettingsWindow(tab?: SettingsTab): Promise<void> {
  await invoke("open_settings_window", { tab: tab ?? null });
}
