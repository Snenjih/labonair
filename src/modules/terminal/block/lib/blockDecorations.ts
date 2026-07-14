import type { IDecoration, IMarker, Terminal } from "@xterm/xterm";
import { oklchToRgb } from "@/styles/tokens";
import { blockIndexAt, computeRange, type LineRange } from "./blockRange";
import { readRangeText } from "./readBlock";

const MAX_BLOCKS = 500;

/** Reads a theme CSS variable at call time (not cached — cheap, and this is
 *  only called once per finished block, not a per-render/per-chunk path)
 *  rather than hardcoding a hex value, so the overview-ruler mark stays in
 *  sync with the active theme instead of drifting from it. Converts oklch()
 *  (the raw format globals.css declares tokens in) to rgb() — xterm's
 *  overview-ruler renderer sets this value as a canvas `fillStyle`, which
 *  some WebKit versions preserve verbatim as oklch() rather than downgrading
 *  to rgb(), and canvas 2D fillStyle parsing doesn't accept oklch() input. */
function themeColor(varName: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  if (!v) return fallback;
  return v.startsWith("oklch(") ? oklchToRgb(v) : v;
}

type Entry = {
  id: string;
  command: string;
  cwd: string;
  exitCode: number | null;
  startedAt: number;
  finishedAt: number;
  startMarker: IMarker;
  endMarker: IMarker;
  deco: IDecoration | null;
};

type LiveBlock = {
  id: string;
  command: string;
  cwd: string;
  startedAt: number;
  startMarker: IMarker;
};

export type BlockMeta = {
  id: string;
  command: string;
  cwd: string;
  exitCode: number | null;
  startLine: number;
  endLine: number;
  startedAt: number;
  finishedAt: number;
};

export type PositionedBlock = {
  id: string;
  command: string;
  cwd: string;
  exitCode: number | null;
  running: boolean;
  ok: boolean;
  startedAt: number;
  finishedAt: number;
  top: number;
  bottom: number;
  /** Pixel top of the header row (one line above the command, in the blank
   *  gap the shell script reserves — see zshrc.zsh/bashrc.bash). */
  headerTop: number;
};

export type VisibleBlocks = { blocks: PositionedBlock[]; sticky: PositionedBlock | null };
export type BlockMatch = { line: number; col: number; len: number };
export type BlockContext = { command: string; cwd: string; exitCode: number | null; output: string };

export type BlockDecorationsOptions = {
  /** Fired (rAF-coalesced) whenever a geometry recompute might be needed —
   *  new/finished block, scroll, resize/reflow. The caller (BlockOverlay)
   *  re-reads `visibleBlocks()` and only re-renders if the result actually
   *  changed (see its `signature()` throttle). */
  onViewport?: () => void;
};

/**
 * Owns block bookkeeping for a single xterm `Terminal` instance. Unlike a
 * typical one-Terminal-per-tab app, Nexum's renderer pool reuses `Terminal`
 * objects across unrelated sessions (see rendererPool.ts) — so this class is
 * deliberately NOT self-registering its own OSC 133/7 handlers (a second
 * `registerOscHandler` would race with the prompt tracker/cwd handler
 * terminalSessionRegistry.ts already installs — see registerPromptTracker's
 * doc comment). Instead, the registry feeds it decoded events via
 * `handleCommandState`/`setCwd`, and constructs a fresh instance every time
 * `registerOsc` re-runs (i.e. on a cold rebind) rather than trying to keep
 * one alive across a `Terminal` swap — markers don't survive that anyway.
 */
export class BlockDecorations {
  private readonly entries: Entry[] = [];
  private live: LiveBlock | null = null;
  private cwd = "";
  private idSeq = 0;
  private selectedId: string | null = null;
  private searchDeco: IDecoration | null = null;
  private searchMarker: IMarker | null = null;
  private readonly onViewport?: () => void;
  private viewportRaf: number | null = null;
  private readonly disposers: (() => void)[] = [];

