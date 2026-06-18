import type { IDecoration, IMarker, Terminal } from "@xterm/xterm";
import {
  initialModeState,
  modeOf,
  reduceMode,
  type BlockMode,
  type ModeState,
} from "./modeMachine";
import { computeRange } from "./blockRange";
import { readRangeText } from "./readBlock";
import type { BlockMeta, PositionedBlock, VisibleBlocks } from "./types";

const MAX_BLOCKS = 1000;

function getCssVar(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

function parseExitCode(s: string): number | null {
  if (!s) return null;
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
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

type BlockDecorationsOptions = {
  onCwd?: (cwd: string) => void;
  onMode?: (mode: BlockMode) => void;
  onViewport?: () => void;
};

export class BlockDecorations {
  private readonly entries: Entry[] = [];
  private live: LiveBlock | null = null;
  private cwd = "";
  private idSeq = 0;
  private altScreen = false;
  private modeState: ModeState = initialModeState();
  private readonly modeListeners: Set<() => void> = new Set();
  private readonly listeners: Set<() => void> = new Set();
  private readonly disposers: (() => void)[] = [];
  private viewportRaf: number | null = null;
  private readonly options: BlockDecorationsOptions;

  constructor(
    private readonly term: Terminal,
    private readonly getCwd: () => string,
    options: BlockDecorationsOptions = {},
  ) {
    this.options = options;
  }

  init(): void {
    this.cwd = this.getCwd();

    const osc133 = this.term.parser.registerOscHandler(133, (data: string) => {
      this.onOsc133(data);
      return true;
    });

    const hEnter = this.term.parser.registerCsiHandler(
      { prefix: "?", final: "h" },
      (params) => {
        if (params[0] === 1049) this.handleAlt(true);
        return false;
      },
    );
    const hExit = this.term.parser.registerCsiHandler(
      { prefix: "?", final: "l" },
      (params) => {
        if (params[0] === 1049) this.handleAlt(false);
        return false;
      },
    );

    const onWriteParsed = this.term.onWriteParsed(() => {
      const isAlt = this.term.buffer.active.type === "alternate";
      if (isAlt !== this.altScreen) {
        this.altScreen = isAlt;
        this.notify();
      }
    });

    const onScroll = this.term.onScroll(() => this.scheduleNotify());
    const onRender = this.term.onRender(() => this.scheduleNotify());

    this.disposers.push(
      () => osc133.dispose(),
      () => hEnter.dispose(),
      () => hExit.dispose(),
      () => onWriteParsed.dispose(),
      () => onScroll.dispose(),
      () => onRender.dispose(),
    );
  }

  dispose(): void {
    if (this.viewportRaf != null) cancelAnimationFrame(this.viewportRaf);
    for (const e of this.entries) this.disposeEntry(e);
    this.entries.length = 0;
    this.live?.startMarker.dispose();
    this.live = null;
    for (const d of this.disposers) {
      try {
        d();
      } catch {}
    }
    this.disposers.length = 0;
    this.listeners.clear();
    this.modeListeners.clear();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  subscribeMode(listener: () => void): () => void {
    this.modeListeners.add(listener);
    return () => this.modeListeners.delete(listener);
  }

  get mode(): BlockMode {
    return modeOf(this.modeState);
  }

  hasAnyBlock(): boolean {
    return this.entries.length > 0 || this.live !== null;
  }

  commandLines(): number[] {
    return this.entries
      .map((e) => (e.startMarker.isDisposed ? -1 : e.startMarker.line))
      .filter((l) => l >= 0);
  }

  visibleBlocks(): VisibleBlocks {
    if (this.altScreen) return { blocks: [], sticky: null };
    const { term } = this;
    if (term.rows === 0) return { blocks: [], sticky: null };

    // Get cell height from xterm's rendered screen element (accurate on HiDPI)
    const screen = term.element?.querySelector(".xterm-screen") as HTMLElement | null;
    if (!screen) return { blocks: [], sticky: null };

    const rect = screen.getBoundingClientRect();
    const cellHeight = rect.height / term.rows;
    if (cellHeight <= 0) return { blocks: [], sticky: null };

    const buf = term.buffer.active;
    const viewportY = buf.viewportY;
    const vpTop = viewportY;
    const vpBottom = viewportY + term.rows;

    const out: PositionedBlock[] = [];
    let sticky: PositionedBlock | null = null;

    const addBlock = (
      meta: BlockMeta,
      isRunning: boolean,
      startLine: number,
      endLine: number,
    ) => {
      if (endLine < vpTop || startLine > vpBottom) return;
      const top = (startLine - viewportY) * cellHeight;
      const bottom = (endLine - viewportY + 1) * cellHeight;
      const headerTop = top - 1.9 * cellHeight;
      const isFailed = meta.exitCode !== null && meta.exitCode !== 0;
      const pb: PositionedBlock = {
        ...meta,
        top,
        bottom,
        headerTop,
        isRunning,
        isFailed,
      };
      out.push(pb);
      if (startLine < vpTop && endLine >= vpTop) sticky = pb;
    };

    for (const e of this.entries) {
      const r = computeRange(e.startMarker, e.endMarker);
      if (!r) continue;
      if (r.start > vpBottom) break;
      addBlock(
        {
          id: e.id,
          command: e.command,
          cwd: e.cwd,
          exitCode: e.exitCode,
          startLine: r.start,
          endLine: r.end,
          startedAt: e.startedAt,
          finishedAt: e.finishedAt,
        },
        false,
        r.start,
        r.end,
      );
    }

    const lb = this.live;
    if (lb && !lb.startMarker.isDisposed && lb.startMarker.line >= 0) {
      const start = lb.startMarker.line;
      const end = Math.max(start, buf.baseY + buf.cursorY);
      addBlock(
        {
          id: lb.id,
          command: lb.command,
          cwd: lb.cwd,
          exitCode: null,
          startLine: start,
          endLine: end,
          startedAt: lb.startedAt,
          finishedAt: null,
        },
        true,
        start,
        end,
      );
    }

    return { blocks: out, sticky };
  }

  readBlock(meta: BlockMeta): string {
    const e = this.entries.find((x) => x.id === meta.id);
    const r = e ? computeRange(e.startMarker, e.endMarker) : null;
    return readRangeText(
      this.term,
      r?.start ?? meta.startLine,
      r?.end ?? meta.endLine,
    );
  }

  getViewportY(): number {
    return this.term.buffer.active.viewportY;
  }

  getAdjacentBlock(
    direction: "prev" | "next",
    viewportY: number,
  ): BlockMeta | null {
    const blocks = this.allBlocks();
    if (blocks.length === 0) return null;

    if (direction === "prev") {
      let found: BlockMeta | null = null;
      for (const b of blocks) {
        if (b.startLine < viewportY) found = b;
        else break;
      }
      return found ?? blocks[0];
    } else {
      for (const b of blocks) {
        if (b.startLine > viewportY) return b;
      }
      return blocks[blocks.length - 1];
    }
  }

  scrollToBlock(startLine: number): void {
    this.term.scrollToLine(startLine);
  }

  allBlocks(): BlockMeta[] {
    const out: BlockMeta[] = [];
    for (const e of this.entries) {
      const r = computeRange(e.startMarker, e.endMarker);
      if (!r) continue;
      out.push({
        id: e.id,
        command: e.command,
        cwd: e.cwd,
        exitCode: e.exitCode,
        startLine: r.start,
        endLine: r.end,
        startedAt: e.startedAt,
        finishedAt: e.finishedAt,
      });
    }
    return out;
  }

  hydrateFromMeta(blocks: BlockMeta[]): void {
    const buf = this.term.buffer.active;
    // registerMarker(offset) places at: (buf.baseY + buf.cursorY) + offset
    // so to hit absolute line L we need offset = L - (baseY + cursorY)
    const absoluteCursorLine = buf.baseY + buf.cursorY;
    const existingIds = new Set(this.entries.map((e) => e.id));

    for (const b of blocks) {
      if (existingIds.has(b.id)) continue;

      const startOffset = b.startLine - absoluteCursorLine;
      const endOffset = Math.max(startOffset, b.endLine - absoluteCursorLine);

      const startMarker = this.term.registerMarker(startOffset);
      const endMarker = this.term.registerMarker(endOffset);
      if (!startMarker || !endMarker) continue;

      this.entries.push({
        id: b.id,
        command: b.command,
        cwd: b.cwd,
        exitCode: b.exitCode,
        startedAt: b.startedAt,
        finishedAt: b.finishedAt ?? Date.now(),
        startMarker,
        endMarker,
        deco: null,
      });
    }
    this.notify();
  }

  private onOsc133(data: string): void {
    const code = data[0] as "A" | "B" | "C" | "D";
    const rest = data.length > 2 && data[1] === ";" ? data.slice(2) : "";

    const prevMode = modeOf(this.modeState);
    this.modeState = reduceMode(this.modeState, { type: "osc133", code });
    const nextMode = modeOf(this.modeState);
    if (nextMode !== prevMode) {
      this.options.onMode?.(nextMode);
      for (const l of this.modeListeners) l();
    }

    switch (code) {
      case "C":
        this.startBlock(rest);
        break;
      case "D":
        this.finishBlock(rest);
        break;
      // A, B: only update mode state (done above), no block lifecycle change
    }

    this.cwd = this.getCwd();
    this.options.onCwd?.(this.cwd);
    this.notify();
  }

  private handleAlt(active: boolean): void {
    const prevMode = modeOf(this.modeState);
    this.modeState = reduceMode(this.modeState, { type: "alt", active });
    const nextMode = modeOf(this.modeState);
    if (nextMode !== prevMode) {
      this.options.onMode?.(nextMode);
      for (const l of this.modeListeners) l();
      this.notify();
    }
  }

  private startBlock(command: string): void {
    if (this.live) this.finishBlock("");
    const marker = this.term.registerMarker(0);
    if (!marker) return;
    this.live = {
      id: `b${++this.idSeq}`,
      command,
      cwd: this.cwd,
      startedAt: Date.now(),
      startMarker: marker,
    };
  }

  private finishBlock(codeStr: string): void {
    const lb = this.live;
    if (!lb) return;
    this.live = null;
    const exit = parseExitCode(codeStr);
    const endMarker = this.term.registerMarker(0);
    if (!endMarker) {
      lb.startMarker.dispose();
      return;
    }
    const ok = exit === 0 || exit === null;
    const okColor = getCssVar("--color-primary", "#5fb3b3");
    const errColor = getCssVar("--color-destructive", "#e5706b");
    const deco =
      this.term.registerDecoration({
        marker: endMarker,
        width: 1,
        overviewRulerOptions: {
          color: ok ? okColor : errColor,
        },
      }) ?? null;
    this.entries.push({
      id: lb.id,
      command: lb.command,
      cwd: lb.cwd,
      exitCode: exit,
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
  }

  private disposeEntry(e: Entry): void {
    try {
      e.deco?.dispose();
    } catch {}
    try {
      e.startMarker.dispose();
    } catch {}
    try {
      e.endMarker.dispose();
    } catch {}
  }

  private scheduleNotify(): void {
    if (this.viewportRaf != null) return;
    this.viewportRaf = requestAnimationFrame(() => {
      this.viewportRaf = null;
      this.notify();
    });
  }

  private notify(): void {
    for (const l of this.listeners) l();
  }
}
