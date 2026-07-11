import type { Terminal } from "@xterm/xterm";
import { describe, expect, it, vi } from "vitest";
import {
  createShellIntegrationState,
  registerCwdHandler,
  registerPromptTracker,
  registerTerminalQueryHandlers,
  registerTerminalQuerySwallowHandlers,
  safeCursorPos,
} from "./osc-handlers";

function makeFakeQueryTerminal(cursorX: number, cursorY: number) {
  let csiNHandler: ((params: number[]) => boolean) | null = null;
  let csiCHandler: ((params: number[]) => boolean) | null = null;
  const term = {
    parser: {
      registerCsiHandler: (opts: { final: string }, handler: (params: number[]) => boolean) => {
        if (opts.final === "n") csiNHandler = handler;
        if (opts.final === "c") csiCHandler = handler;
        return { dispose: () => {} };
      },
      registerOscHandler: () => ({ dispose: () => {} }),
    },
    buffer: { active: { cursorX, cursorY } },
    options: { theme: {} },
  } as unknown as Terminal;
  return {
    term,
    fireCpr: () => csiNHandler?.([6]),
    fireDa1: () => csiCHandler?.([0]),
  };
}

function makeFakeTerminal() {
  let oscHandler: ((data: string) => boolean) | null = null;
  const term = {
    parser: {
      registerOscHandler: (_id: number, handler: (data: string) => boolean) => {
        oscHandler = handler;
        return { dispose: () => {} };
      },
    },
    registerMarker: () => ({ dispose: () => {}, isDisposed: false }),
  } as unknown as Terminal;
  return { term, fire: (data: string) => oscHandler?.(data) };
}

describe("registerPromptTracker", () => {
  it("tracks the prompt marker on OSC 133 A without a state/callback (legacy call)", () => {
    const { term, fire } = makeFakeTerminal();
    const tracker = registerPromptTracker(term);
    expect(tracker.getMarker()).toBeNull();
    fire("A");
    expect(tracker.getMarker()).not.toBeNull();
  });

  it("fires onCommandState(true) on OSC 133 C and sets inCommand", () => {
    const { term, fire } = makeFakeTerminal();
    const state = createShellIntegrationState();
    const onCommandState = vi.fn();
    registerPromptTracker(term, state, onCommandState);

    fire("C");

    expect(state.inCommand).toBe(true);
    expect(onCommandState).toHaveBeenCalledWith(true);
  });

  it("fires onCommandState(false) on OSC 133 D and clears inCommand", () => {
    const { term, fire } = makeFakeTerminal();
    const state = createShellIntegrationState();
    const onCommandState = vi.fn();
    registerPromptTracker(term, state, onCommandState);

    fire("C");
    fire("D");

    expect(state.inCommand).toBe(false);
    expect(onCommandState).toHaveBeenLastCalledWith(false);
  });

  it("fires onCommandState(false) and clears inCommand on OSC 133 A (new prompt)", () => {
    const { term, fire } = makeFakeTerminal();
    const state = createShellIntegrationState();
    state.inCommand = true;
    const onCommandState = vi.fn();
    registerPromptTracker(term, state, onCommandState);

    fire("A");

    expect(state.inCommand).toBe(false);
    expect(onCommandState).toHaveBeenCalledWith(false);
  });

  it("fires onCommandState(true, undefined, text) on OSC 133 C;<command>", () => {
    const { term, fire } = makeFakeTerminal();
    const state = createShellIntegrationState();
    const onCommandState = vi.fn();
    registerPromptTracker(term, state, onCommandState);

    fire("C;ls -la /tmp");

    expect(onCommandState).toHaveBeenCalledWith(true, undefined, "ls -la /tmp");
  });

  it("ignores OSC 133 B — no callback, no state change", () => {
    const { term, fire } = makeFakeTerminal();
    const state = createShellIntegrationState();
    const onCommandState = vi.fn();
    registerPromptTracker(term, state, onCommandState);

    fire("B");

    expect(onCommandState).not.toHaveBeenCalled();
    expect(state.inCommand).toBe(false);
  });
});