  constructor(
    private readonly term: Terminal,
    opts?: BlockDecorationsOptions,
  ) {
    this.onViewport = opts?.onViewport;
    const parsed = term.onWriteParsed(() => this.scheduleViewport());
    const scroll = term.onScroll(() => this.scheduleViewport());
    const render = term.onRender(() => this.scheduleViewport());
    this.disposers.push(
      () => parsed.dispose(),
      () => scroll.dispose(),
      () => render.dispose(),
    );
  }

  private scheduleViewport(): void {
    if (this.viewportRaf != null) return;
    this.viewportRaf = requestAnimationFrame(() => {
      this.viewportRaf = null;
      this.onViewport?.();
    });
  }

  setCwd(cwd: string): void {
    this.cwd = cwd;
  }

  /** Fed by terminalSessionRegistry's registerPromptTracker callback — see
   *  the class doc comment for why this isn't a raw OSC handler. `running`
   *  mirrors OSC 133 C (start) / D via `exitCode !== undefined` (finish); a
   *  bare `running=false` with no `exitCode` is OSC 133 A (new prompt) and
   *  is a no-op here. `commandText` is only ever present on a genuine C
   *  event (plain, non-block sessions get a bare C with no text — see
   *  zshrc.zsh/bashrc.bash — so this class is never constructed for them in
   *  the first place, but the guard costs nothing). */
  handleCommandState(running: boolean, exitCode?: number, commandText?: string): void {
    if (running) {
      this.startBlock(commandText ?? "");
      return;
    }
    if (exitCode === undefined) return;
    this.finishBlock(exitCode);
  }

  hasAnyBlock(): boolean {
    return this.entries.length > 0 || this.live !== null;
  }

  getBlocks(): BlockMeta[] {
    const out: BlockMeta[] = [];
    for (const e of this.entries) {
      const r = this.rangeOf(e);
      if (r) out.push(this.toMeta(e, r));
    }
    return out;
  }

  blockAt(line: number): BlockMeta | null {
    const ranges = this.entries.map((e) => this.rangeOf(e));
    const i = blockIndexAt(ranges, line);
    if (i < 0) return null;
    const r = ranges[i];
    return r ? this.toMeta(this.entries[i], r) : null;
  }

  readById(id: string): BlockContext | null {
    const e = this.entries.find((x) => x.id === id);
    if (!e) return null;
    const r = this.rangeOf(e);
    if (!r) return null;
    return {
      command: e.command,
      cwd: e.cwd,
      exitCode: e.exitCode,
      output: readRangeText(this.term, r.start, r.end),
    };
  }

  searchBlock(id: string, query: string): BlockMatch[] {
    const e = this.entries.find((x) => x.id === id);
    if (!e || !query) return [];
    const r = this.rangeOf(e);
    if (!r) return [];
    const q = query.toLowerCase();
    const buf = this.term.buffer.active;
    const last = Math.min(r.end, buf.length - 1);
    const out: BlockMatch[] = [];
    for (let i = r.start; i <= last && out.length < 500; i++) {
      const lower = buf.getLine(i)?.translateToString(true).toLowerCase() ?? "";
      let from = 0;
      while (out.length < 500) {
        const idx = lower.indexOf(q, from);
        if (idx < 0) break;
        out.push({ line: i, col: idx, len: query.length });
        from = idx + Math.max(1, query.length);
      }
    }
    return out;
  }

  revealMatch(m: BlockMatch): void {
    this.clearSearch();
    try {
      const buf = this.term.buffer.active;
      this.term.scrollToLine(Math.max(0, m.line - Math.floor(this.term.rows / 2)));
      const marker = this.term.registerMarker(m.line - (buf.baseY + buf.cursorY));
      if (!marker) return;
      this.searchMarker = marker;
      this.searchDeco = this.term.registerDecoration({ marker, x: m.col, width: m.len }) ?? null;
      this.searchDeco?.onRender((el) => el.classList.add("bt-match"));
    } catch {
      // Buffer state can shift under us (resize mid-search); a failed reveal
      // just leaves nothing highlighted, not a crash.
    }
  }

