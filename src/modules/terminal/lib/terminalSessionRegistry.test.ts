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
  setCommandRunning,
  isCommandRunning,
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

describe("terminalSessionRegistry — local commandRunning watchdog", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("resets a stuck commandRunning flag for a local session once the OS confirms no foreground job", async () => {
    const id = "local-stuck";
    const container = document.createElement("div");
    const checkForegroundJob = vi.fn(async () => false);
    registerSession({ sessionId: id, bridge: stubBridge(), callbacks: {}, checkForegroundJob });
    setContainer(id, container);
    setVisible(id, true);

    setCommandRunning(id, true);
    expect(isCommandRunning(id)).toBe(true);

    await vi.advanceTimersByTimeAsync(3000);

    expect(checkForegroundJob).toHaveBeenCalled();
    expect(isCommandRunning(id)).toBe(false);

    disposeSession(id);
  });

  it("keeps commandRunning true across repeated checks while the OS confirms a foreground job is still running", async () => {
    const id = "local-busy";
    const container = document.createElement("div");
    const checkForegroundJob = vi.fn(async () => true);
    registerSession({ sessionId: id, bridge: stubBridge(), callbacks: {}, checkForegroundJob });
    setContainer(id, container);
    setVisible(id, true);

    setCommandRunning(id, true);
    await vi.advanceTimersByTimeAsync(3000 * 3);

    expect(checkForegroundJob.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(isCommandRunning(id)).toBe(true);

    disposeSession(id);
  });

  it("never auto-resets an SSH session's commandRunning flag, even stuck true for a long time", async () => {
    const id = "ssh-stuck";
    const container = document.createElement("div");
    registerSession({ sessionId: id, bridge: stubBridge(), callbacks: {}, isRemote: true });
    setContainer(id, container);
    setVisible(id, true);

    setCommandRunning(id, true);
    await vi.advanceTimersByTimeAsync(60_000);

    expect(isCommandRunning(id)).toBe(true);

    disposeSession(id);
  });

  it("does not arm the watchdog for a local session with no checkForegroundJob supplied", async () => {
    const id = "local-no-check";
    const container = document.createElement("div");
    registerSession({ sessionId: id, bridge: stubBridge(), callbacks: {} });
    setContainer(id, container);
    setVisible(id, true);

    setCommandRunning(id, true);
    await vi.advanceTimersByTimeAsync(60_000);

    expect(isCommandRunning(id)).toBe(true);

    disposeSession(id);
  });

  it("clears a pending watchdog timer on dispose instead of firing against a deleted session", async () => {
    const id = "local-dispose";
    const container = document.createElement("div");
    const checkForegroundJob = vi.fn(async () => false);
    registerSession({ sessionId: id, bridge: stubBridge(), callbacks: {}, checkForegroundJob });
    setContainer(id, container);
    setVisible(id, true);

    setCommandRunning(id, true);
    disposeSession(id);

    await vi.advanceTimersByTimeAsync(10_000);

    expect(checkForegroundJob).not.toHaveBeenCalled();
  });
});
