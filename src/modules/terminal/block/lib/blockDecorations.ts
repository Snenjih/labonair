import type { IDecoration, IMarker, Terminal } from "@xterm/xterm";
import type { BlockMeta, PositionedBlock, VisibleBlocks } from "./types";

const MAX_BLOCKS = 1000;

function getCssVar(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

type MarkerLike = { line: number; isDisposed: boolean };
type LineRange = { start: number; end: number };

function computeRange(start: MarkerLike, end: MarkerLike): LineRange | null {
  if (start.isDisposed || end.isDisposed) return null;
  if (start.line < 0 || end.line < 0) return null;
  return { start: start.line, end: Math.max(start.line, end.line) };
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

export class BlockDecorations {
  private readonly entries: Entry[] = [];
  private live: LiveBlock | null = null;
  private cwd = "";
  private idSeq = 0;
  private altScreen = false;
  private readonly listeners: Set<() => void> = new Set();
  private readonly disposers: (() => void)[] = [];
  private viewportRaf: number | null = null;

  constructor(
    private readonly term: Terminal,
    private readonly getCwd: () => string,
  ) {}

  init(): void {
    this.cwd = this.getCwd();

    const osc133 = this.term.parser.registerOscHandler(133, (data: string) => {
      this.onOsc133(data);
      return false;
    });

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
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  visibleBlocks(container: HTMLElement): VisibleBlocks {
    if (this.altScreen) return { blocks: [], sticky: null };
    const { term } = this;
    if (term.rows === 0) return { blocks: [], sticky: null };

    const cellHeight = container.clientHeight / term.rows;
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

  readBlock(block: BlockMeta): string {
    const e = this.entries.find((x) => x.id === block.id);
    const r = e
      ? computeRange(e.startMarker, e.endMarker)
      : null;
    const startLine = r ? r.start : block.startLine;
    const endLine = r ? r.end : block.endLine;

    const buf = this.term.buffer.active;
    const last = Math.min(endLine, buf.length - 1);
    const lines: string[] = [];
    for (let i = startLine; i <= last; i++) {
      lines.push(buf.getLine(i)?.translateToString(true) ?? "");
    }
    while (lines.length > 0 && lines[lines.length - 1].trim() === "") {
      lines.pop();
    }
    return lines.join("\n");
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
    const baseY = buf.baseY;
    const existingIds = new Set(this.entries.map((e) => e.id));

    for (const b of blocks) {
      if (existingIds.has(b.id)) continue;

      const startOffset = Math.max(0, b.startLine - baseY);
      const endOffset = Math.max(startOffset, b.endLine - baseY);

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
    const code = data[0];
    const rest = data.length > 2 && data[1] === ";" ? data.slice(2) : "";
    switch (code) {
      case "C":
        this.startBlock(rest);
        break;
      case "D":
        this.finishBlock(rest);
        break;
    }
    // Always refresh cwd from the live getter
    this.cwd = this.getCwd();
    this.notify();
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