  clearSearch(): void {
    this.searchDeco?.dispose();
    this.searchMarker?.dispose();
    this.searchDeco = null;
    this.searchMarker = null;
  }

  selectBlockAt(clientY: number, screenRect: DOMRect): void {
    if (this.term.rows === 0) return;
    const cellHeight = screenRect.height / this.term.rows;
    if (cellHeight <= 0) return;
    const row = Math.floor((clientY - screenRect.top) / cellHeight);
    const bufferRow = this.term.buffer.active.viewportY + row;
    const block = this.blockAt(bufferRow);
    if (!block) {
      this.clearBlockSelection();
      return;
    }
    if (block.id === this.selectedId && this.term.hasSelection()) {
      this.clearBlockSelection();
      return;
    }
    this.selectBlock(block.id);
  }

  selectBlock(id: string): void {
    const e = this.entries.find((x) => x.id === id);
    const r = e ? this.rangeOf(e) : null;
    if (!r) return;
    this.term.selectLines(r.start, r.end);
    this.selectedId = id;
  }

  clearBlockSelection(): boolean {
    const had = this.term.hasSelection();
    this.term.clearSelection();
    this.selectedId = null;
    return had;
  }

  navigateBlocks(dir: -1 | 1): void {
    if (this.entries.length === 0) return;
    let idx: number;
    const cur = this.selectedId ? this.entries.findIndex((e) => e.id === this.selectedId) : -1;
    if (cur >= 0 && this.term.hasSelection()) {
      idx = cur + dir;
    } else {
      idx = dir < 0 ? this.entries.length - 1 : -1;
    }
    while (idx >= 0 && idx < this.entries.length) {
      const e = this.entries[idx];
      const r = this.rangeOf(e);
      if (r) {
        this.term.selectLines(r.start, r.end);
        this.selectedId = e.id;
        this.term.scrollToLine(Math.max(0, r.start - 2));
        return;
      }
      idx += dir;
    }
  }

  /** `offset` is the caller's own mount-container top minus the `.xterm-
   *  screen` element's top (both viewport-space `getBoundingClientRect()`
   *  values) — computed externally rather than against `term.element` like
   *  the reference implementation this is ported from, since that assumes a
   *  DOM nesting this app doesn't guarantee. Bails to empty on a zero-size
   *  rect, which covers the common case of a backgrounded/parked pane
   *  (`display:none`) — see BlockOverlay for the narrower, self-correcting
   *  `visibility:hidden` transition window this doesn't catch. */
  visibleBlocks(offset: number): VisibleBlocks {
    const term = this.term;
    const screen = term.element?.querySelector<HTMLElement>(".xterm-screen");
    if (!screen || term.rows === 0) return { blocks: [], sticky: null };
    const rect = screen.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return { blocks: [], sticky: null };
    const cellHeight = rect.height / term.rows;
    if (cellHeight <= 0) return { blocks: [], sticky: null };
    const buf = term.buffer.active;
    const viewportY = buf.viewportY;
    const vpTop = viewportY;
    const vpBottom = viewportY + term.rows;

    const out: PositionedBlock[] = [];
    let sticky: PositionedBlock | null = null;

    const consider = (
      meta: Omit<PositionedBlock, "top" | "bottom" | "ok" | "headerTop">,
      startLine: number,
      endLine: number,
    ) => {
      if (endLine < vpTop || startLine > vpBottom) return;
      const ok = meta.exitCode === 0 || meta.exitCode === null;
      const top = offset + (startLine - viewportY) * cellHeight;
      const bottom = offset + (endLine - viewportY + 1) * cellHeight;
      const pb: PositionedBlock = {
        ...meta,
        ok,
        top,
        bottom,
        // The C marker lands on the first output line, so the command echo
        // is one row above `top` and the blank header gap is two rows above.
        headerTop: top - 1.9 * cellHeight,
      };
      out.push(pb);
      if (startLine < vpTop && endLine >= vpTop) sticky = pb;
    };

    for (let i = this.firstIndexEndingAtOrAfter(vpTop); i < this.entries.length; i++) {
      const e = this.entries[i];
      const r = this.rangeOf(e);
      if (!r) continue;
      if (r.start > vpBottom) break;
      consider(
        {
          id: e.id,
          command: e.command,
          cwd: e.cwd,
          exitCode: e.exitCode,
          running: false,
          startedAt: e.startedAt,
          finishedAt: e.finishedAt,
        },
        r.start,
        r.end,
      );
    }

    const lb = this.live;
    if (lb && !lb.startMarker.isDisposed && lb.startMarker.line >= 0) {
      const start = lb.startMarker.line;
      const end = Math.max(start, buf.baseY + buf.cursorY);
      consider(
        {
          id: lb.id,
          command: lb.command,
          cwd: lb.cwd,
          exitCode: null,
          running: true,
          startedAt: lb.startedAt,
          finishedAt: 0,
        },
        start,
        end,
      );
    }

    return { blocks: out, sticky };
  }

