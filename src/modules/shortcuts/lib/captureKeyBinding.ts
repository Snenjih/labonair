import { IS_MAC } from "@/lib/platform";
import type { KeyBinding } from "../types";

const MODIFIER_KEYS = new Set(["Meta", "Control", "Shift", "Alt"]);

export function eventToBinding(e: KeyboardEvent): KeyBinding | null {
  if (MODIFIER_KEYS.has(e.key)) return null;
  if (!e.metaKey && !e.ctrlKey && !e.altKey) return null;
  return {
    key: e.key,
    meta: e.metaKey,
    ctrl: e.ctrlKey,
    shift: e.shiftKey,
    alt: e.altKey,
    displayKeys: buildDisplayKeys(e),
  };
}

export function bindingMatchesEvent(b: KeyBinding, e: KeyboardEvent): boolean {
  return (
    b.key.toLowerCase() === e.key.toLowerCase() &&
    b.meta === e.metaKey &&
    b.ctrl === e.ctrlKey &&
    b.shift === e.shiftKey &&
    b.alt === e.altKey
  );
}

export function buildDisplayKeys(e: KeyboardEvent): string[] {
  const keys: string[] = [];
  if (IS_MAC) {
    if (e.ctrlKey) keys.push("⌃");
    if (e.altKey) keys.push("⌥");
    if (e.shiftKey) keys.push("⇧");
    if (e.metaKey) keys.push("⌘");
  } else {
    if (e.ctrlKey) keys.push("Ctrl");
    if (e.altKey) keys.push("Alt");
    if (e.shiftKey) keys.push("Shift");
    if (e.metaKey) keys.push("Win");
  }
  keys.push(formatKey(e.key));
  return keys;
}

export function buildDisplayKeysFromBinding(b: KeyBinding): string[] {
  if (IS_MAC) {
    const keys: string[] = [];
    if (b.ctrl) keys.push("⌃");
    if (b.alt) keys.push("⌥");
    if (b.shift) keys.push("⇧");
    if (b.meta) keys.push("⌘");
    keys.push(formatKey(b.key));
    return keys;
  } else {
    const keys: string[] = [];
    if (b.ctrl) keys.push("Ctrl");
    if (b.alt) keys.push("Alt");
    if (b.shift) keys.push("Shift");
    if (b.meta) keys.push("Win");
    keys.push(formatKey(b.key));
    return keys;
  }
}

export function getLiveModifierDisplay(e: KeyboardEvent): string[] {
  if (IS_MAC) {
    const keys: string[] = [];
    if (e.ctrlKey) keys.push("⌃");
    if (e.altKey) keys.push("⌥");
    if (e.shiftKey) keys.push("⇧");
    if (e.metaKey) keys.push("⌘");
    return keys;
  } else {
    const keys: string[] = [];
    if (e.ctrlKey) keys.push("Ctrl");
    if (e.altKey) keys.push("Alt");
    if (e.shiftKey) keys.push("Shift");
    if (e.metaKey) keys.push("Win");
    return keys;
  }
}

function formatKey(key: string): string {
  const MAP: Record<string, string> = {
    ArrowUp: "↑",
    ArrowDown: "↓",
    ArrowLeft: "←",
    ArrowRight: "→",
    Backspace: "⌫",
    Delete: "Del",
    Enter: "↩",
    Tab: "⇥",
    Escape: "Esc",
    " ": "Space",
    PageUp: "PgUp",
    PageDown: "PgDn",
    Home: "Home",
    End: "End",
  };
  return MAP[key] ?? key.toUpperCase();
}
