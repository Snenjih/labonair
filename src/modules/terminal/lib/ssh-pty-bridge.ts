import { Channel } from "@tauri-apps/api/core";

// Mirrors the Rust-side `SshPtyEvent` enum (src-tauri/src/modules/ssh/pty.rs):
// `#[serde(tag = "type", rename_all = "camelCase")] enum SshPtyEvent { Data { data: String } }`.
export type SshPtyEvent = { type: "data"; data: string };

/**
 * Creates a per-session output channel for SSH PTY data — point-to-point
 * delivery from the Rust reader thread, passed as the `onEvent` param to
 * `ssh_connect`/`ssh_connect_quick`. Replaces the old global `ssh_pty_output`
 * broadcast event (which fanned out to every mounted SSH pane regardless of
 * session), mirroring the `Channel<PtyEvent>` pattern already used by local
 * PTY sessions (see `pty-bridge.ts`).
 */
export function createSshOutputChannel(onData: (data: string) => void): Channel<SshPtyEvent> {
  const channel = new Channel<SshPtyEvent>();
  channel.onmessage = (event) => {
    if (event.type === "data") onData(event.data);
  };
  return channel;
}
