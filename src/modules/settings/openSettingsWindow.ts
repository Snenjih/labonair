import { invoke } from "@tauri-apps/api/core";

export type SettingsTab =
  | "general"
  | "appearance"
  | "themes"
  | "terminal"
  | "editor"
  | "command-palette"
  | "source-control"
  | "shortcuts"
  | "models"
  | "agents"
  | "ai"
  | "directives"
  | "security"
  | "about";

export async function openSettingsWindow(tab?: SettingsTab): Promise<void> {
  await invoke("open_settings_window", { tab: tab ?? null });
}
