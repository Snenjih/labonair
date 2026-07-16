import { usePreferencesStore } from "@/modules/settings/preferences";
import { buildTerminalTheme } from "@/styles/terminalTheme";
import { openUrl } from "@tauri-apps/plugin-opener";
import { FitAddon } from "@xterm/addon-fit";
import { ImageAddon } from "@xterm/addon-image";
import { LigaturesAddon } from "@xterm/addon-ligatures";
import { SearchAddon } from "@xterm/addon-search";
import { SerializeAddon } from "@xterm/addon-serialize";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { WebglAddon } from "@xterm/addon-webgl";
import { type FontWeight, Terminal } from "@xterm/xterm";
import { computePoolCeiling, selectEvictionCandidate, type EvictionCandidate } from "./rendererPoolSizing";

const FIT_DEBOUNCE_MS = 8;
const PTY_RESIZE_DEBOUNCE_MS = 256;
const SNAPSHOT_SCROLLBACK_CAP = 5_000;
// Per-frame write budget for beginChunkedReplay — an empirical starting
// point, tunable via scripts/terminal-test.sh --perf on real hardware.
const REPLAY_BUDGET_BYTES = 48 * 1024;

const FONT_WEIGHT_MAP: Record<string, string | number> = {
  normal: "normal",
  medium: 500,
  bold: "bold",
};

export {
  computePoolCeiling,
  selectEvictionCandidate,
  POOL_BASE_SIZE,
  RESERVED_HEADROOM,
  POOL_HARD_CAP,
} from "./rendererPoolSizing";
export type { EvictionCandidate } from "./rendererPoolSizing";

export type SlotAdapter = {
  resolveLeaf(sessionId: string): LeafBridge | null;
  evictLeaf(sessionId: string): void;
  isLeafFocused(sessionId: string): boolean;
  isLeafBusy(sessionId: string): boolean;
  isLeafVisible(sessionId: string): boolean;
  storeSnapshot(sessionId: string, out: SerializeOutput): void;
  /** Count of sessions currently visible across the whole app — drives
   *  computePoolCeiling so a visible split pane is never starved of a slot. */
  visibleLeafCount(): number;
};

export type LeafBridge = {
  writeToPty(data: string): void;
  resizePty(cols: number, rows: number): void;
  // Force a SIGWINCH on the underlying PTY/channel at the given dims — used
  // to make an alt-screen TUI (vim, htop, …) repaint from scratch after it
  // was dormant, instead of replaying its buffered redraw frames.
  kickPty(cols: number, rows: number): void;
};

export type Slot = {
  readonly id: number;
  readonly term: Terminal;
  readonly fitAddon: FitAddon;
  readonly searchAddon: SearchAddon;
  readonly serializeAddon: SerializeAddon;
  readonly host: HTMLDivElement;
  webglAddon: WebglAddon | null;
  webglCanvases: HTMLCanvasElement[];
  currentLeafId: string | null;
  // Session whose buffer this slot still holds intact after release; only
  // serialized if another session steals the slot.
  retainedLeafId: string | null;
  parked: boolean;
  oscDisposers: (() => void)[];
  observer: ResizeObserver | null;
  fitTimer: ReturnType<typeof setTimeout> | null;
  ptyTimer: ReturnType<typeof setTimeout> | null;
  webglReapTimer: ReturnType<typeof setTimeout> | null;
  slotReapTimer: ReturnType<typeof setTimeout> | null;
  unhideRaf: number | null;
  lastCols: number;
  lastRows: number;
  lastW: number;
  lastH: number;
  lastUsedAt: number;
  // Chunked cold-rebind replay (see beginChunkedReplay) — true only while a
  // snapshot/ring replay is in flight across animation frames.
  replaying: boolean;
  // Bumped on every new replay start and on disposeSlot so an in-flight
  // rAF step for a stale replay aborts instead of writing into a slot that
  // has since been reassigned, rebound again, or destroyed.
  replayToken: number;
  // Live output that arrived while `replaying` was true, in arrival order —
  // flushed only after the full snapshot/ring replay completes so historical
  // bytes are never interleaved behind newer ones.
  replayQueue: (string | Uint8Array)[] | null;
};

const slots: Slot[] = [];
let recyclerEl: HTMLDivElement | null = null;
let adapter: SlotAdapter | null = null;
let lastFocusedSlot: Slot | null = null;
let copyListenerBound = false;

function poolCeiling(): number {
  return computePoolCeiling(adapter?.visibleLeafCount() ?? 0);
}

// On macOS in WKWebView, Cmd+C triggers the native Copy menu command which
// copies DOM selection (empty for canvas-based xterm). Intercept the `copy`
// event once at the pool level and write whichever slot was last focused —
// one listener shared across every slot instead of one per session.
function bindCopyListener(): void {
  if (copyListenerBound || typeof document === "undefined") return;
  copyListenerBound = true;
  document.addEventListener(
    "copy",
    (e: ClipboardEvent) => {
      const text = lastFocusedSlot?.term.getSelection();
      if (!text) return;
      e.clipboardData?.setData("text/plain", text);
      e.preventDefault();
    },
    { capture: true },
  );
}

let preferencesListenerBound = false;

