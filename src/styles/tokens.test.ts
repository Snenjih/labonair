import { describe, expect, it } from "vitest";
import { oklchToRgb } from "./tokens";

describe("oklchToRgb", () => {
  it("converts pure white (L=1, C=0) to rgb(255, 255, 255)", () => {
    expect(oklchToRgb("oklch(1 0 0)")).toBe("rgb(255, 255, 255)");
  });

  it("converts pure white expressed as a percentage lightness", () => {
    expect(oklchToRgb("oklch(100% 0 0)")).toBe("rgb(255, 255, 255)");
  });

  it("converts pure black (L=0, C=0) to rgb(0, 0, 0)", () => {
    expect(oklchToRgb("oklch(0 0 0)")).toBe("rgb(0, 0, 0)");
  });

  it("produces an rgba() string with the alpha channel when a slash-alpha is present", () => {
    expect(oklchToRgb("oklch(1 0 0 / 0.5)")).toBe("rgba(255, 255, 255, 0.5)");
  });

  it("accepts a percentage alpha", () => {
    expect(oklchToRgb("oklch(1 0 0 / 50%)")).toBe("rgba(255, 255, 255, 0.5)");
  });

  it("clamps out-of-gamut channels instead of producing invalid rgb components", () => {
    const result = oklchToRgb("oklch(0.7 0.4 30)");
    const match = result.match(/^rgb\((\d+), (\d+), (\d+)\)$/);
    expect(match).not.toBeNull();
    const [, r, g, b] = match as unknown as [string, string, string, string];
    for (const channel of [r, g, b]) {
      const n = Number.parseInt(channel, 10);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThanOrEqual(255);
    }
  });

  it("returns non-oklch input unchanged", () => {
    expect(oklchToRgb("rgb(1, 2, 3)")).toBe("rgb(1, 2, 3)");
    expect(oklchToRgb("#ff0000")).toBe("#ff0000");
  });
});