  dispose(): void {
    if (this.viewportRaf != null) cancelAnimationFrame(this.viewportRaf);
    this.clearSearch();
    for (const e of this.entries) this.disposeEntry(e);
    this.entries.length = 0;
    this.live?.startMarker.dispose();
    this.live = null;
    for (const d of this.disposers) {
      try {
        d();
      } catch {
        // Disposing an already-disposed xterm listener is a no-op error we
        // don't care about (e.g. the Terminal itself was torn down first).
      }
    }
    this.disposers.length = 0;
  }

  private startBlock(command: string): void {
    if (this.live) this.finishBlock(null);
    const marker = this.term.registerMarker(0);
    if (!marker) return;
    this.live = {
      id: `b${++this.idSeq}`,
      command,
      cwd: this.cwd,
      startedAt: Date.now(),
      startMarker: marker,
    };
    this.scheduleViewport();
  }

  private finishBlock(exitCode: number | null): void {
    const lb = this.live;
    if (!lb) return;
    this.live = null;
    const endMarker = this.term.registerMarker(0);
    if (!endMarker) {
      lb.startMarker.dispose();
      return;
    }
    const ok = exitCode === 0 || exitCode === null;
    const deco =
      this.term.registerDecoration({
        marker: endMarker,
        width: 1,
        overviewRulerOptions: {
          color: ok ? themeColor("--success", "#5fb3b3") : themeColor("--error", "#e5706b"),
        },
      }) ?? null;
    this.entries.push({
      id: lb.id,
      command: lb.command,
      cwd: lb.cwd,
      exitCode,
      startedAt: lb.startedAt,
      finishedAt: Date.now(),
      startMarker: lb.startMarker,
      endMarker,
      deco,
    });
    while (this.entries.length > MAX_BLOCKS) {
      const old = this.entries.shift();
      if (old) this.disposeEntry(old);
    }
    this.scheduleViewport();
  }

  private disposeEntry(e: Entry): void {
    e.deco?.dispose();
    e.startMarker.dispose();
    e.endMarker.dispose();
  }

  private rangeOf(e: Entry): LineRange | null {
    return computeRange(e.startMarker, e.endMarker);
  }

  private firstIndexEndingAtOrAfter(line: number): number {
    let lo = 0;
    let hi = this.entries.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      const r = this.rangeOf(this.entries[mid]);
      if ((r?.end ?? -1) < line) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  private toMeta(e: Entry, r: LineRange): BlockMeta {
    return {
      id: e.id,
      command: e.command,
      cwd: e.cwd,
      exitCode: e.exitCode,
      startLine: r.start,
      endLine: r.end,
      startedAt: e.startedAt,
      finishedAt: e.finishedAt,
    };
  }
}
