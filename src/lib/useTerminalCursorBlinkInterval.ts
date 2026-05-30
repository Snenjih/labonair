import { useEffect } from "react";
import { usePreferencesStore } from "@/modules/settings/preferences";

const STYLE_ID = "nexum-cursor-blink-interval";

function applyInterval(ms: number): void {
  let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement("style");
    el.id = STYLE_ID;
    document.head.appendChild(el);
  }
  el.textContent = `.xterm .xterm-cursor-blink { animation-duration: ${ms}ms !important; }`;
}

export function useTerminalCursorBlinkInterval(): void {
  const interval = usePreferencesStore((s) => s.terminalCursorBlinkInterval);
  useEffect(() => {
    applyInterval(interval);
  }, [interval]);
}
