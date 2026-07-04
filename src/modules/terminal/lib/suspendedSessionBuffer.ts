import type { Channel } from "@tauri-apps/api/core";
import { LOCAL_URL_RE, stripTrailingPunct } from "./detectLocalUrl";

// Reuses the on-disk scrollback cap (see scrollback.ts / scrollback/mod.rs)
// as the in-memory rolling-buffer cap too, so a suspended tab that receives a
// lot of output (a noisy build, `yes`, …) never grows unbounded — oldest
// chunks are evicted first.
const MAX_BUFFER_BYTES = 10 * 1024 * 1024;

export type SuspendCallbacks = {
  /** Fired when a dev-server-style local URL is spotted in buffered output —
   *  kept lightly alive while suspended (cheap text scan, no xterm/WebGL). */
  onUrlDetected?: (url: string) => void;
  /** Fired when a BEL (0x07) byte is spotted — same "keep lightly alive"
   *  rationale as URL detection (e.g. a background build finishing). */
  onBell?: () => void;
};

/** What a suspend/resume cycle decodes out of one raw channel message. */
export type DecodedChunk = { text?: string; exitCode?: number };

type SuspendedEntry = {
  channel: Channel<never>;
  /** Local PTY's numeric backend id (needed for pty_write/pty_resize/pty_close).
   *  Undefined for SSH sessions, which are keyed by `sessionId` on the backend too. */
  backendId?: number;
  chunks: string[];
  totalBytes: number;
  exitCode?: number;
};

const registry = new Map<string, SuspendedEntry>();

function pushChunk(entry: SuspendedEntry, text: string, callbacks?: SuspendCallbacks): void {
  entry.chunks.push(text);
  entry.totalBytes += text.length;
  while (entry.totalBytes > MAX_BUFFER_BYTES && entry.chunks.length > 1) {
    const dropped = entry.chunks.shift();
    if (dropped) entry.totalBytes -= dropped.length;
  }

  if (callbacks?.onBell && text.includes("\x07")) callbacks.onBell();
  if (callbacks?.onUrlDetected) {
    const matches = text.match(LOCAL_URL_RE);
    if (matches && matches.length > 0) {
      const url = stripTrailingPunct(matches[matches.length - 1]);
      if (url) callbacks.onUrlDetected(url);
    }
  }
}

/**
 * Suspends a session: re-points `channel.onmessage` from "write to xterm" to
 * "buffer in memory" (plus the lightweight URL/bell scans above), and
 * registers it so `resumeSession`/`isSuspended`/`closeSuspendedSession` can
 * find it later. The channel and underlying PTY/SSH connection are NOT
 * closed — only the caller's rendering (xterm/WebGL/listeners) is torn down.
 */
export function suspendSession(
  sessionId: string,
  channel: Channel<never>,
  decode: (event: unknown) => DecodedChunk,
  callbacks?: SuspendCallbacks,
  backendId?: number,
): void {
  const entry: SuspendedEntry = { channel, backendId, chunks: [], totalBytes: 0 };
  channel.onmessage = (event: unknown) => {
    const decoded = decode(event);
    if (decoded.text) pushChunk(entry, decoded.text, callbacks);
    if (decoded.exitCode !== undefined) entry.exitCode = decoded.exitCode;
  };
  registry.set(sessionId, entry);
}

export type ResumedSession = {
  channel: Channel<never>;
  backendId?: number;
  /** Buffered output accumulated while suspended, in arrival order. */
  replay: string;
  /** Set if the underlying process/connection exited while suspended. */
  exitCode?: number;
};

/** Idempotent — a second call for the same `sessionId` returns `null`. */
export function resumeSession(sessionId: string): ResumedSession | null {
  const entry = registry.get(sessionId);
  if (!entry) return null;
  registry.delete(sessionId);
  return {
    channel: entry.channel,
    backendId: entry.backendId,
    replay: entry.chunks.join(""),
    exitCode: entry.exitCode,
  };
}

export function isSuspended(sessionId: string): boolean {
  return registry.has(sessionId);
}

/** Buffered output for a still-suspended session, without resuming it. */
export function getSuspendedAnsi(sessionId: string): string | null {
  const entry = registry.get(sessionId);
  return entry ? entry.chunks.join("") : null;
}

export function getAllSuspendedSessionIds(): string[] {
  return Array.from(registry.keys());
}

/** Used when a suspended tab is closed outright (not resumed) — returns the
 *  handle needed to actually disconnect/kill the backend session. */
export function closeSuspendedSession(
  sessionId: string,
): { channel: Channel<never>; backendId?: number } | null {
  const entry = registry.get(sessionId);
  if (!entry) return null;
  registry.delete(sessionId);
  return { channel: entry.channel, backendId: entry.backendId };
}