// Single module-level subscription applies live preference changes to every
// slot, regardless of which pane types (local/SSH) happen to be mounted —
// a workspace with only SSH tabs open would otherwise never see live
// font/cursor/etc. changes if this lived in a per-session-kind hook instead.
function bindPreferencesListener(): void {
  if (preferencesListenerBound) return;
  preferencesListenerBound = true;
  usePreferencesStore.subscribe((state, prev) => {
    if (state.terminalCursorBlink !== prev.terminalCursorBlink) applyCursorBlink(state.terminalCursorBlink);
    if (state.terminalCursorStyle !== prev.terminalCursorStyle) applyCursorStyle(state.terminalCursorStyle);
    if (state.terminalFontFamily !== prev.terminalFontFamily) applyFontFamily(state.terminalFontFamily);
    if (state.terminalFontSize !== prev.terminalFontSize) applyFontSize(state.terminalFontSize);
    if (state.terminalLetterSpacing !== prev.terminalLetterSpacing)
      applyLetterSpacing(state.terminalLetterSpacing);
    if (state.terminalLineHeight !== prev.terminalLineHeight) applyLineHeight(state.terminalLineHeight);
    if (state.terminalFontWeight !== prev.terminalFontWeight) applyFontWeight(state.terminalFontWeight);
    if (state.terminalRightClickPastes !== prev.terminalRightClickPastes)
      applyRightClickPastes(state.terminalRightClickPastes);
    if (state.terminalWordSeparator !== prev.terminalWordSeparator)
      applyWordSeparator(state.terminalWordSeparator);
    if (state.terminalScrollSensitivity !== prev.terminalScrollSensitivity)
      applyScrollSensitivity(state.terminalScrollSensitivity);
    if (state.terminalFastScrollModifier !== prev.terminalFastScrollModifier)
      applyFastScrollModifier(state.terminalFastScrollModifier);
    if (state.terminalScrollback !== prev.terminalScrollback) applyScrollback(state.terminalScrollback);
    if (state.terminalUseWebGL !== prev.terminalUseWebGL) applyWebglPreference(state.terminalUseWebGL);
  });
}

export function configureRendererPool(a: SlotAdapter): void {
  adapter = a;
  bindCopyListener();
  bindPreferencesListener();
}

export function forEachSlot(fn: (slot: Slot) => void): void {
  for (const s of slots) fn(s);
}

export function poolSize(): number {
  return slots.length;
}

export type PoolSlotStat = {
  id: number;
  sessionId: string | null;
  retainedSessionId: string | null;
  parked: boolean;
  cols: number;
  rows: number;
  bufferLines: number;
  webgl: boolean;
};

export function poolSlotStats(): PoolSlotStat[] {
  return slots.map((s) => ({
    id: s.id,
    sessionId: s.currentLeafId,
    retainedSessionId: s.retainedLeafId,
    parked: s.parked,
    cols: s.term.cols,
    rows: s.term.rows,
    bufferLines: s.term.buffer.active.length,
    webgl: !!s.webglAddon,
  }));
}

function getRecycler(): HTMLDivElement {
  if (recyclerEl?.isConnected) return recyclerEl;
  const el = document.createElement("div");
  el.setAttribute("data-labonair-recycler", "");
  el.style.cssText =
    "position:fixed;left:-99999px;top:-99999px;width:1024px;height:768px;overflow:hidden;pointer-events:none;contain:strict;";
  document.body.appendChild(el);
  recyclerEl = el;
  return el;
}

function fontWeightOption(weight: string) {
  return FONT_WEIGHT_MAP[weight] as FontWeight | undefined;
}

function termOptions() {
  const prefs = usePreferencesStore.getState();
  return {
    fontFamily: prefs.terminalFontFamily,
    fontSize: prefs.terminalFontSize,
    lineHeight: prefs.terminalLineHeight,
    letterSpacing: prefs.terminalLetterSpacing,
    theme: buildTerminalTheme(),
    cursorBlink: prefs.terminalCursorBlink,
    cursorStyle: prefs.terminalCursorStyle,
    cursorInactiveStyle: "outline" as const,
    scrollback: prefs.terminalScrollback,
    fontWeight: fontWeightOption(prefs.terminalFontWeight),
    allowProposedApi: true,
    rightClickSelectsWord: prefs.terminalRightClickPastes,
    wordSeparator: prefs.terminalWordSeparator,
    scrollSensitivity: prefs.terminalScrollSensitivity,
    // OSC 8 hyperlinks — open in the system browser, not the Tauri webview.
    linkHandler: {
      activate: (_e: MouseEvent, uri: string) => {
        openUrl(uri).catch(console.error);
      },
    },
    // fastScrollModifier is a runtime option in xterm v6 but not in public types
    ...({
      fastScrollModifier:
        prefs.terminalFastScrollModifier === "none" ? undefined : prefs.terminalFastScrollModifier,
    } as Record<string, unknown>),
  };
}

let _bellAudioCtx: AudioContext | null = null;
function getBellAudioContext(): AudioContext {
  if (!_bellAudioCtx || _bellAudioCtx.state === "closed") {
    _bellAudioCtx = new AudioContext();
  }
  return _bellAudioCtx;
}

/** Plays the terminal bell tone if the preference is enabled. Shared by both
 *  a bound slot's `onBell` (live xterm parsed a BEL) and a dormant session's
 *  raw-byte scan (see terminalSessionRegistry.ts's deliverBytes). */
