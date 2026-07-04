// Matches dev-server-style local URLs (vite, next dev, webpack, …). Anchors
// on a word boundary so we don't catch substrings of longer paths.
//
// Deliberately dependency-free (no xterm imports) so it can be pulled into
// terminalSessionRegistry.ts's deliverBytes/deliverText (used regardless of
// whether a session currently has a bound renderer slot) without dragging
// the whole xterm/addon stack into contexts — like unit tests — that only
// need the regex.
export const LOCAL_URL_RE =
  /\bhttps?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0)(?::\d{1,5})?(?:\/[^\s\x1b]*)?/g;

export function stripTrailingPunct(url: string): string {
  return url.replace(/[.,);\]]+$/, "");
}

// Looks for the literal byte sequence ":" "/" "/" — the cheapest signal
// that a chunk *might* contain a URL. Avoids per-chunk UTF-8 decode + regex
// scan when running noisy commands.
export function containsSchemeSeparator(bytes: Uint8Array): boolean {
  const n = bytes.length;
  for (let i = 0; i < n - 2; i++) {
    if (bytes[i] === 0x3a && bytes[i + 1] === 0x2f && bytes[i + 2] === 0x2f) {
      return true;
    }
  }
  return false;
}
