// Serializes PTY/SSH resize invokes for a single session so `bindSlot()`'s
// unawaited `resizePty()`+`kickPty()` pair, the debounced ResizeObserver
// (`flushPty`), and `refitSlot()` can never interleave or complete out of
// order against each other — the underlying Tauri command gives mutual
// exclusion (a per-session mutex) but no FIFO ordering across concurrent
// invokes, so without this a TUI can receive the wrong final COLS/ROWS
// mid-redraw. Dependency-free (no xterm/DOM imports) so it stays unit
// testable without pulling in the DOM-heavy addon stack.

export type ResizeInvoker = (cols: number, rows: number) => Promise<unknown>;

type Job = { kind: "resize" | "kick"; cols: number; rows: number };

export class PtyResizeQueue {
  private readonly invoke: ResizeInvoker;
  private queue: Job[] = [];
  private running = false;
  private disposed = false;

  constructor(invoke: ResizeInvoker) {
    this.invoke = invoke;
  }

  resize(cols: number, rows: number): void {
    if (this.disposed) return;
    const last = this.queue[this.queue.length - 1];
    if (last && last.kind === "resize") {
      last.cols = cols;
      last.rows = rows;
    } else {
      this.queue.push({ kind: "resize", cols, rows });
    }
    this.drain();
  }

  // Never coalesced with a neighboring resize/kick — the rows+1→rows pair
  // must always run as an atomic, uninterruptible unit.
  kick(cols: number, rows: number): void {
    if (this.disposed) return;
    this.queue.push({ kind: "kick", cols, rows });
    this.drain();
  }

  dispose(): void {
    this.disposed = true;
    this.queue = [];
  }

  private drain(): void {
    if (this.running || this.disposed) return;
    this.running = true;
    void this.run();
  }

  private async run(): Promise<void> {
    while (this.queue.length > 0 && !this.disposed) {
      const job = this.queue.shift();
      if (!job) break;
      try {
        if (job.kind === "resize") {
          await this.invoke(job.cols, job.rows);
        } else {
          // Linux only emits SIGWINCH when the winsize ioctl actually
          // changes dims, so bump +1 row then restore to force a TUI
          // repaint. A dispose() landing between the two steps intentionally
          // skips the restore rather than resizing an already-torn-down
          // session.
          await this.invoke(job.cols, job.rows + 1);
          if (this.disposed) break;
          await this.invoke(job.cols, job.rows);
        }
      } catch (e) {
        console.warn("[labonair] pty resize failed:", e);
      }
    }
    this.running = false;
  }
}
