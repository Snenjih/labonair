import { describe, expect, it } from "vitest";
import { getPopoverPlacement } from "./getPopoverPlacement";

describe("getPopoverPlacement", () => {
  it("titlebar-left opens downward, start-aligned", () => {
    expect(getPopoverPlacement("titlebar", "left")).toEqual({ side: "bottom", align: "start" });
  });

  it("titlebar-right opens downward, end-aligned", () => {
    expect(getPopoverPlacement("titlebar", "right")).toEqual({ side: "bottom", align: "end" });
  });

  it("statusbar-left opens upward, start-aligned", () => {
    expect(getPopoverPlacement("statusbar", "left")).toEqual({ side: "top", align: "start" });
  });

  it("statusbar-right opens upward, end-aligned", () => {
    expect(getPopoverPlacement("statusbar", "right")).toEqual({ side: "top", align: "end" });
  });
});
