import type { BarId, BarSide } from "./barItems";

export interface PopoverPlacement {
  side: "top" | "bottom";
  align: "start" | "end";
}

/**
 * Maps a bar item's (bar, side) placement to the Radix Popover/DropdownMenu
 * `side`/`align` props its dropdown should open with, so moving an item to a
 * different bar/side also flips which direction its popover opens toward —
 * Radix's own collision detection only guards against actual viewport
 * overflow, it doesn't proactively pick a direction based on which corner
 * the trigger currently occupies.
 */
export function getPopoverPlacement(bar: BarId, side: BarSide): PopoverPlacement {
  return {
    side: bar === "titlebar" ? "bottom" : "top",
    align: side === "left" ? "start" : "end",
  };
}
