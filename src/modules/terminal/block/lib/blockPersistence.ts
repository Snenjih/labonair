import { invoke } from "@tauri-apps/api/core";
import type { BlockMeta } from "./types";

export async function saveBlockMeta(
  sessionId: string,
  blocks: BlockMeta[],
): Promise<void> {
  try {
    await invoke("block_meta_save", {
      sessionId,
      blocksJson: JSON.stringify(blocks),
    });
  } catch {
    // non-fatal — persistence is best-effort
  }
}

export async function loadBlockMeta(
  sessionId: string,
): Promise<BlockMeta[] | null> {
  try {
    const json = await invoke<string | null>("block_meta_load", { sessionId });
    if (!json) return null;
    return JSON.parse(json) as BlockMeta[];
  } catch {
    return null;
  }
}
