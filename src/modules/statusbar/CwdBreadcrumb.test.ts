import { describe, expect, it } from "vitest";
import { resolveProvider } from "./CwdBreadcrumb";

describe("resolveProvider", () => {
  it("picks the local provider when there is no remote target", () => {
    expect(resolveProvider(null).id).toBe("local");
    expect(resolveProvider(undefined).id).toBe("local");
  });

  it("picks the remote provider for the resolved host/session", () => {
    const provider = resolveProvider({ hostId: "host-1", sessionId: "explorer:host-1" });
    expect(provider.id).toBe("ssh:host-1");
  });

  it("always returns the same local provider instance (no per-call reconnect)", () => {
    expect(resolveProvider(null)).toBe(resolveProvider(undefined));
  });
});