export function playBell(): void {
  if (!usePreferencesStore.getState().terminalBell) return;
  try {
    const ctx = getBellAudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 800;
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.15);
  } catch {
    /* ignore AudioContext errors */
  }
}

function createSlot(): Slot {
  const term = new Terminal(termOptions());
  const fitAddon = new FitAddon();
  const searchAddon = new SearchAddon();
  const serializeAddon = new SerializeAddon();
  term.loadAddon(fitAddon);
  term.loadAddon(searchAddon);
  term.loadAddon(new WebLinksAddon((_e, uri) => openUrl(uri).catch(console.error)));
  term.loadAddon(new ImageAddon({ storageLimit: 32 }));

  const host = document.createElement("div");
  host.style.cssText = "width:100%;height:100%;";
  host.setAttribute("data-labonair-slot", String(slots.length));
  getRecycler().appendChild(host);
  term.open(host);
  // LigaturesAddon measures font metrics and must load after open().
  term.loadAddon(new LigaturesAddon());
  // SerializeAddon must also load after open().
  term.loadAddon(serializeAddon);

  const slot: Slot = {
    id: slots.length,
    term,
    fitAddon,
    searchAddon,
    serializeAddon,
    host,
    webglAddon: null,
    webglCanvases: [],
    currentLeafId: null,
    retainedLeafId: null,
    parked: false,
    oscDisposers: [],
    observer: null,
    fitTimer: null,
    ptyTimer: null,
    webglReapTimer: null,
    slotReapTimer: null,
    unhideRaf: null,
    lastCols: term.cols,
    lastRows: term.rows,
    lastW: 0,
    lastH: 0,
    lastUsedAt: 0,
    replaying: false,
    replayToken: 0,
    replayQueue: null,
  };

  term.onBell(playBell);

  // copyOnSelect: not a built-in xterm option — implemented via the
  // selection-change event. Slot-level (not per-session) since it's the same
  // behavior regardless of which session is currently bound.
  term.onSelectionChange(() => {
    if (!usePreferencesStore.getState().terminalCopyOnSelect) return;
    const text = term.getSelection();
    if (text) void navigator.clipboard.writeText(text).catch(() => undefined);
  });

  // Shift+Enter → ESC + CR so Claude Code and similar CLI tools can
  // distinguish it from plain Enter and insert a newline instead of
  // submitting. Shared across local and SSH sessions since it's a single
  // slot-level key handler now (was local-only before pooling).
  term.attachCustomKeyEventHandler((e: KeyboardEvent) => {
    if (e.key === "Enter" && e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
      if (e.type === "keydown") {
        const leafId = slot.currentLeafId;
        if (leafId !== null) adapter?.resolveLeaf(leafId)?.writeToPty("\x1b\r");
      }
      return false; // prevent xterm from also sending \r
    }
    return true;
  });

  term.onData((data) => {
    const leafId = slot.currentLeafId;
    if (leafId === null) return;
    adapter?.resolveLeaf(leafId)?.writeToPty(data);
  });

  slots.push(slot);
  return slot;
}

type PickResult = { slot: Slot; previousLeafId: string | null };

function isAltScreen(s: Slot): boolean {
  try {
    return s.term.buffer.active.type === "alternate";
  } catch {
    return false;
  }
}

function evictionScore(s: Slot): number {
  const leafId = s.currentLeafId;
  const visible = leafId !== null && (adapter?.isLeafVisible(leafId) ?? false);
  const busy = leafId !== null && (adapter?.isLeafBusy(leafId) ?? false);
  const focused = leafId !== null && (adapter?.isLeafFocused(leafId) ?? false);
  return (
    (visible ? 1000 : 0) +
    (isAltScreen(s) ? 100 : 0) +
    (busy ? 80 : 0) +
    (focused ? 10 : 0) +
    s.lastUsedAt / 1e12
  );
}

function pickSlotFor(sessionId: string): PickResult {
  const retainedOwn = slots.find((s) => s.currentLeafId === null && s.retainedLeafId === sessionId);
  if (retainedOwn) return { slot: retainedOwn, previousLeafId: null };

  const clean = slots.find((s) => s.currentLeafId === null && s.retainedLeafId === null);
  if (clean) return { slot: clean, previousLeafId: null };

  if (slots.length < poolCeiling()) return { slot: createSlot(), previousLeafId: null };

  // Retained-only buffers are cheaper to lose than bound ones: serialize, no evict.
  let retained: Slot | null = null;
  for (const s of slots) {
    if (s.currentLeafId !== null) continue;
    if (!retained || s.lastUsedAt < retained.lastUsedAt) retained = s;
  }
  if (retained) return { slot: retained, previousLeafId: null };

  for (const s of slots) {
    if (s.currentLeafId === sessionId) return { slot: s, previousLeafId: null };
  }
  const candidates: EvictionCandidate[] = slots.map((s) => ({
    sessionId: s.currentLeafId as string,
    visible: s.currentLeafId !== null && (adapter?.isLeafVisible(s.currentLeafId) ?? false),
    altScreen: isAltScreen(s),
    score: evictionScore(s),
  }));
  const chosenId = selectEvictionCandidate(candidates);
  const chosen = slots.find((s) => s.currentLeafId === chosenId) ?? slots[0];
  return { slot: chosen, previousLeafId: chosen.currentLeafId };
}

