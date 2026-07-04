import { describe, expect, it, vi } from "vitest";
import { createSshOutputChannel } from "./ssh-pty-bridge";

describe("createSshOutputChannel", () => {
  it("calls onData with the payload of a data message", () => {
    const onData = vi.fn();
    const channel = createSshOutputChannel(onData);

    channel.onmessage?.({ type: "data", data: "hello world" });

    expect(onData).toHaveBeenCalledWith("hello world");
  });

  it("forwards each message independently, preserving order", () => {
    const onData = vi.fn();
    const channel = createSshOutputChannel(onData);

    channel.onmessage?.({ type: "data", data: "chunk-1" });
    channel.onmessage?.({ type: "data", data: "chunk-2" });

    expect(onData).toHaveBeenNthCalledWith(1, "chunk-1");
    expect(onData).toHaveBeenNthCalledWith(2, "chunk-2");
  });

  it("ignores messages with an unknown type without throwing", () => {
    const onData = vi.fn();
    const channel = createSshOutputChannel(onData);

    expect(() => {
      // @ts-expect-error — deliberately malformed event to verify graceful handling
      channel.onmessage?.({ type: "exit", code: 1 });
    }).not.toThrow();
    expect(onData).not.toHaveBeenCalled();
  });
});
