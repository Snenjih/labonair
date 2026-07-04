import type { SearchAddon } from "@xterm/addon-search";
import { containsSchemeSeparator, LOCAL_URL_RE, stripTrailingPunct } from "./detectLocalUrl";
import { DormantRing } from "./dormantRing";
import {
  createShellIntegrationState,
  registerCwdHandler,
  registerPromptTracker,
  registerTerminalQueryHandlers,
  type ShellIntegrationState,
} from "./osc-handlers";
import {
  acquireSlot,
  configureRendererPool,
  discardRetainedSlot,
  disposeLeafSlot,
  focusSlot as poolFocusSlot,
  getLiveSlotForLeaf,
  getSlotForLeaf,
  isLeafAltScreen,
  parkLeafSlot,
  playBell,
  refreshLeafSlot,
  releaseSlot,
  type LeafBridge,
} from "./rendererPool";

/** What a session supplies to write/resize/kick its underlying connection.
 *  Local sessions bridge to `pty.write`/`pty.resize`; SSH sessions bridge to
 *  `invoke("ssh_pty_write"/"ssh_pty_resize", ...)`. Resolved fresh on every
 *  pool call (never cached), so an SSH reconnect swapping the transport never
 *  leaves a bound slot pointing at a dead channel. */
export type SessionBridge = LeafBridge;

export type SessionCallbacks = {
  onSearchReady?: (addon: SearchAddon) => void;
  onExit?: (code: number) => void;
  onCwd?: (cwd: string) => void;
  onDetectedLocalUrl?: (url: string) => void;
};

export type RegisterOptions = {
  sessionId: string;
  bridge: SessionBridge;
  callbacks: SessionCallbacks;
  /** Local-only: invokes `pty_has_foreground_job`. Omitted for SSH — SSH busy
   *  detection is OSC-133-only (no local shell PID to check via tcgetpgrp). */
  checkForegroundJob?: () => Promise<boolean>;
};

type SessionRecord = {
  bridge: SessionBridge;
  callbacks: SessionCallbacks;
  checkForegroundJob?: () => Promise<boolean>;
  container: HTMLDivElement | null;
  visible: boolean;
  focused: boolean;
  commandRunning: boolean;
  shellExited: boolean;
  disposed: boolean;
  snapshot: string | null;
  cols: number;
  rows: number;
  dormantRing: DormantRing;
  altScreenAtRelease: boolean;
  hiddenReleaseTimer: ReturnType<typeof setTimeout> | null;
  hasSlot: boolean;
  shellState: ShellIntegrationState;
  urlDecoder: TextDecoder;
  lastDetectedUrl: string | null;
};

const sessions = new Map<string, SessionRecord>();

const HIDDEN_RELEASE_DELAY_MS = 300;

function leafBusy(s: SessionRecord): boolean {
  return s.commandRunning;
}

function cancelHiddenRelease(s: SessionRecord): void {
  if (s.hiddenReleaseTimer !== null) {
    clearTimeout(s.hiddenReleaseTimer);
    s.hiddenReleaseTimer = null;
  }
}

// A hidden session went idle (command finished): give the post-command
// prompt a moment to render into the live buffer, then hand the slot back.
function scheduleHiddenRelease(sessionId: string, s: SessionRecord): void {
  if (s.visible || !s.hasSlot) return;
  cancelHiddenRelease(s);
  s.hiddenReleaseTimer = setTimeout(() => {
    s.hiddenReleaseTimer = null;
    if (s.disposed || s.visible || !s.hasSlot) return;
    if (isLeafAltScreen(sessionId) || leafBusy(s)) return;
    unbindLeafFromSlot(sessionId, s);
  }, HIDDEN_RELEASE_DELAY_MS);
}

async function checkForegroundBusy(s: SessionRecord): Promise<boolean> {
  if (!s.checkForegroundJob) return false;
  try {
    return await s.checkForegroundJob();
  } catch {
    return false;
  }
}

async function releaseIfIdle(sessionId: string, s: SessionRecord): Promise<void> {
  const busy = await checkForegroundBusy(s);
  if (busy || s.disposed || s.visible || !s.hasSlot) return;
  if (isLeafAltScreen(sessionId) || leafBusy(s)) return;
  unbindLeafFromSlot(sessionId, s);
}

