/**
 * Runtime resolution of shadcn CSS custom properties into concrete rgb strings.
 *
 * globals.css declares tokens in oklch(), which xterm.js (WebGL) and
 * CodeMirror's static theme builder can't consume directly. We resolve each
 * token through the browser (setting `color: var(--x)` on a detached
 * element and reading getComputedStyle().color back), then normalize the
 * result through a 1x1 canvas pixel read-back (see toRgbString) — some
 * WebKit versions now echo getComputedStyle().color back in its original
 * oklch/oklab/color() notation instead of always down-converting to legacy
 * rgb()/rgba(), so the computed-style step alone is no longer sufficient.
 *
 * Tokens are read once per call. Callers that need to react to theme changes
 * (light/dark toggle) should re-invoke and rebuild their theme object.
 */

type TokenName =
  | "background"
  | "foreground"
  | "card"
  | "muted"
  | "muted-foreground"
  | "accent"
  | "accent-foreground"
  | "border"
  | "primary"
  | "destructive"
  | "ring"
  // Surfaces
  | "toolbar-background"
  | "title-bar-background"
  | "status-bar-background"
  // Semantic status
  | "modified"
  | "error"
  | "warning"
  | "info"
  | "hint"
  | "success"
  // UI interaction
  | "cursor"
  | "selection"
  // Terminal
  | "terminal-background"
  | "terminal-foreground"
  | "terminal-bright-foreground"
  | "terminal-dim-foreground"
  | "terminal-black"
  | "terminal-red"
  | "terminal-green"
  | "terminal-yellow"
  | "terminal-blue"
  | "terminal-magenta"
  | "terminal-cyan"
  | "terminal-white"
  | "terminal-bright-black"
  | "terminal-bright-red"
  | "terminal-bright-green"
  | "terminal-bright-yellow"
  | "terminal-bright-blue"
  | "terminal-bright-magenta"
  | "terminal-bright-cyan"
  | "terminal-bright-white"
  | "terminal-dim-black"
  | "terminal-dim-red"
  | "terminal-dim-green"
  | "terminal-dim-yellow"
  | "terminal-dim-blue"
  | "terminal-dim-magenta"
  | "terminal-dim-cyan"
  | "terminal-dim-white";

export type AppTokens = Record<TokenName, string>;

const TOKENS: TokenName[] = [
  "background",
  "foreground",
  "card",
  "muted",
  "muted-foreground",
  "accent",
  "accent-foreground",
  "border",
  "primary",
  "destructive",
  "ring",
  "toolbar-background",
  "title-bar-background",
  "status-bar-background",
  "modified",
  "error",
  "warning",
  "info",
  "hint",
  "success",
  "cursor",
  "selection",
  "terminal-background",
  "terminal-foreground",
  "terminal-bright-foreground",
  "terminal-dim-foreground",
  "terminal-black",
  "terminal-red",
  "terminal-green",
  "terminal-yellow",
  "terminal-blue",
  "terminal-magenta",
  "terminal-cyan",
  "terminal-white",
  "terminal-bright-black",
  "terminal-bright-red",
  "terminal-bright-green",
  "terminal-bright-yellow",
  "terminal-bright-blue",
  "terminal-bright-magenta",
  "terminal-bright-cyan",
  "terminal-bright-white",
  "terminal-dim-black",
  "terminal-dim-red",
  "terminal-dim-green",
  "terminal-dim-yellow",
  "terminal-dim-blue",
  "terminal-dim-magenta",
  "terminal-dim-cyan",
  "terminal-dim-white",
];

let probe: HTMLDivElement | null = null;
let colorCtx: CanvasRenderingContext2D | null = null;

function getColorCtx(): CanvasRenderingContext2D {
  if (!colorCtx) {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    colorCtx = canvas.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D;
  }
  return colorCtx;
}

// Newer WebKit (Tauri's macOS webview) can serialize getComputedStyle().color
// back in its original color space (oklch/oklab/color(), ...) instead of
// always down-converting to legacy rgb()/rgba() the way older engines did.
// xterm's WebGL addon only understands #hex/rgba() when it re-parses
// fillStyle (see @xterm/addon-webgl's CustomGlyphs.ts drawPatternChar), so an
// un-normalized oklch string throws "Unexpected fillStyle color format" the
// first time a synthetic glyph (box-drawing, powerline, braille, ...) needs
// to be drawn. Painting onto a 1x1 canvas and reading the decoded pixel back
// sidesteps the ambiguity entirely: canvas fillStyle accepts any color the
// browser can parse (including oklch) as *input*, but getImageData always
// returns concrete 0-255 sRGB bytes regardless of the source color space.
function toRgbString(cssColor: string): string {
  const ctx = getColorCtx();
  ctx.clearRect(0, 0, 1, 1);
  ctx.fillStyle = cssColor;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
  return a === 255 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${(a / 255).toFixed(3)})`;
}

function resolve(varName: string): string {
  if (!probe) {
    probe = document.createElement("div");
    probe.style.position = "absolute";
    probe.style.visibility = "hidden";
    probe.style.pointerEvents = "none";
    document.body.appendChild(probe);
  }
  probe.style.color = `var(--${varName})`;
  return toRgbString(getComputedStyle(probe).color);
}

export function readAppTokens(): AppTokens {
  const out = {} as AppTokens;
  for (const name of TOKENS) out[name] = resolve(name);
  return out;
}
