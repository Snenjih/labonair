import type { IconSvgElement } from "@hugeicons/react";

export type HostIconCategory = "os" | "shape" | "symbol" | "number";

export type SvgElementSpec =
  | { tag: "path"; d: string; fillRule?: "evenodd" | "nonzero" }
  | { tag: "circle"; cx: number; cy: number; r: number }
  | { tag: "rect"; x: number; y: number; width: number; height: number; rx?: number }
  | { tag: "polygon"; points: string }
  | { tag: "text"; x: number; y: number; fontSize: number; fontWeight?: number; content: string };

interface HostIconBase {
  /** Persisted verbatim in Host.icon — never rename or reuse an id once shipped. */
  id: string;
  label: string;
  category: HostIconCategory;
  keywords?: string[];
}

export interface SvgHostIcon extends HostIconBase {
  kind: "svg";
  viewBox: string;
  elements: SvgElementSpec[];
}

export interface HugeiconHostIcon extends HostIconBase {
  kind: "hugeicon";
  icon: IconSvgElement;
}

export type HostIconDef = SvgHostIcon | HugeiconHostIcon;
