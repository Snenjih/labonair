import { readAppTokens } from "@/styles/tokens";
import type { ITheme } from "@xterm/xterm";

/**
 * xterm.js ITheme is 18 colors: bg/fg/cursor/cursorAccent/selection + ANSI 16.
 * All colors come from CSS custom properties set by the theme engine, so any
 * loaded JSON theme fully controls the terminal palette.
 */

/**
 * Builds an xterm theme at runtime from the current app tokens. Must be
 * called after the DOM is ready (after first paint); globals.css variables
 * are resolved via getComputedStyle.
 */
export function buildTerminalTheme(): ITheme {
  const t = readAppTokens();
  return {
    background: t["terminal-background"] || t.background,
    foreground: t["terminal-foreground"] || t.foreground,
    cursor: t.cursor || t["terminal-foreground"] || t.foreground,
    cursorAccent: t["terminal-background"] || t.background,
    selectionBackground: t.selection || t.accent,
    black: t["terminal-black"],
    red: t["terminal-red"],
    green: t["terminal-green"],
    yellow: t["terminal-yellow"],
    blue: t["terminal-blue"],
    magenta: t["terminal-magenta"],
    cyan: t["terminal-cyan"],
    white: t["terminal-white"],
    brightBlack: t["terminal-bright-black"],
    brightRed: t["terminal-bright-red"],
    brightGreen: t["terminal-bright-green"],
    brightYellow: t["terminal-bright-yellow"],
    brightBlue: t["terminal-bright-blue"],
    brightMagenta: t["terminal-bright-magenta"],
    brightCyan: t["terminal-bright-cyan"],
    brightWhite: t["terminal-bright-white"],
  };
}

/** Semantic palette reused by the code editor, derived from terminal tokens. */
export function buildSyntaxPalette() {
  const t = readAppTokens();
  return {
    comment: t["terminal-bright-black"],
    keyword: t["terminal-blue"],
    string: t["terminal-green"],
    number: t["terminal-yellow"],
    constant: t["terminal-magenta"],
    fn: t["terminal-cyan"],
    type: t["terminal-bright-cyan"],
    tag: t["terminal-red"],
    punctuation: t["terminal-bright-black"],
    invalid: t["terminal-red"],
    link: t["terminal-blue"],
  };
}
