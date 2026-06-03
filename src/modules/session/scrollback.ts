import { invoke } from "@tauri-apps/api/core";
import { usePreferencesStore } from "@/modules/settings/preferences";
import type { TerminalPaneHandle } from "@/modules/terminal/TerminalPane";

type ScrollbackLive = {
  getAllTerminalRefs: () => Map<string, TerminalPaneHandle>;
};

let _live: ScrollbackLive | null = null;

export function setScrollbackLive(live: ScrollbackLive): void {
  _live = live;
}

export async function saveAllScrollbacks(sessionIds: string[]): Promise<void> {
  const refs = _live?.getAllTerminalRefs();
  if (!refs) return;
  await Promise.all(
    sessionIds.map(async (sessionId) => {
      const handle = refs.get(sessionId);
      if (!handle) return; // terminal not mounted yet
      const scrollbackLimit = usePreferencesStore.getState().sessionScrollbackLines;
      const ansi = handle.serialize(scrollbackLimit > 0 ? scrollbackLimit : undefined);
      if (!ansi || ansi.trim().length === 0) return; // empty buffer
      if (ansi.length > 10 * 1024 * 1024) return; // oversized guard
      try {
        await invoke("scrollback_save", { sessionId, ansi });
      } catch (e) {
        console.warn("[scrollback] save failed:", sessionId, e);
      }
    }),
  );
}

export async function cleanupScrollbacks(knownSessionIds: string[]): Promise<void> {
  try {
    await invoke("scrollback_cleanup", { knownSessionIds });
  } catch (e) {
    console.warn("[scrollback] cleanup failed:", e);
  }
}
