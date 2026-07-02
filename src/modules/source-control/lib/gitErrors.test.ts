import { describe, expect, it } from "vitest";
import { isSessionLostError } from "./gitErrors";

describe("isSessionLostError", () => {
  it("detects a dead lazy SSH session", () => {
    expect(isSessionLostError("no SSH session for this host — reconnect and try again")).toBe(true);
  });

  it("detects a dead SFTP session", () => {
    expect(isSessionLostError("no SFTP session for tab abc-123")).toBe(true);
  });

  it("detects transport-level failures", () => {
    expect(isSessionLostError("Broken pipe (os error 32)")).toBe(true);
    expect(isSessionLostError("Connection reset by peer")).toBe(true);
    expect(isSessionLostError("Connection refused")).toBe(true);
    expect(isSessionLostError("No route to host")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isSessionLostError("NO SSH SESSION for this host")).toBe(true);
  });

  it("does not flag a genuine git error", () => {
    expect(isSessionLostError("fatal: not a git repository")).toBe(false);
    expect(isSessionLostError("git is not installed or not in PATH")).toBe(false);
    expect(isSessionLostError("Permission denied")).toBe(false);
  });
});