export type AcquireParams = {
  sessionId: string;
  container: HTMLDivElement;
  snapshot: string | null;
  // True if the slot was in alt-screen mode (TUI like vim, htop, …) at the
  // time it was released. When set, bindSlot skips ring replay and kicks
  // SIGWINCH so the TUI repaints from scratch.
  altScreen: boolean;
  drainRing: (write: (bytes: Uint8Array) => void) => void;
  shellExited: boolean;
  searchQuery: string | null;
  cols: number;
  rows: number;
  registerOsc: (term: Terminal) => (() => void)[];
  onSearchReady: (addon: SearchAddon) => void;
};

export function acquireSlot(params: AcquireParams): Slot {
  const existing = slots.find((s) => s.currentLeafId === params.sessionId);
  if (existing) {
    rewireSlot(existing, params);
    return existing;
  }

  const pick = pickSlotFor(params.sessionId);
  if (pick.previousLeafId !== null) {
    adapter?.evictLeaf(pick.previousLeafId);
  }
  if (pick.slot.currentLeafId !== null && pick.slot.currentLeafId !== params.sessionId) {
    detachSlotFromLeaf(pick.slot, false);
  }
  if (pick.slot.retainedLeafId !== null && pick.slot.retainedLeafId !== params.sessionId) {
    adapter?.storeSnapshot(pick.slot.retainedLeafId, serializeSlot(pick.slot));
    discardRetention(pick.slot);
  }
  bindSlot(pick.slot, params);
  return pick.slot;
}

function discardRetention(slot: Slot): void {
  slot.retainedLeafId = null;
  for (const d of slot.oscDisposers) {
    try {
      d();
    } catch {
      /* disposer already torn down */
    }
  }
  slot.oscDisposers = [];
}

function sliceSnapshotIntoChunks(snapshot: string, maxChars: number): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < snapshot.length) {
    let end = Math.min(start + maxChars, snapshot.length);
    // Nudge the boundary off a UTF-16 surrogate pair — xterm's parser already
    // tolerates arbitrary chunk boundaries otherwise (same mechanism live
    // streamed PTY output relies on), so no other splitting care is needed.
    if (end < snapshot.length) {
      const code = snapshot.charCodeAt(end - 1);
      if (code >= 0xd800 && code <= 0xdbff) end -= 1;
    }
    chunks.push(snapshot.slice(start, end));
    start = end;
  }
  return chunks;
}

function writeBudgeted(term: Terminal, queue: (string | Uint8Array)[]): boolean {
  let budget = REPLAY_BUDGET_BYTES;
  while (queue.length > 0 && budget > 0) {
    const seg = queue.shift();
    if (seg === undefined) break;
    try {
      term.write(seg);
    } catch (e) {
      console.warn("[labonair] replay write failed:", e);
    }
    budget -= typeof seg === "string" ? seg.length : seg.byteLength;
  }
  return queue.length === 0;
}

// Cold-rebind snapshot+ring replay, chunked across animation frames instead
// of one synchronous blocking write — a long-backgrounded busy tab's ring
// can hold up to 1MB, and writing that (plus a up-to-5000-line snapshot) in
// one tick is a direct main-thread stall. `onDone` runs everything that used
// to follow the replay in bindSlot, in the same relative order, just delayed
// by however many frames the replay takes; the slot's host stays hidden the
// whole time so nothing partially-filled ever flashes into view.
function beginChunkedReplay(slot: Slot, p: AcquireParams, onDone: () => void): void {
  const token = ++slot.replayToken;
  slot.replaying = true;
  slot.replayQueue = [];

  const segments: (string | Uint8Array)[] = [];
  if (p.snapshot) segments.push(...sliceSnapshotIntoChunks(p.snapshot, REPLAY_BUDGET_BYTES));
  if (p.altScreen) {
    // TUI output is incremental cursor-positioned updates that can't be
    // replayed on top of a stale snapshot; the SIGWINCH kick in
    // bindSlot's onDone makes the TUI redraw from scratch instead.
    p.drainRing(() => {});
  } else {
    p.drainRing((bytes) => segments.push(bytes));
  }

  const step = (): void => {
    if (slot.replayToken !== token) return;
    if (!writeBudgeted(slot.term, segments)) {
      requestAnimationFrame(step);
      return;
    }
    finishReplay();
  };

  const finishReplay = (): void => {
    if (slot.replayToken !== token) return;
    slot.replaying = false;
    const queued = slot.replayQueue ?? [];
    slot.replayQueue = null;
    const flushStep = (): void => {
      if (slot.replayToken !== token) return;
      if (!writeBudgeted(slot.term, queued)) {
        requestAnimationFrame(flushStep);
        return;
      }
      onDone();
    };
    flushStep();
  };

  step();
}

