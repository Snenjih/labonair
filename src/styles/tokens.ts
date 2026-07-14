/**
 * Runtime resolution of shadcn CSS custom properties into concrete rgb strings.
 *
 * globals.css declares tokens in oklch(), which xterm.js (WebGL) and
 * CodeMirror's static theme builder can't consume directly. We resolve each
 * token through the browser: setting `color: var(--x)` on a detached element
 * forces computation into rgb form, which both consumers accept.
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
  const computed = getComputedStyle(probe).color;
  // Some WebKit versions preserve the source color space (oklch/color()/lab())
  // in the computed value instead of downgrading to rgb() as most engines do —
  // xterm.js's WebGL addon (and CodeMirror's static theme builder) can only
  // consume `#hex`/`rgba()`, so convert explicitly rather than trusting the
  // browser to have normalized it.
  return computed.startsWith("oklch(") ? oklchToRgb(computed) : computed;
}

export function readAppTokens(): AppTokens {
  const out = {} as AppTokens;
  for (const name of TOKENS) out[name] = resolve(name);
  return out;
}
