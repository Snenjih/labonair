import type { IDisposable, IMarker, Terminal } from "@xterm/xterm";

export function registerCwdHandler(term: Terminal, onCwd: (cwd: string) => void): () => void {
  const d = term.parser.registerOscHandler(7, (data) => {
    const cwd = parseOsc7(data);
    if (cwd) onCwd(cwd);
    return true;
  });
  return () => d.dispose();
}

export type PromptTracker = {
  getMarker: () => IMarker | null;
  dispose: () => void;
};

export function registerPromptTracker(term: Terminal): PromptTracker {
  let marker: IMarker | null = null;
  const d = term.parser.registerOscHandler(133, (data) => {
    if (data.startsWith("A")) {
      marker?.dispose();
      marker = term.registerMarker(0);
    }
    return true;
  });
  return {
    getMarker: () => (marker && !marker.isDisposed ? marker : null),
    dispose: () => {
      d.dispose();
      marker?.dispose();
      marker = null;
    },
  };
}

/**
 * Registers terminal query response handlers for DA1, CPR, OSC 10, and OSC 11.
 * Must be called after the Terminal instance is opened and the PTY/SSH write
 * function is available. Returns a cleanup function for use in the cleanups array.
 *
 * writeToProcess: sends data back to the running shell/process.
 *   Local PTY: (d) => pty.write(d)
 *   SSH:       (d) => invoke("ssh_pty_write", { sessionId, data: d }).catch(...)
 */
export function registerTerminalQueryHandlers(
  term: Terminal,
  writeToProcess: (data: string) => void,
): () => void {
  const handles: IDisposable[] = [];

  // DA1: Primary Device Attributes (\033[c or \033[0c)
  // Intercepted before xterm.js's built-in handler to avoid the double-IPC
  // round-trip. Secondary DA (\033[>c, param > 0) is passed through.
  handles.push(
    term.parser.registerCsiHandler({ final: "c" }, (params) => {
      if ((params[0] ?? 0) !== 0) return false;
      writeToProcess("\x1b[?62;22c");
      return true;
    }),
  );

  // CPR: Cursor Position Report (\033[6n)
  // Reads cursor position directly from xterm.js buffer (0-indexed → 1-indexed).
  handles.push(
    term.parser.registerCsiHandler({ final: "n" }, (params) => {
      if (params[0] !== 6) return false;
      const buf = term.buffer.active;
      writeToProcess(`\x1b[${buf.cursorY + 1};${buf.cursorX + 1}R`);
      return true;
    }),
  );

  // OSC 10: Foreground color query (\033]10;?\007)
  // Colors read from term.options.theme — always current, works with custom themes.
  handles.push(
    term.parser.registerOscHandler(10, (data) => {
      if (data !== "?") return false;
      const fg = (term.options.theme as Record<string, string | undefined>)?.foreground ?? "#cccccc";
      writeToProcess(`\x1b]10;${hexToOscRgb(fg)}\x07`);
      return true;
    }),
  );

  // OSC 11: Background color query (\033]11;?\007)
  handles.push(
    term.parser.registerOscHandler(11, (data) => {
      if (data !== "?") return false;
      const bg = (term.options.theme as Record<string, string | undefined>)?.background ?? "#000000";
      writeToProcess(`\x1b]11;${hexToOscRgb(bg)}\x07`);
      return true;
    }),
  );

  return () => handles.forEach((h) => h.dispose());
}

// Converts #RRGGBB (or #RGB) to the VT OSC rgb: format (4 hex digits per channel).
function hexToOscRgb(hex: string): string {
  const raw = hex.replace("#", "");
  let r: number, g: number, b: number;
  if (raw.length === 3) {
    r = parseInt(raw[0] + raw[0], 16);
    g = parseInt(raw[1] + raw[1], 16);
    b = parseInt(raw[2] + raw[2], 16);
  } else {
    r = parseInt(raw.slice(0, 2), 16);
    g = parseInt(raw.slice(2, 4), 16);
    b = parseInt(raw.slice(4, 6), 16);
  }
  const to16 = (v: number) => v.toString(16).padStart(2, "0").repeat(2);
  return `rgb:${to16(r)}/${to16(g)}/${to16(b)}`;
}

function parseOsc7(data: string): string | null {
  const m = data.match(/^file:\/\/[^/]*(\/.*)$/);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return m[1];
  }
}