function bindLeafToSlot(sessionId: string, s: SessionRecord): void {
  if (!s.container) return;
  const altScreen = s.altScreenAtRelease;
  s.altScreenAtRelease = false;
  acquireSlot({
    sessionId,
    container: s.container,
    snapshot: s.snapshot,
    altScreen,
    drainRing: (write) => s.dormantRing.drain(write),
    shellExited: s.shellExited,
    // No persisted per-session search query — Labonair's FindWidget already
    // closes on active-pane switch, so there is nothing to restore here.
    searchQuery: null,
    cols: s.cols,
    rows: s.rows,
    registerOsc: (term) => {
      const prompt = registerPromptTracker(term, s.shellState, (running) =>
        setCommandRunning(sessionId, running),
      );
      const cwd = registerCwdHandler(term, (next) => s.callbacks.onCwd?.(next), s.shellState);
      const query = registerTerminalQueryHandlers(term, (d) => s.bridge.writeToPty(d));
      return [prompt.dispose, cwd, query];
    },
    onSearchReady: (addon) => s.callbacks.onSearchReady?.(addon),
  });
  s.snapshot = null;
  s.hasSlot = true;
}

function unbindLeafFromSlot(sessionId: string, s: SessionRecord): void {
  if (!s.hasSlot) return;
  const out = releaseSlot(sessionId);
  if (out) {
    if (out.cols > 0) s.cols = out.cols;
    if (out.rows > 0) s.rows = out.rows;
  }
  s.hasSlot = false;
}

configureRendererPool({
  resolveLeaf(sessionId) {
    return sessions.get(sessionId)?.bridge ?? null;
  },
  evictLeaf(sessionId) {
    const s = sessions.get(sessionId);
    if (!s) return;
    unbindLeafFromSlot(sessionId, s);
  },
  isLeafFocused(sessionId) {
    const s = sessions.get(sessionId);
    return !!s && s.visible && s.focused;
  },
  isLeafBusy(sessionId) {
    const s = sessions.get(sessionId);
    return !!s && leafBusy(s);
  },
  isLeafVisible(sessionId) {
    return sessions.get(sessionId)?.visible ?? false;
  },
  storeSnapshot(sessionId, out) {
    const s = sessions.get(sessionId);
    if (!s) return;
    s.snapshot = out.snapshot;
    if (out.cols > 0) s.cols = out.cols;
    if (out.rows > 0) s.rows = out.rows;
    s.altScreenAtRelease = out.altScreen;
  },
  visibleLeafCount() {
    let n = 0;
    for (const s of sessions.values()) if (s.visible) n++;
    return n;
  },
});

export function registerSession(opts: RegisterOptions): void {
  if (sessions.has(opts.sessionId)) return;
  sessions.set(opts.sessionId, {
    bridge: opts.bridge,
    callbacks: opts.callbacks,
    checkForegroundJob: opts.checkForegroundJob,
    container: null,
    visible: false,
    focused: false,
    commandRunning: false,
    shellExited: false,
    disposed: false,
    snapshot: null,
    cols: 0,
    rows: 0,
    dormantRing: new DormantRing(),
    altScreenAtRelease: false,
    hiddenReleaseTimer: null,
    hasSlot: false,
    shellState: createShellIntegrationState(),
    urlDecoder: new TextDecoder("utf-8", { fatal: false }),
    lastDetectedUrl: null,
  });
}

export function setContainer(sessionId: string, el: HTMLDivElement | null): void {
  const s = sessions.get(sessionId);
  if (!s) return;
  s.container = el;
  if (el && s.visible && !s.hasSlot) bindLeafToSlot(sessionId, s);
}

export function setVisible(sessionId: string, visible: boolean): void {
  const s = sessions.get(sessionId);
  if (!s) return;
  s.visible = visible;
  if (visible) {
    cancelHiddenRelease(s);
    if (s.container && !s.hasSlot) bindLeafToSlot(sessionId, s);
    else if (s.hasSlot) refreshLeafSlot(sessionId);
    if (s.focused) poolFocusSlot(sessionId);
  } else if (s.hasSlot) {
    // Park first (pauses rendering, keeps the grid parsing live); release
    // only after confirming nothing owns the terminal.
    parkLeafSlot(sessionId);
    if (!isLeafAltScreen(sessionId) && !leafBusy(s)) {
      void releaseIfIdle(sessionId, s);
    }
  }
}

