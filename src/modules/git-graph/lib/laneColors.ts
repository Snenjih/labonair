// SVG stroke attributes require color strings, not CSS class names.
// These rgb values match Tailwind's color palette and are visible in both light and dark mode.
export const LANE_COLORS = [
  "rgb(96, 165, 250)",   // blue-400
  "rgb(192, 132, 252)",  // purple-400
  "rgb(52, 211, 153)",   // emerald-400
  "rgb(251, 191, 36)",   // amber-400
  "rgb(244, 114, 182)",  // pink-400
  "rgb(34, 211, 238)",   // cyan-400
  "rgb(251, 146, 60)",   // orange-400
  "rgb(163, 230, 53)",   // lime-400
] as const;

export function laneColor(colorIndex: number): string {
  return LANE_COLORS[colorIndex % LANE_COLORS.length];
}

// Avatar fallback colors for commits without a GitHub avatar.
export const AVATAR_COLORS = [
  "#60a5fa", "#a78bfa", "#34d399", "#fb923c",
  "#f472b6", "#22d3ee", "#fbbf24", "#818cf8",
] as const;

export function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) & 0xffff;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}
