import { invoke } from "@tauri-apps/api/core";

export async function historySuggest(line: string): Promise<string | null> {
  try {
    return await invoke<string | null>("history_suggest", { line });
  } catch {
    return null;
  }
}

export async function historyCommands(
  prefix: string,
  limit = 50,
): Promise<string[]> {
  try {
    return await invoke<string[]>("history_commands", { prefix, limit });
  } catch {
    return [];
  }
}

export async function historyList(
  query: string,
  limit = 100,
): Promise<string[]> {
  try {
    return await invoke<string[]>("history_list", { query, limit });
  } catch {
    return [];
  }
}

export async function historyRecord(command: string): Promise<void> {
  try {
    await invoke<void>("history_record", { command });
  } catch {
    // silent
  }
}