export function setFocused(sessionId: string, focused: boolean): void {
  const s = sessions.get(sessionId);
  if (!s) return;
  s.focused = focused;
  if (focused && s.visible) poolFocusSlot(sessionId);
}

export function setCommandRunning(sessionId: string, running: boolean): void {
  const s = sessions.get(sessionId);
  if (!s || s.commandRunning === running) return;
  s.commandRunning = running;
  if (!running) {
    scheduleHiddenRelease(sessionId, s);
    return;
  }
  cancelHiddenRelease(s);
  // A command started in a hidden, released session (e.g. submitted by the
  // AI): rebind so output parses live instead of filling the dormant ring.
  // Deferred: this callback fires inside xterm's parse loop.
  if (!s.visible && !s.hasSlot && s.container && !s.disposed) {
    setTimeout(() => {
      if (s.disposed || s.visible || s.hasSlot || !s.container) return;
      if (!leafBusy(s)) return;
      bindLeafToSlot(sessionId, s);
      parkLeafSlot(sessionId);
    }, 0);
  }
}

export function setShellExited(sessionId: string, exited: boolean): void {
  const s = sessions.get(sessionId);
  if (!s) return;
  s.shellExited = exited;
  const slot = getSlotForLeaf(sessionId);
  if (slot) slot.term.options.disableStdin = exited;
}

export function deliverBytes(sessionId: string, bytes: Uint8Array): void {
  const s = sessions.get(sessionId);
  if (!s) return;

  // Sniff for dev-server URLs regardless of slot binding — cheap byte-level
  // prefilter, runs the same whether output is live-rendered or dormant.
  if (s.callbacks.onDetectedLocalUrl && containsSchemeSeparator(bytes)) {
    const text = s.urlDecoder.decode(bytes, { stream: true });
    const matches = text.match(LOCAL_URL_RE);
    if (matches && matches.length > 0) {
      const url = stripTrailingPunct(matches[matches.length - 1]);
      if (url && url !== s.lastDetectedUrl) {
        s.lastDetectedUrl = url;
        s.callbacks.onDetectedLocalUrl(url);
      }
    }
  }

  // A retained-but-parked slot still parses live (rendering is merely
  // paused) — only a truly unbound session falls back to the byte ring.
  const slot = getLiveSlotForLeaf(sessionId);
  if (slot) {
    slot.term.write(bytes);
  } else {
    s.dormantRing.push(bytes);
    // A bound slot gets BEL via xterm's own onBell (wired once per pool slot);
    // a dormant session has no live parser, so scan the raw bytes instead.
    if (bytes.includes(0x07)) playBell();
  }
}

/** Same as `deliverBytes`, but for a transport that already hands over a
 *  decoded string (SSH's `SshPtyEvent.data` — the Rust side already repairs
 *  UTF-8 before sending, see pty.rs's `flush_carry`). Avoids a pointless
 *  encode-then-decode round trip for the common (bound-slot) case; only the
 *  dormant-ring fallback needs bytes, so it encodes there instead. */
export function deliverText(sessionId: string, text: string): void {
  const s = sessions.get(sessionId);
  if (!s) return;

  if (s.callbacks.onDetectedLocalUrl && text.includes("://")) {
    const matches = text.match(LOCAL_URL_RE);
    if (matches && matches.length > 0) {
      const url = stripTrailingPunct(matches[matches.length - 1]);
      if (url && url !== s.lastDetectedUrl) {
        s.lastDetectedUrl = url;
        s.callbacks.onDetectedLocalUrl(url);
      }
    }
  }

  const slot = getLiveSlotForLeaf(sessionId);
  if (slot) {
    slot.term.write(text);
  } else {
    s.dormantRing.push(new TextEncoder().encode(text));
    if (text.includes("\x07")) playBell();
  }
}

/** SSH reconnect: clears buffered state and, if a slot is bound, resets it
 *  in place instead of releasing it back to the pool (preserves the fast-
 *  rebind path — releasing would force a full teardown/rebuild on the next
 *  bind for no reason, since the session identity/sessionId never changes
 *  across a reconnect). */
