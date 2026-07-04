import { invoke, Channel } from "@tauri-apps/api/core";

export type PtyEvent = { type: "data"; data: string } | { type: "exit"; code: number };

export type PtyHandlers = {
  onData: (bytes: Uint8Array) => void;
  onExit?: (code: number) => void;
};

export type PtySession = {
  id: number;
  /** Exposed so a backgrounded pane can hand it off to suspendedSessionBuffer
   *  on suspend, and a resumed pane can reattach to the same live channel
   *  instead of opening a brand-new pty (see attachToPty). */
  channel: Channel<PtyEvent>;
  write: (data: string) => Promise<void>;
  resize: (cols: number, rows: number) => Promise<void>;
  close: () => Promise<void>;
};

export function decodeBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

function wirePtySession(id: number, channel: Channel<PtyEvent>, handlers: PtyHandlers): PtySession {
  channel.onmessage = (event) => {
    switch (event.type) {
      case "data":
        handlers.onData(decodeBase64(event.data));
        break;
      case "exit":
        handlers.onExit?.(event.code);
        break;
    }
  };
  return {
    id,
    channel,
    write: (data) => invoke("pty_write", { id, data }),
    resize: (c, r) => invoke("pty_resize", { id, cols: c, rows: r }),
    close: () => invoke("pty_close", { id }),
  };
}

export async function openPty(
  cols: number,
  rows: number,
  handlers: PtyHandlers,
  cwd?: string,
  shell?: string,
): Promise<PtySession> {
  const channel = new Channel<PtyEvent>();
  const id = await invoke<number>("pty_open", {
    cols,
    rows,
    cwd: cwd ?? null,
    shell: shell && shell.trim() !== "" ? shell.trim() : null,
    onEvent: channel,
  });
  return wirePtySession(id, channel, handlers);
}

/**
 * Reattaches to an already-open pty's channel — used when resuming a
 * suspended session. No `pty_open` call: the backend process and its
 * Channel were never closed, only the frontend's rendering was torn down
 * (see suspendedSessionBuffer.ts). Synchronous, unlike `openPty`.
 */
export function attachToPty(channel: Channel<never>, id: number, handlers: PtyHandlers): PtySession {
  return wirePtySession(id, channel as unknown as Channel<PtyEvent>, handlers);
}
