/** Blurs the currently focused text input, if any — used to force-exit
 *  rename/path-edit mode whenever a drag or marquee-select interaction begins. */
export function blurActiveInput(): void {
  const el = document.activeElement;
  if (el instanceof HTMLInputElement) el.blur();
}

export function parentPath(p: string): string {
  if (p === "/" || p === "") return "/";
  const trimmed = p.endsWith("/") ? p.slice(0, -1) : p;
  const lastSlash = trimmed.lastIndexOf("/");
  if (lastSlash <= 0) return "/";
  return trimmed.slice(0, lastSlash);
}