export function resetForReconnect(sessionId: string): void {
  const s = sessions.get(sessionId);
  if (!s) return;
  s.dormantRing = new DormantRing();
  s.snapshot = null;
  s.altScreenAtRelease = false;
  s.commandRunning = false;
  s.shellExited = false;
  cancelHiddenRelease(s);
  const slot = getSlotForLeaf(sessionId);
  if (slot) {
    slot.term.options.disableStdin = false;
    slot.term.clear();
    slot.term.reset();
  } else {
    discardRetainedSlot(sessionId);
  }
}

export function write(sessionId: string, data: string): void {
  sessions.get(sessionId)?.bridge.writeToPty(data);
}

export function focus(sessionId: string): void {
  poolFocusSlot(sessionId);
}

export function getSelection(sessionId: string): string | null {
  const slot = getSlotForLeaf(sessionId);
  const sel = slot?.term.getSelection() ?? "";
  return sel.length > 0 ? sel : null;
}

const ANSI_RE = /\x1B\[[0-9;]*[mGKHFJA-Za-z]|\x1B\][^\x07]*\x07|\x1B[@-_][0-?]*[ -/]*[@-~]/g;

function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, "");
}

export function getBuffer(sessionId: string, maxLines = 200): string | null {
  const s = sessions.get(sessionId);
  if (!s) return null;
  const slot = getLiveSlotForLeaf(sessionId);
  if (slot) {
    const buf = slot.term.buffer.active;
    const total = buf.length;
    const lines: string[] = [];
    const start = Math.max(0, total - maxLines);
    for (let i = start; i < total; i++) {
      lines.push(buf.getLine(i)?.translateToString(true) ?? "");
    }
    while (lines.length && lines[lines.length - 1] === "") lines.pop();
    return lines.join("\n");
  }
  if (!s.snapshot) return "";
  const plain = stripAnsi(s.snapshot);
  const lines = plain.split(/\r?\n/);
  const tail = lines.slice(-maxLines);
  while (tail.length && tail[tail.length - 1] === "") tail.pop();
  return tail.join("\n");
}

export function serialize(sessionId: string, scrollback?: number): string | null {
  const slot = getSlotForLeaf(sessionId);
  if (!slot) return sessions.get(sessionId)?.snapshot ?? null;
  return scrollback && scrollback > 0
    ? slot.serializeAddon.serialize({ scrollback })
    : slot.serializeAddon.serialize();
}

export function clear(sessionId: string): void {
  getSlotForLeaf(sessionId)?.term.clear();
}

/** All currently-registered session ids — used by the periodic/quit-time
 *  scrollback flush to find sessions with dormant-ring content to flush
 *  (bound/retained sessions simply have an empty ring, so iterating all of
 *  them and skipping the empty ones is cheap and correct). */
export function getAllSessionIds(): string[] {
  return Array.from(sessions.keys());
}

/** Non-destructive read of a dormant session's buffered output — used for
 *  the periodic/quit-time scrollback flush, which must not consume the ring
 *  (a later reactivation still needs it to replay). */
export function peekDormantAnsi(sessionId: string): string | null {
  const s = sessions.get(sessionId);
  if (!s || s.dormantRing.byteLength() === 0) return null;
  const decoder = new TextDecoder("utf-8", { fatal: false });
  const parts: string[] = [];
  s.dormantRing.peek((bytes) => parts.push(decoder.decode(bytes, { stream: true })));
  return parts.join("");
}

/** Tab/pane close: frees a bound or merely-retained slot (no-op if neither
 *  exists) and removes the session record. Actually closing the backend
 *  connection (pty_close / ssh_disconnect) stays the caller's job. */
export function disposeSession(sessionId: string): void {
  const s = sessions.get(sessionId);
  if (!s) return;
  s.disposed = true;
  cancelHiddenRelease(s);
  disposeLeafSlot(sessionId);
  s.hasSlot = false;
  s.snapshot = null;
  sessions.delete(sessionId);
}

export function terminalDebugStats() {
  return [...sessions.entries()].map(([sessionId, s]) => ({
    sessionId,
    visible: s.visible,
    focused: s.focused,
    hasSlot: s.hasSlot,
    commandRunning: s.commandRunning,
    ringBytes: s.dormantRing.byteLength(),
    snapshotLen: s.snapshot?.length ?? 0,
    shellExited: s.shellExited,
  }));
}

if (import.meta.env?.DEV && typeof window !== "undefined") {
  (window as unknown as { __labonairTerm?: unknown }).__labonairTerm = terminalDebugStats;
}