function finishBindSlot(
  slot: Slot,
  p: AcquireParams,
  fast: boolean,
  stale: boolean,
  hadWebgl: boolean,
): void {
  setupResizeObserver(slot, p);
  slot.fitAddon.fit();
  slot.lastCols = slot.term.cols;
  slot.lastRows = slot.term.rows;
  slot.lastW = p.container.clientWidth;
  slot.lastH = p.container.clientHeight;
  if (slot.lastCols !== p.cols || slot.lastRows !== p.rows) {
    adapter?.resolveLeaf(p.sessionId)?.resizePty(slot.lastCols, slot.lastRows);
  }

  if (!fast && p.searchQuery) {
    try {
      slot.searchAddon.findNext(p.searchQuery);
    } catch {
      /* stale query, ignore */
    }
  }

  if (!fast && p.altScreen && !p.shellExited) {
    adapter?.resolveLeaf(p.sessionId)?.kickPty(slot.term.cols, slot.term.rows);
  }

  if (fast) {
    if (stale) {
      if (!slot.webglAddon) attachWebgl(slot);
      try {
        slot.term.refresh(0, slot.term.rows - 1);
      } catch {
        /* refresh only fails if the renderer isn't attached yet */
      }
    }
    if (adapter?.isLeafFocused(p.sessionId)) {
      slot.term.focus();
      lastFocusedSlot = slot;
    }
  } else {
    scheduleUnhide(slot, stale || hadWebgl);
  }

  p.onSearchReady(slot.searchAddon);
}

function bindSlot(slot: Slot, p: AcquireParams): void {
  const fast = slot.retainedLeafId === p.sessionId;
  const stale = !slot.webglAddon || slot.parked || performance.now() - slot.lastUsedAt > SLOT_STALE_MS;
  const hadWebgl = !!slot.webglAddon;
  slot.retainedLeafId = null;
  slot.currentLeafId = p.sessionId;
  slot.lastUsedAt = performance.now();

  cancelPendingUnhide(slot);
  cancelWebglReap(slot);
  cancelSlotReap(slot);
  unparkSlotHost(slot);
  if (!fast) {
    slot.host.style.visibility = "hidden";
    if (hadWebgl) disposeSlotWebgl(slot);
  }

  if (slot.host.parentNode !== p.container) {
    p.container.appendChild(slot.host);
  }

  slot.term.options.disableStdin = p.shellExited;

  if (fast) {
    p.drainRing((bytes) => slot.term.write(bytes));
    finishBindSlot(slot, p, fast, stale, hadWebgl);
    return;
  }

  slot.term.clear();
  slot.term.reset();

  if (p.cols > 0 && p.rows > 0 && (slot.term.cols !== p.cols || slot.term.rows !== p.rows)) {
    slot.term.resize(p.cols, p.rows);
  }

  beginChunkedReplay(slot, p, () => {
    try {
      slot.term.write("\x1b[?25h");
    } catch {
      /* cursor-show escape, never throws in practice */
    }

    for (const d of slot.oscDisposers) {
      try {
        d();
      } catch {
        /* disposer already torn down */
      }
    }
    slot.oscDisposers = p.registerOsc(slot.term);

    finishBindSlot(slot, p, fast, stale, hadWebgl);
  });
}

function scheduleUnhide(slot: Slot, stale: boolean): void {
  slot.unhideRaf = requestAnimationFrame(() => {
    slot.unhideRaf = requestAnimationFrame(() => {
      slot.unhideRaf = null;
      slot.host.style.visibility = "";
      if (stale) {
        if (!slot.webglAddon) attachWebgl(slot);
        try {
          slot.term.refresh(0, slot.term.rows - 1);
        } catch {
          /* refresh only fails if the renderer isn't attached yet */
        }
      }
      const sessionId = slot.currentLeafId;
      if (sessionId !== null && adapter?.isLeafFocused(sessionId)) {
        slot.term.focus();
        lastFocusedSlot = slot;
      }
    });
  });
}

function cancelPendingUnhide(slot: Slot): void {
  if (slot.unhideRaf !== null) {
    cancelAnimationFrame(slot.unhideRaf);
    slot.unhideRaf = null;
  }
}

function rewireSlot(slot: Slot, p: AcquireParams): void {
  slot.lastUsedAt = performance.now();
  unparkSlotHost(slot);
  if (slot.host.parentNode !== p.container) {
    p.container.appendChild(slot.host);
  }
  setupResizeObserver(slot, p);
  slot.fitAddon.fit();
  slot.lastW = p.container.clientWidth;
  slot.lastH = p.container.clientHeight;
  if (slot.term.cols !== p.cols || slot.term.rows !== p.rows) {
    adapter?.resolveLeaf(p.sessionId)?.resizePty(slot.term.cols, slot.term.rows);
  }
  slot.lastCols = slot.term.cols;
  slot.lastRows = slot.term.rows;
  p.onSearchReady(slot.searchAddon);
}

function setupResizeObserver(slot: Slot, p: AcquireParams): void {
  slot.observer?.disconnect();
  if (slot.fitTimer) clearTimeout(slot.fitTimer);
  if (slot.ptyTimer) clearTimeout(slot.ptyTimer);
  slot.fitTimer = null;
  slot.ptyTimer = null;

  const container = p.container;
  const flushPty = () => {
    slot.ptyTimer = null;
    if (slot.currentLeafId !== p.sessionId) return;
    if (slot.term.cols === slot.lastCols && slot.term.rows === slot.lastRows) return;
    slot.lastCols = slot.term.cols;
    slot.lastRows = slot.term.rows;
    adapter?.resolveLeaf(p.sessionId)?.resizePty(slot.lastCols, slot.lastRows);
  };

  slot.observer = new ResizeObserver(() => {
    if (slot.parked) return;
    if (slot.fitTimer) clearTimeout(slot.fitTimer);
    slot.fitTimer = setTimeout(() => {
      slot.fitTimer = null;
      if (slot.currentLeafId !== p.sessionId || slot.parked) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w === slot.lastW && h === slot.lastH) return;
      slot.lastW = w;
      slot.lastH = h;
      slot.fitAddon.fit();
      if (slot.ptyTimer) clearTimeout(slot.ptyTimer);
      slot.ptyTimer = setTimeout(flushPty, PTY_RESIZE_DEBOUNCE_MS);
    }, FIT_DEBOUNCE_MS);
  });
  slot.observer.observe(container);
}

