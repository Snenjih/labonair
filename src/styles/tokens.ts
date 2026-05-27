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

function resolve(varName: string): string {
  if (!probe) {
    probe = document.createElement("div");
    probe.style.position = "absolute";
    probe.style.visibility = "hidden";
    probe.style.pointerEvents = "none";
    document.body.appendChild(probe);
  }
  probe.style.color = `var(--${varName})`;
  return getComputedStyle(probe).color;
}

export function readAppTokens(): AppTokens {
  const out = {} as AppTokens;
  for (const name of TOKENS) out[name] = resolve(name);
  return out;
}
