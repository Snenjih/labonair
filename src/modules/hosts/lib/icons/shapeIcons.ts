import type { SvgHostIcon } from "./types";

// Solid, hand-authored marker shapes (not hugeicons — those are stroke-only
// outline icons, unsuitable for a quick filled color-block tag). Mirrors
// the fill-based primitives already hand-rolled elsewhere in this module
// (e.g. the drag-handle dots in HostCard.tsx).
export const SHAPE_ICONS: SvgHostIcon[] = [
  {
    id: "shape-dot",
    label: "Dot",
    category: "shape",
    kind: "svg",
    viewBox: "0 0 24 24",
    elements: [{ tag: "circle", cx: 12, cy: 12, r: 5 }],
  },
  {
    id: "shape-circle",
    label: "Circle",
    category: "shape",
    kind: "svg",
    viewBox: "0 0 24 24",
    elements: [{ tag: "circle", cx: 12, cy: 12, r: 9 }],
  },
  {
    id: "shape-square",
    label: "Square",
    category: "shape",
    kind: "svg",
    viewBox: "0 0 24 24",
    elements: [{ tag: "rect", x: 4, y: 4, width: 16, height: 16, rx: 2 }],
  },
  {
    id: "shape-triangle",
    label: "Triangle",
    category: "shape",
    kind: "svg",
    viewBox: "0 0 24 24",
    elements: [{ tag: "polygon", points: "12,3 21,20 3,20" }],
  },
  {
    id: "shape-diamond",
    label: "Diamond",
    category: "shape",
    kind: "svg",
    viewBox: "0 0 24 24",
    elements: [{ tag: "polygon", points: "12,2 22,12 12,22 2,12" }],
  },
  {
    id: "shape-hexagon",
    label: "Hexagon",
    category: "shape",
    kind: "svg",
    viewBox: "0 0 24 24",
    elements: [{ tag: "polygon", points: "12,2 21,7.5 21,16.5 12,22 3,16.5 3,7.5" }],
  },
  {
    id: "shape-star",
    label: "Star",
    category: "shape",
    kind: "svg",
    viewBox: "0 0 24 24",
    elements: [
      {
        tag: "polygon",
        points:
          "12,2 14.7,9 22,9.3 16.3,13.9 18.2,21 12,16.9 5.8,21 7.7,13.9 2,9.3 9.3,9",
      },
    ],
  },
];
