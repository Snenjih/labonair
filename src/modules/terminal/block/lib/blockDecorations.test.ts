import type { Terminal } from "@xterm/xterm";
import { describe, expect, it } from "vitest";
import { BlockDecorations } from "./blockDecorations";

/** Minimal fake xterm `Terminal` — enough for the OSC-133-driven entry
 *  bookkeeping this suite exercises. `element: null` makes `visibleBlocks()`
 *  short-circuit to an empty result (pixel-geometry math needs a real DOM
 *  layout and is exercised manually/in the browser instead, matching this
 *  project's existing test-coverage style for xterm-dependent rendering). */
function makeFakeTerminal() {
  let nextLine = 0;
  let selected = false;
  const term = {
    element: null,
    rows: 24,
    buffer: {
      active: {
        viewportY: 0,
        baseY: 0,
        cursorY: 0,
        length: 1000,
        getLine: () => undefined,
      },
    },
    registerMarker: () => {
      const line = nextLine++;
      return { line, isDisposed: false, dispose() { this.isDisposed = true; } };
    },
    registerDecoration: () => ({
      dispose: () => {},
      onRender: () => ({ dispose: () => {} }),
    }),
    onWriteParsed: () => ({ dispose: () => {} }),
    onScroll: () => ({ dispose: () => {} }),
    onRender: () => ({ dispose: () => {} }),
    hasSelection: () => selected,
    clearSelection: () => {
      selected = false;
    },
    selectLines: () => {
      selected = true;
    },
    scrollToLine: () => {},
  } as unknown as Terminal;
  return term;
}

describe("BlockDecorations", () => {
  it("C..D produces one finished block with correct command/exitCode/range", () => {
    const engine = new BlockDecorations(makeFakeTerminal());
    engine.setCwd("/tmp");
    engine.handleCommandState(true, undefined, "echo hi");
    engine.handleCommandState(false, 0);

    const blocks = engine.getBlocks();
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ command: "echo hi", cwd: "/tmp", exitCode: 0 });
    expect(blocks[0].startLine).toBeLessThanOrEqual(blocks[0].endLine);
  });

  it("records a non-zero exit code", () => {
    const engine = new BlockDecorations(makeFakeTerminal());
    engine.handleCommandState(true, undefined, "false");
    engine.handleCommandState(false, 1);

    expect(engine.getBlocks()[0].exitCode).toBe(1);
  });

  it("a still-running command produces zero finished blocks", () => {
    const engine = new BlockDecorations(makeFakeTerminal());
    engine.handleCommandState(true, undefined, "sleep 100");

    expect(engine.getBlocks()).toHaveLength(0);
    expect(engine.hasAnyBlock()).toBe(true);
  });

  it("a bare OSC 133 A (running=false, no exitCode) is a no-op", () => {
    const engine = new BlockDecorations(makeFakeTerminal());
    engine.handleCommandState(false, undefined);

    expect(engine.getBlocks()).toHaveLength(0);
    expect(engine.hasAnyBlock()).toBe(false);
  });

  it("a second C before D force-closes the first block with a null exit code", () => {
    const engine = new BlockDecorations(makeFakeTerminal());
    engine.handleCommandState(true, undefined, "cmd1");
    engine.handleCommandState(true, undefined, "cmd2");
    engine.handleCommandState(false, 0);

    const blocks = engine.getBlocks();
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({ command: "cmd1", exitCode: null });
    expect(blocks[1]).toMatchObject({ command: "cmd2", exitCode: 0 });
  });

  it("a stray D with no live block is a safe no-op", () => {
    const engine = new BlockDecorations(makeFakeTerminal());
    expect(() => engine.handleCommandState(false, 0)).not.toThrow();
    expect(engine.getBlocks()).toHaveLength(0);
  });

  it("hasAnyBlock reflects both live and finished state", () => {
    const engine = new BlockDecorations(makeFakeTerminal());
    expect(engine.hasAnyBlock()).toBe(false);
    engine.handleCommandState(true, undefined, "cmd");
    expect(engine.hasAnyBlock()).toBe(true);
    engine.handleCommandState(false, 0);
    expect(engine.hasAnyBlock()).toBe(true);
  });

  it("caps at MAX_BLOCKS (500), dropping the oldest", () => {
    const engine = new BlockDecorations(makeFakeTerminal());
    for (let i = 0; i < 505; i++) {
      engine.handleCommandState(true, undefined, `cmd${i}`);
      engine.handleCommandState(false, 0);
    }
    const blocks = engine.getBlocks();
    expect(blocks).toHaveLength(500);
    expect(blocks[0].command).toBe("cmd5");
    expect(blocks[499].command).toBe("cmd504");
  });

  it("selectBlock/clearBlockSelection round-trip", () => {
    const engine = new BlockDecorations(makeFakeTerminal());
    engine.handleCommandState(true, undefined, "cmd");
    engine.handleCommandState(false, 0);
    const id = engine.getBlocks()[0].id;

    engine.selectBlock(id);
    expect(engine.clearBlockSelection()).toBe(true);
    expect(engine.clearBlockSelection()).toBe(false);
  });

  it("navigateBlocks starts at the most recent block and steps backward without wrapping", () => {
    const engine = new BlockDecorations(makeFakeTerminal());
    for (const cmd of ["a", "b", "c"]) {
      engine.handleCommandState(true, undefined, cmd);
      engine.handleCommandState(false, 0);
    }
    const ids = engine.getBlocks().map((b) => b.id);

    engine.navigateBlocks(-1);
    expect(engine.blockAt(engine.getBlocks()[2].startLine)?.id).toBe(ids[2]);
  });

  it("navigateBlocks is a safe no-op with zero blocks", () => {
    const engine = new BlockDecorations(makeFakeTerminal());
    expect(() => engine.navigateBlocks(-1)).not.toThrow();
    expect(() => engine.navigateBlocks(1)).not.toThrow();
  });

  it("dispose is idempotent-safe and clears live/finished state", () => {
    const engine = new BlockDecorations(makeFakeTerminal());
    engine.handleCommandState(true, undefined, "cmd");
    engine.handleCommandState(false, 0);
    expect(() => engine.dispose()).not.toThrow();
    expect(engine.hasAnyBlock()).toBe(false);
  });
});