export type SerializeOutput = { snapshot: string | null; cols: number; rows: number; altScreen: boolean };
export type ReleaseOutput = { cols: number; rows: number };

export function releaseSlot(sessionId: string): ReleaseOutput | null {
  const slot = slots.find((s) => s.currentLeafId === sessionId);
  if (!slot) return null;
  detachSlotFromLeaf(slot, true);
  return { cols: slot.term.cols, rows: slot.term.rows };
}

function serializeSlot(slot: Slot): SerializeOutput {
  let snapshot: string | null = null;
  try {
    const cap = Math.min(SNAPSHOT_SCROLLBACK_CAP, usePreferencesStore.getState().terminalScrollback);
    snapshot = slot.serializeAddon.serialize({ scrollback: cap });
  } catch (e) {
    console.warn("[labonair] serialize failed:", e);
  }
  return { snapshot, cols: slot.term.cols, rows: slot.term.rows, altScreen: isAltScreen(slot) };
}

function detachSlotFromLeaf(slot: Slot, retain: boolean): void {
  if (retain && slot.currentLeafId !== null) {
    slot.retainedLeafId = slot.currentLeafId;
    parkSlotHost(slot);
  } else {
    discardRetention(slot);
    unparkSlotHost(slot);
    if (slot.host.parentNode !== getRecycler()) {
      getRecycler().appendChild(slot.host);
    }
  }

  slot.observer?.disconnect();
  slot.observer = null;
  if (slot.fitTimer) clearTimeout(slot.fitTimer);
  if (slot.ptyTimer) clearTimeout(slot.ptyTimer);
  slot.fitTimer = null;
  slot.ptyTimer = null;

  cancelPendingUnhide(slot);
  slot.host.style.visibility = "";

  slot.currentLeafId = null;
  slot.lastUsedAt = performance.now();
  scheduleWebglReap(slot);
  scheduleSlotReap(slot);
}

// display:none makes xterm pause internal rendering while the buffer keeps
// parsing writes (fast path); visibility:hidden would not (geometry remains).
function parkSlotHost(slot: Slot): void {
  if (slot.parked) return;
  slot.parked = true;
  slot.host.style.display = "none";
}

function unparkSlotHost(slot: Slot): void {
  if (!slot.parked) return;
  slot.parked = false;
  slot.host.style.display = "";
}

const WEBGL_RECOVERY_DELAY_MS = 250;
// Below this a re-shown slot is fresh enough to trust; above it, repaint on
// unhide to defeat silent GPU/context staleness.
const SLOT_STALE_MS = 10_000;
const WEBGL_REAP_GRACE_MS = 30_000;
const SLOT_REAP_GRACE_MS = 45_000;
const IDLE_SLOTS_KEEP_WARM = 1;

function scheduleWebglReap(slot: Slot): void {
  cancelWebglReap(slot);
  if (!slot.webglAddon) return;
  slot.webglReapTimer = setTimeout(() => {
    slot.webglReapTimer = null;
    if (slot.currentLeafId === null || slot.parked) disposeSlotWebgl(slot);
  }, WEBGL_REAP_GRACE_MS);
}

function cancelWebglReap(slot: Slot): void {
  if (slot.webglReapTimer !== null) {
    clearTimeout(slot.webglReapTimer);
    slot.webglReapTimer = null;
  }
}

function scheduleSlotReap(slot: Slot): void {
  cancelSlotReap(slot);
  slot.slotReapTimer = setTimeout(() => {
    slot.slotReapTimer = null;
    reapIdleSlot(slot);
  }, SLOT_REAP_GRACE_MS);
}

function cancelSlotReap(slot: Slot): void {
  if (slot.slotReapTimer !== null) {
    clearTimeout(slot.slotReapTimer);
    slot.slotReapTimer = null;
  }
}

function reapIdleSlot(slot: Slot): void {
  if (slot.currentLeafId !== null) return;
  const idle = slots.filter((s) => s.currentLeafId === null);
  if (idle.length <= IDLE_SLOTS_KEEP_WARM) return;
  idle.sort((a, b) => a.lastUsedAt - b.lastUsedAt);
  const surplus = idle.slice(0, idle.length - IDLE_SLOTS_KEEP_WARM);
  if (!surplus.includes(slot)) return;
  if (slot.retainedLeafId !== null) {
    adapter?.storeSnapshot(slot.retainedLeafId, serializeSlot(slot));
  }
  disposeSlot(slot);
}

