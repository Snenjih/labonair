import { describe, expect, it } from "vitest";
import { scopeKeyFor } from "./scopeKey";

describe("scopeKeyFor", () => {
  it("returns 'local' for the local scope", () => {
    expect(scopeKeyFor({ type: "local" })).toBe("local");
  });

  it("returns a host-namespaced key for a remote scope", () => {
    expect(scopeKeyFor({ type: "remote", hostId: "abc-123" })).toBe("ssh:abc-123");
  });

  it("produces distinct keys for different hosts", () => {
    const a = scopeKeyFor({ type: "remote", hostId: "host-a" });
    const b = scopeKeyFor({ type: "remote", hostId: "host-b" });
    expect(a).not.toBe(b);
  });

  it("never collides with the local scope key", () => {
    const remote = scopeKeyFor({ type: "remote", hostId: "local" });
    expect(remote).not.toBe(scopeKeyFor({ type: "local" }));
  });
});
