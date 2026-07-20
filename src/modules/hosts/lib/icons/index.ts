import { NUMBER_ICONS } from "./numberIcons";
import { OS_ICONS } from "./osIcons";
import { SHAPE_ICONS } from "./shapeIcons";
import { SYMBOL_ICONS } from "./symbolIcons";
import type { HostIconDef } from "./types";

export type {
  ComponentHostIcon,
  HostIconCategory,
  HostIconDef,
  HugeiconHostIcon,
  SvgElementSpec,
  SvgHostIcon,
} from "./types";

export const HOST_ICON_CATEGORIES = [
  { id: "os", label: "Operating Systems", icons: OS_ICONS },
  { id: "shape", label: "Shapes", icons: SHAPE_ICONS },
  { id: "symbol", label: "Symbols", icons: SYMBOL_ICONS },
  { id: "number", label: "Numbers", icons: NUMBER_ICONS },
] as const;

export const ALL_HOST_ICONS: HostIconDef[] = [...OS_ICONS, ...SHAPE_ICONS, ...SYMBOL_ICONS, ...NUMBER_ICONS];

const ICON_BY_ID = new Map(ALL_HOST_ICONS.map((icon) => [icon.id, icon]));

/**
 * Resolves a persisted icon id to its definition. Returns null (never
 * throws) for an unset/unknown id — Host.icon is a free-standing string in
 * SQLite that can drift from the registry across app versions (e.g. after
 * a future rename), and every caller must fall back to the initials avatar
 * in that case rather than crash.
 */
export function resolveHostIcon(iconId: string | null | undefined): HostIconDef | null {
  if (!iconId) return null;
  return ICON_BY_ID.get(iconId) ?? null;
}