function disposeSlot(slot: Slot): void {
  slot.replayToken++;
  slot.replaying = false;
  slot.replayQueue = null;
  cancelSlotReap(slot);
  cancelWebglReap(slot);
  cancelPendingUnhide(slot);
  if (slot.fitTimer) clearTimeout(slot.fitTimer);
  if (slot.ptyTimer) clearTimeout(slot.ptyTimer);
  slot.fitTimer = null;
  slot.ptyTimer = null;
  slot.observer?.disconnect();
  slot.observer = null;
  for (const d of slot.oscDisposers) {
    try {
      d();
    } catch {
      /* disposer already torn down */
    }
  }
  slot.oscDisposers = [];
  disposeSlotWebgl(slot);
  if (lastFocusedSlot === slot) lastFocusedSlot = null;
  try {
    slot.term.dispose();
  } catch (e) {
    console.warn("[labonair] slot dispose failed:", e);
  }
  slot.host.remove();
  const i = slots.indexOf(slot);
  if (i >= 0) slots.splice(i, 1);
}

function attachWebgl(slot: Slot): void {
  if (slot.webglAddon || !slot.term.element) return;
  if (!usePreferencesStore.getState().terminalUseWebGL) return;
  const elem = slot.term.element;
  const before = new Set<HTMLCanvasElement>(elem.querySelectorAll<HTMLCanvasElement>("canvas"));
  try {
    const webgl = new WebglAddon();
    webgl.onContextLoss(() => {
      const cur = slot.webglAddon;
      if (cur === webgl) {
        slot.webglAddon = null;
        slot.webglCanvases = [];
      }
      try {
        webgl.dispose();
      } catch {
        /* already lost */
      }
      setTimeout(() => {
        if (slot.webglAddon || slot.currentLeafId === null || slot.parked) return;
        if (!usePreferencesStore.getState().terminalUseWebGL) return;
        attachWebgl(slot);
        if (slot.webglAddon) {
          try {
            slot.term.refresh(0, slot.term.rows - 1);
          } catch {
            /* refresh only fails if the renderer isn't attached yet */
          }
        }
      }, WEBGL_RECOVERY_DELAY_MS);
    });
    slot.term.loadAddon(webgl);
    const after = elem.querySelectorAll<HTMLCanvasElement>("canvas");
    const added: HTMLCanvasElement[] = [];
    for (const c of after) if (!before.has(c)) added.push(c);
    slot.webglAddon = webgl;
    slot.webglCanvases = added;
  } catch (e) {
    console.warn("[labonair-webgl] unavailable:", e);
  }
}

function disposeSlotWebgl(slot: Slot): void {
  if (!slot.webglAddon) return;
  const addon = slot.webglAddon;
  for (const canvas of slot.webglCanvases) releaseCanvasContext(canvas);
  slot.webglCanvases = [];
  try {
    addon.dispose();
  } catch (e) {
    console.warn("[labonair-webgl] dispose failed:", e);
  }
  slot.webglAddon = null;
}

function releaseCanvasContext(canvas: HTMLCanvasElement): void {
  let gl: WebGL2RenderingContext | WebGLRenderingContext | null = null;
  try {
    gl = canvas.getContext("webgl2") as WebGL2RenderingContext | null;
  } catch {
    /* context already gone */
  }
  if (!gl) {
    try {
      gl = canvas.getContext("webgl") as WebGLRenderingContext | null;
    } catch {
      /* context already gone */
    }
  }
  if (gl) {
    try {
      const ext = gl.getExtension("WEBGL_lose_context");
      if (ext && !gl.isContextLost()) ext.loseContext();
    } catch {
      /* best effort */
    }
  }
  try {
    canvas.width = 0;
    canvas.height = 0;
  } catch {
    /* best effort */
  }
}

export function applyWebglPreference(enabled: boolean): void {
  for (const slot of slots) {
    if (enabled) {
      if (slot.currentLeafId !== null && !slot.parked && !slot.webglAddon) {
        attachWebgl(slot);
        if (slot.webglAddon) {
          try {
            slot.term.refresh(0, slot.term.rows - 1);
          } catch {
            /* refresh only fails if the renderer isn't attached yet */
          }
        }
      }
    } else if (slot.webglAddon) {
      cancelWebglReap(slot);
      disposeSlotWebgl(slot);
    }
  }
}

// Parked and retained slots can't be measured (display:none); poison lastW
// so the refit happens on unpark/rebind instead.
function refitSlot(slot: Slot): void {
  if (slot.parked || slot.currentLeafId === null) {
    slot.lastW = -1;
    return;
  }
  slot.fitAddon.fit();
  slot.lastCols = slot.term.cols;
  slot.lastRows = slot.term.rows;
  adapter?.resolveLeaf(slot.currentLeafId)?.resizePty(slot.term.cols, slot.term.rows);
}

export function applyFontSize(size: number): void {
  for (const slot of slots) {
    if (slot.term.options.fontSize === size) continue;
    slot.term.options.fontSize = size;
    refitSlot(slot);
  }
}

export function applyLetterSpacing(spacing: number): void {
  for (const slot of slots) {
    if (slot.term.options.letterSpacing === spacing) continue;
    slot.term.options.letterSpacing = spacing;
    refitSlot(slot);
  }
}

export function applyLineHeight(lineHeight: number): void {
  for (const slot of slots) {
    if (slot.term.options.lineHeight === lineHeight) continue;
    slot.term.options.lineHeight = lineHeight;
    refitSlot(slot);
  }
}

export function applyFontFamily(family: string): void {
  for (const slot of slots) {
    if (slot.term.options.fontFamily === family) continue;
    slot.term.options.fontFamily = family;
    refitSlot(slot);
  }
}

