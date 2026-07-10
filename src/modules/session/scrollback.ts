import { invoke } from "@tauri-apps/api/core";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { getAllSessionIds, peekDormantAnsi } from "@/modules/terminal/lib/terminalSessionRegistry";
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

// Marks the boundary between previously-saved content and a freshly-flushed
// dormant-ring chunk. `buffered` is a raw, unparsed byte tail — splicing it
// straight onto an unrelated serialize() snapshot with no marker makes a
// single garbled cut look like corrupted live rendering. This isn't a fix
// for that garbling itself, just makes each boundary legible.
const DORMANT_FLUSH_SEPARATOR = `\r\n\x1b[2m\x1b[90m${"─".repeat(24)} background output ${"─".repeat(24)}\x1b[0m\r\n\r\n`;

/**
 * Appends a dormant session's buffered output (accumulated in its renderer-
 * pool dormant ring while it had no bound slot — see terminalSessionRegistry.ts)
 * onto its on-disk scrollback file. `scrollback_save` overwrites the whole
 * file, so this loads the existing content first — otherwise quitting while
 * a backgrounded tab is dormant would silently drop everything it buffered.
 * `peekDormantAnsi` only returns bytes new since the last call, so repeated
 * ticks append rather than re-duplicate the whole ring each time.
 * No-op if nothing new was buffered (the common case for a quiet background
 * tab, and always the case for a currently-bound session, whose ring is empty).
 */
export async function flushDormantScrollback(sessionId: string): Promise<void> {
  const buffered = peekDormantAnsi(sessionId);
  if (!buffered) return;
  try {
    const existing = (await invoke<string | null>("scrollback_load", { sessionId })) ?? "";
    const combined = existing ? existing + DORMANT_FLUSH_SEPARATOR + buffered : buffered;
    if (combined.trim().length === 0 || combined.length > MAX_SCROLLBACK_BYTES) return;
    await invoke("scrollback_save", { sessionId, ansi: combined });
  } catch (e) {
    console.warn("[scrollback] dormant flush failed:", sessionId, e);
  }
}

/** Flushes every registered session's dormant-ring content — used on app quit
 *  so a backgrounded tab's recent output isn't lost. */
export async function flushAllDormantScrollbacks(): Promise<void> {
  await Promise.all(getAllSessionIds().map((id) => flushDormantScrollback(id)));
}

export async function cleanupScrollbacks(knownSessionIds: string[]): Promise<void> {
  try {
    await invoke("scrollback_cleanup", { knownSessionIds });
  } catch (e) {
    console.warn("[scrollback] cleanup failed:", e);
  }
}
