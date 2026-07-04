import { invoke } from "@tauri-apps/api/core";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { getAllSuspendedSessionIds, getSuspendedAnsi } from "@/modules/terminal/lib/suspendedSessionBuffer";
import type { TerminalPaneHandle } from "@/modules/terminal/TerminalPane";

const MAX_SCROLLBACK_BYTES = 10 * 1024 * 1024;

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
      if (ansi.length > MAX_SCROLLBACK_BYTES) return; // oversized guard
      try {
        await invoke("scrollback_save", { sessionId, ansi });
      } catch (e) {
        console.warn("[scrollback] save failed:", sessionId, e);
      }
    }),
  );
}

/**
 * Appends a suspended session's buffered output (accumulated since the
 * suspend-time snapshot taken in tabVirtualization.ts) onto its on-disk
 * scrollback file. `scrollback_save` overwrites the whole file, so this
 * loads the existing content first — otherwise closing/quitting with a
 * suspended tab would silently drop everything captured at suspend time.
 * No-op if nothing was buffered (the common case for a quiet background tab).
 */
export async function flushSuspendedScrollback(sessionId: string): Promise<void> {
  const buffered = getSuspendedAnsi(sessionId);
  if (!buffered) return;
  try {
    const existing = (await invoke<string | null>("scrollback_load", { sessionId })) ?? "";
    const combined = existing + buffered;
    if (combined.trim().length === 0 || combined.length > MAX_SCROLLBACK_BYTES) return;
    await invoke("scrollback_save", { sessionId, ansi: combined });
  } catch (e) {
    console.warn("[scrollback] suspended flush failed:", sessionId, e);
  }
}

/** Flushes every currently-suspended session — used on app quit so a
 *  backgrounded-and-suspended tab's recent output isn't lost. */
export async function flushAllSuspendedScrollbacks(): Promise<void> {
  await Promise.all(getAllSuspendedSessionIds().map((id) => flushSuspendedScrollback(id)));
}

export async function cleanupScrollbacks(knownSessionIds: string[]): Promise<void> {
  try {
    await invoke("scrollback_cleanup", { knownSessionIds });
  } catch (e) {
    console.warn("[scrollback] cleanup failed:", e);
  }
}
