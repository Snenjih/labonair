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

/**
 * Converts an `oklch(L C H)` (or `oklch(L C H / A)`) string to an `rgb()`/
 * `rgba()` string using the standard OKLab <-> linear-sRGB matrices
 * (Björn Ottosson's reference conversion, https://bottosson.github.io/posts/oklab/).
 * Returns the input unchanged if it doesn't parse as oklch.
 */
export function oklchToRgb(value: string): string {
  const match = value.match(
    /oklch\(\s*([\d.]+%?)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+%?)\s*)?\)/i,
  );
  if (!match) return value;

  const lRaw = match[1];
  const L = lRaw.endsWith("%") ? Number.parseFloat(lRaw) / 100 : Number.parseFloat(lRaw);
  const C = Number.parseFloat(match[2]);
  const H = Number.parseFloat(match[3]);
  const alphaRaw = match[4];
  const alpha =
    alphaRaw === undefined
      ? 1
      : alphaRaw.endsWith("%")
        ? Number.parseFloat(alphaRaw) / 100
        : Number.parseFloat(alphaRaw);

  const hRad = (H * Math.PI) / 180;
  const a = C * Math.cos(hRad);
  const b = C * Math.sin(hRad);

  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;

  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;

  const rLin = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const gLin = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const bLin = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;

  const toSrgb = (c: number) => {
    const clamped = Math.min(1, Math.max(0, c));
    return clamped <= 0.0031308 ? 12.92 * clamped : 1.055 * clamped ** (1 / 2.4) - 0.055;
  };

  const r = Math.round(toSrgb(rLin) * 255);
  const g = Math.round(toSrgb(gLin) * 255);
  const bl = Math.round(toSrgb(bLin) * 255);

  return alpha < 1 ? `rgba(${r}, ${g}, ${bl}, ${alpha})` : `rgb(${r}, ${g}, ${bl})`;
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
