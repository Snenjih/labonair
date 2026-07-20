import { useId } from "react";

/**
 * The Labonair app mark (atom rings with gaps at each electron), ported from
 * the app icon source. Uses <mask>/<use>/rotated <g> — too structurally
 * complex for SvgElementSpec, so this renders as real JSX instead (see
 * ComponentHostIcon). IDs are instance-scoped via useId() since <mask>/<use>
 * references are resolved document-wide, and this can render more than once
 * at a time (picker grid + a host avatar).
 */
export function LabonairMarkGlyph() {
  const uid = useId();
  const maskId = `${uid}-mask`;
  const orbitId = `${uid}-orbit`;
  const electronId = `${uid}-electron`;

  return (
    <>
      <defs>
        <circle id={electronId} r={32} fill="none" stroke="currentColor" strokeWidth={28} />
        <ellipse
          id={orbitId}
          cx={512}
          cy={512}
          rx={145}
          ry={400}
          fill="none"
          stroke="currentColor"
          strokeWidth={28}
          strokeLinecap="round"
        />
        <mask id={maskId}>
          <rect width={1024} height={1024} fill="white" />
          <circle cx={854} cy={718} r={65} fill="black" />
          <g transform="rotate(60 512 512)">
            <circle cx={512} cy={112} r={65} fill="black" />
          </g>
          <circle cx={312} cy={742} r={65} fill="black" />
        </mask>
      </defs>

      <circle cx={512} cy={512} r={45} fill="none" stroke="currentColor" strokeWidth={28} />

      <g mask={`url(#${maskId})`}>
        <use href={`#${orbitId}`} />
        <use href={`#${orbitId}`} transform="rotate(60 512 512)" />
        <use href={`#${orbitId}`} transform="rotate(-60 512 512)" />
      </g>

      <use href={`#${electronId}`} x={854} y={718} />
      <g transform="rotate(60 512 512)">
        <use href={`#${electronId}`} x={512} y={112} />
      </g>
      <use href={`#${electronId}`} x={312} y={742} />
    </>
  );
}
