import type { SvgHostIcon } from "./types";

// Digits 0-9, generated rather than hand-authored — a closed, mechanically
// derivable set.
export const NUMBER_ICONS: SvgHostIcon[] = Array.from({ length: 10 }, (_, n) => ({
  id: `number-${n}`,
  label: String(n),
  category: "number",
  kind: "svg",
  viewBox: "0 0 24 24",
  elements: [
    {
      tag: "text",
      x: 12,
      y: 17,
      fontSize: 15,
      fontWeight: 600,
      content: String(n),
    },
  ],
}));