export function applyFontWeight(weight: string): void {
  const value = fontWeightOption(weight);
  for (const slot of slots) {
    if (slot.term.options.fontWeight === value) continue;
    slot.term.options.fontWeight = value;
  }
}

export function applyScrollback(value: number): void {
  for (const slot of slots) {
    if (slot.term.options.scrollback === value) continue;
    slot.term.options.scrollback = value;
  }
}

export function applyTheme(): void {
  const theme = buildTerminalTheme();
  for (const slot of slots) {
    slot.term.options.theme = theme;
  }
}

export function applyCursorBlink(enabled: boolean): void {
  for (const slot of slots) {
    if (slot.term.options.cursorBlink === enabled) continue;
    slot.term.options.cursorBlink = enabled;
  }
}

export function applyCursorStyle(style: "block" | "underline" | "bar"): void {
  for (const slot of slots) {
    if (slot.term.options.cursorStyle === style) continue;
    slot.term.options.cursorStyle = style;
  }
}

export function applyRightClickPastes(enabled: boolean): void {
  for (const slot of slots) {
    slot.term.options.rightClickSelectsWord = enabled;
  }
}

export function applyWordSeparator(sep: string): void {
  for (const slot of slots) {
    slot.term.options.wordSeparator = sep;
  }
}

export function applyScrollSensitivity(value: number): void {
  for (const slot of slots) {
    slot.term.options.scrollSensitivity = value;
  }
}

export function applyFastScrollModifier(modifier: "none" | "alt" | "ctrl" | "shift"): void {
  for (const slot of slots) {
    (slot.term.options as Record<string, unknown>).fastScrollModifier =
      modifier === "none" ? undefined : modifier;
  }
}

export function focusSlot(sessionId: string): void {
  const slot = slots.find((s) => s.currentLeafId === sessionId);
  if (!slot) return;
  slot.term.focus();
  lastFocusedSlot = slot;
}

export function getSlotForLeaf(sessionId: string): Slot | null {
  return slots.find((s) => s.currentLeafId === sessionId) ?? null;
}

export function isLeafAltScreen(sessionId: string): boolean {
  const slot = slots.find((s) => s.currentLeafId === sessionId);
  return slot ? isAltScreen(slot) : false;
}

export function parkLeafSlot(sessionId: string): void {
  const slot = slots.find((s) => s.currentLeafId === sessionId);
  if (!slot) return;
  parkSlotHost(slot);
  scheduleWebglReap(slot);
}

export function refreshLeafSlot(sessionId: string): void {
  const slot = slots.find((s) => s.currentLeafId === sessionId);
  if (!slot) return;
  cancelWebglReap(slot);
  unparkSlotHost(slot);
  if (usePreferencesStore.getState().terminalUseWebGL && !slot.webglAddon) {
    attachWebgl(slot);
  }
  // The observer skips parked slots; catch up on container resizes here.
  const container = slot.host.parentElement;
  if (container && (container.clientWidth !== slot.lastW || container.clientHeight !== slot.lastH)) {
    slot.lastW = container.clientWidth;
    slot.lastH = container.clientHeight;
    slot.fitAddon.fit();
    if (slot.term.cols !== slot.lastCols || slot.term.rows !== slot.lastRows) {
      slot.lastCols = slot.term.cols;
      slot.lastRows = slot.term.rows;
      adapter?.resolveLeaf(sessionId)?.resizePty(slot.lastCols, slot.lastRows);
    }
  }
  try {
    slot.term.refresh(0, slot.term.rows - 1);
  } catch {
    /* refresh only fails if the renderer isn't attached yet */
  }
}

export function disposeLeafSlot(sessionId: string): void {
  const slot = slots.find((s) => s.currentLeafId === sessionId || s.retainedLeafId === sessionId);
  if (slot) disposeSlot(slot);
}

export function discardRetainedSlot(sessionId: string): void {
  const slot = slots.find((s) => s.currentLeafId === null && s.retainedLeafId === sessionId);
  if (!slot) return;
  discardRetention(slot);
  slot.term.clear();
  slot.term.reset();
}

export function getLiveSlotForLeaf(sessionId: string): Slot | null {
  return slots.find((s) => s.currentLeafId === sessionId || s.retainedLeafId === sessionId) ?? null;
}

// Live PTY/SSH output delivery for a bound-or-retained slot. While a cold
// rebind's chunked replay (see beginChunkedReplay) is in flight, newly
// arriving output is queued instead of written directly, so historical
// snapshot/ring bytes are never overtaken by newer ones. Returns false if no
// slot owns this session (caller falls back to the dormant ring).
export function writeLiveBytes(sessionId: string, bytes: Uint8Array): boolean {
  const slot = getLiveSlotForLeaf(sessionId);
  if (!slot) return false;
  if (slot.replaying) {
    if (slot.replayQueue === null) slot.replayQueue = [];
    slot.replayQueue.push(bytes);
  } else {
    slot.term.write(bytes);
  }
  return true;
}

export function writeLiveText(sessionId: string, text: string): boolean {
  const slot = getLiveSlotForLeaf(sessionId);
  if (!slot) return false;
  if (slot.replaying) {
    if (slot.replayQueue === null) slot.replayQueue = [];
    slot.replayQueue.push(text);
  } else {
    slot.term.write(text);
  }
  return true;
}
