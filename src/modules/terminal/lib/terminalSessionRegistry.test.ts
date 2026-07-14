import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// terminalSessionRegistry.ts imports rendererPool.ts directly, which pulls in
// DOM-heavy xterm addons (e.g. @xterm/addon-ligatures) that don't resolve
// cleanly under Vitest's module resolution (see rendererPool.test.ts's own
// comment on why it only tests the pure rendererPoolSizing.ts instead). Stub
// the whole module so SessionRecord/leafBusy logic can be exercised in
// isolation from the real pool.
vi.mock("./rendererPool", () => ({
  acquireSlot: vi.fn(),
  configureRendererPool: vi.fn(),
  discardRetainedSlot: vi.fn(),
  disposeLeafSlot: vi.fn(),
  getLiveSlotForLeaf: vi.fn(() => null),
  getSlotForLeaf: vi.fn(() => null),
  isLeafAltScreen: vi.fn(() => false),
  parkLeafSlot: vi.fn(),
  playBell: vi.fn(),
  focusSlot: vi.fn(),
  refreshLeafSlot: vi.fn(),
  releaseSlot: vi.fn(() => null),
  writeLiveBytes: vi.fn(() => false),
  writeLiveText: vi.fn(() => false),
}));

const {
  registerSession,
  disposeSession,
  setContainer,
  setVisible,
  deliverText,
  terminalDebugStats,
} = await import("./terminalSessionRegistry");

const SSH_IDLE_OUTPUT_MS = 5000;

function stubBridge() {
  return {
    writeToPty: vi.fn(),
    resizePty: vi.fn(),
    kickPty: vi.fn(),
  };
}

function hasSlot(sessionId: string): boolean {
  return terminalDebugStats().find((s) => s.sessionId === sessionId)?.hasSlot ?? false;
}

describe("terminalSessionRegistry — SSH busy fallback (output recency)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keeps a hidden isRemote session bound while output keeps arriving, then releases after a quiet period", async () => {
    const id = "ssh-chatty";
    const container = document.createElement("div");
    registerSession({ sessionId: id, bridge: stubBridge(), callbacks: {}, isRemote: true });
    setContainer(id, container);
    setVisible(id, true);
    expect(hasSlot(id)).toBe(true);

    // Output arrives just before backgrounding — leafBusy() should be true
    // at the moment setVisible(false) runs, so the immediate releaseIfIdle
    // check is skipped and the slot stays bound going into hidden state.
    deliverText(id, "chunk1\n");
    setVisible(id, false);
    await vi.advanceTimersByTimeAsync(0);
    expect(hasSlot(id)).toBe(true);

    // More output arrives while hidden, well under the quiet threshold —
    // each chunk re-arms the quiet timer, so the session must stay bound.
    await vi.advanceTimersByTimeAsync(2000);
    deliverText(id, "chunk2\n");
    await vi.advanceTimersByTimeAsync(4000);
    expect(hasSlot(id)).toBe(true);

    // No further output — once SSH_IDLE_OUTPUT_MS has elapsed since the
    // last chunk, the re-armed quiet timer fires and releases the slot.
    await vi.advanceTimersByTimeAsync(SSH_IDLE_OUTPUT_MS + 100);
    expect(hasSlot(id)).toBe(false);

    disposeSession(id);
  });

  it("releases a hidden isRemote session promptly if it never produced any output", async () => {
    const id = "ssh-silent";
    const container = document.createElement("div");
    registerSession({ sessionId: id, bridge: stubBridge(), callbacks: {}, isRemote: true });
    setContainer(id, container);
    setVisible(id, true);
    expect(hasSlot(id)).toBe(true);

    setVisible(id, false);
    await vi.advanceTimersByTimeAsync(0);

    expect(hasSlot(id)).toBe(false);

    disposeSession(id);
  });

  it("does not apply the output-recency signal to local (isRemote: false) sessions", async () => {
    const id = "local-chatty";
    const container = document.createElement("div");
    registerSession({ sessionId: id, bridge: stubBridge(), callbacks: {}, isRemote: false });
    setContainer(id, container);
    setVisible(id, true);
    expect(hasSlot(id)).toBe(true);

    // Output right before hiding — for an isRemote session this would keep
    // the slot bound (see the first test); a local session must release
    // exactly as before, since checkForegroundJob (unset here) is the only
    // signal that should gate it.
    deliverText(id, "chunk1\n");
    setVisible(id, false);
    await vi.advanceTimersByTimeAsync(0);

    expect(hasSlot(id)).toBe(false);

    disposeSession(id);
  });
});
