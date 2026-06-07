import type { Terminal } from "@xterm/xterm";
import type { BlockMode } from "./types";

export class ModeMachine {
  private _mode: BlockMode = "prompt";
  private altScreen = false;
  private readonly listeners: Set<(mode: BlockMode) => void> = new Set();
  private readonly disposers: (() => void)[] = [];

  constructor(term: Terminal) {
    const hEnter = term.parser.registerCsiHandler(
      { prefix: "?", final: "h" },
      (params) => {
        if (params[0] === 1049) this.setAlt(true);
        return false;
      },
    );
    const hExit = term.parser.registerCsiHandler(
      { prefix: "?", final: "l" },
      (params) => {
        if (params[0] === 1049) this.setAlt(false);
        return false;
      },
    );
    const osc133 = term.parser.registerOscHandler(133, (data: string) => {
      const code = data[0];
      let phase: "prompt" | "running" | null = null;
      if (code === "A" || code === "B" || code === "D") phase = "prompt";
      else if (code === "C") phase = "running";
      if (phase !== null) {
        const next = this.altScreen ? "alt" : phase;
        if (next !== this._mode) {
          this._mode = next;
          this.emit();
        }
      }
      return false;
    });

    this.disposers.push(
      () => hEnter.dispose(),
      () => hExit.dispose(),
      () => osc133.dispose(),
    );
  }

  get mode(): BlockMode {
    return this._mode;
  }

  subscribe(listener: (mode: BlockMode) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  dispose(): void {
    for (const d of this.disposers) {
      try {
        d();
      } catch {}
    }
    this.disposers.length = 0;
    this.listeners.clear();
  }

  private setAlt(active: boolean): void {
    if (this.altScreen === active) return;
    this.altScreen = active;
    const next: BlockMode = active
      ? "alt"
      : this._mode === "alt"
        ? "prompt"
        : this._mode;
    if (next !== this._mode) {
      this._mode = next;
      this.emit();
    }
  }

  private emit(): void {
    for (const l of this.listeners) l(this._mode);
  }
}
