import { describe, expect, it } from "vitest";
import { initialGraphPageSize } from "./useGitGraph";

describe("initialGraphPageSize", () => {
  it("uses the larger local page size when there is no session", () => {
    expect(initialGraphPageSize(undefined)).toBe(500);
  });

  it("uses a smaller page size for a remote session", () => {
    expect(initialGraphPageSize("explorer:host-1")).toBe(200);
  });
});