describe("registerCwdHandler", () => {
  it("reports cwd from a well-formed OSC 7 payload", () => {
    const { term, fire } = makeFakeTerminal();
    const onCwd = vi.fn();
    registerCwdHandler(term, onCwd);

    fire("file:///home/user/project");

    expect(onCwd).toHaveBeenCalledWith("/home/user/project");
  });

  it("ignores OSC 7 while a command is running (untrusted output)", () => {
    const { term, fire } = makeFakeTerminal();
    const onCwd = vi.fn();
    const state = createShellIntegrationState();
    state.inCommand = true;
    registerCwdHandler(term, onCwd, state);

    fire("file:///tmp/evil");

    expect(onCwd).not.toHaveBeenCalled();
  });

  it("reports cwd once a command finishes and inCommand clears", () => {
    const { term, fire } = makeFakeTerminal();
    const onCwd = vi.fn();
    const state = createShellIntegrationState();
    state.inCommand = false;
    registerCwdHandler(term, onCwd, state);

    fire("file:///home/user/after-command");

    expect(onCwd).toHaveBeenCalledWith("/home/user/after-command");
  });
});

describe("registerTerminalQueryHandlers — CPR", () => {
  it("replies with a 1-indexed cursor position report", () => {
    const { term, fireCpr } = makeFakeQueryTerminal(4, 9);
    const writeToProcess = vi.fn();
    registerTerminalQueryHandlers(term, writeToProcess);

    fireCpr();

    expect(writeToProcess).toHaveBeenCalledWith("\x1b[10;5R");
  });

  it("does not reply (and never writes NaN) when the cursor position is non-finite", () => {
    const { term, fireCpr } = makeFakeQueryTerminal(Number.NaN, 9);
    const writeToProcess = vi.fn();
    registerTerminalQueryHandlers(term, writeToProcess);

    fireCpr();

    expect(writeToProcess).not.toHaveBeenCalled();
  });
});

describe("safeCursorPos", () => {
  it("returns the cursor position when finite", () => {
    const { term } = makeFakeQueryTerminal(4, 9);
    expect(safeCursorPos(term)).toEqual({ x: 4, y: 9 });
  });

  it("returns null when cursorX/cursorY is non-finite", () => {
    const { term } = makeFakeQueryTerminal(Number.NaN, 9);
    expect(safeCursorPos(term)).toBeNull();
  });
});

describe("registerTerminalQuerySwallowHandlers", () => {
  it("swallows CPR (CSI n) without writing anything back", () => {
    const { term, fireCpr } = makeFakeQueryTerminal(4, 9);
    registerTerminalQuerySwallowHandlers(term);

    const result = fireCpr();

    expect(result).toBe(true);
  });

  it("swallows DA1 (CSI c) without writing anything back", () => {
    const { term, fireDa1 } = makeFakeQueryTerminal(0, 0);
    registerTerminalQuerySwallowHandlers(term);

    const result = fireDa1();

    expect(result).toBe(true);
  });

  it("wins over a handler registered before it (xterm-builtin-shadowing simulation)", () => {
    // Simulates xterm.js's own built-in CPR handler having been registered
    // first (at Terminal construction time) — the parser's real dispatch is
    // last-registered-first, so registering the swallow handler afterward
    // (as terminalSessionRegistry.ts does for SSH sessions) must be the one
    // that actually answers the query, not the earlier one.
    let handlers: Array<(params: number[]) => boolean> = [];
    const builtinReply = vi.fn(() => {
      throw new Error("xterm's built-in handler must not run for SSH sessions");
    });
    const term = {
      parser: {
        registerCsiHandler: (_opts: { final: string }, handler: (params: number[]) => boolean) => {
          handlers = [handler, ...handlers]; // last-registered-first, like the real parser
          return { dispose: () => {} };
        },
      },
    } as unknown as Terminal;
    // Register the "built-in" handler first...
    (term.parser.registerCsiHandler as (o: { final: string }, h: (p: number[]) => boolean) => unknown)(
      { final: "n" },
      builtinReply,
    );
    // ...then the swallow handler, matching bindLeafToSlot's registration order.
    registerTerminalQuerySwallowHandlers(term);

    for (const h of handlers) {
      if (h([6])) break;
    }

    expect(builtinReply).not.toHaveBeenCalled();
  });
});
