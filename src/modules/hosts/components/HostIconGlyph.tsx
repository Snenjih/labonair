import { HugeiconsIcon } from "@hugeicons/react";
import type { HostIconDef, SvgElementSpec } from "../lib/icons";

function renderSvgElement(el: SvgElementSpec, key: number) {
  switch (el.tag) {
    case "path":
      return <path key={key} d={el.d} fillRule={el.fillRule} />;
    case "circle":
      return <circle key={key} cx={el.cx} cy={el.cy} r={el.r} />;
    case "rect":
      return <rect key={key} x={el.x} y={el.y} width={el.width} height={el.height} rx={el.rx} />;
    case "polygon":
      return <polygon key={key} points={el.points} />;
    case "text":
      return (
        <text
          key={key}
          x={el.x}
          y={el.y}
          fontSize={el.fontSize}
          fontWeight={el.fontWeight}
          textAnchor="middle"
        >
          {el.content}
        </text>
      );
  }
}

interface HostIconGlyphProps {
  icon: HostIconDef;
  size?: number;
  className?: string;
}

/**
 * Single render path for a resolved HostIconDef. Always monochrome: hugeicon
 * defs never pass primaryColor/secondaryColor, and svg defs set
 * fill="currentColor" once at the <svg> root (never per-element) so color
 * comes entirely from the wrapping element's text color.
 */
export function HostIconGlyph({ icon, size = 16, className }: HostIconGlyphProps) {
  if (icon.kind === "hugeicon") {
    return <HugeiconsIcon icon={icon.icon} size={size} strokeWidth={1.75} className={className} />;
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox={icon.viewBox}
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      {icon.elements.map((el, i) => renderSvgElement(el, i))}
    </svg>
  );
}
