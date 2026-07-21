use std::sync::{Arc, Mutex};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};
use serde::Serialize;
use tauri::Emitter;
use tauri::ipc::Channel;

const SSH_BATCH_BYTES: usize = 16 * 1024;
const SSH_BATCH_MS: Duration = Duration::from_millis(4);

/// Event sent through the per-session `Channel<SshPtyEvent>` established by
/// `ssh_connect`/`ssh_connect_quick`. Point-to-point delivery — replaces the
/// old global `ssh_pty_output` broadcast event, which fanned out to every
/// mounted SSH terminal pane regardless of which session the data belonged to
/// (O(open sessions) wasted JS invocations per chunk). `data` is already
/// UTF-8-repaired (see `flush_carry`) so, unlike local PTY's `PtyEvent`, no
/// base64 encoding is needed here.
#[derive(Serialize, Clone)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum SshPtyEvent {
    Data { data: String },
}

#[tauri::command]
pub async fn ssh_pty_write(
    session_id: String,
    data: String,
    state: tauri::State<'_, super::SshState>,
) -> Result<(), String> {
    let session = crate::get_session_arc!(state, &session_id);
    let write_half = {
        let guard = session.pty.lock().await;
        guard.as_ref().map(|p| p.write_half.clone())
    }
    .ok_or_else(|| "no pty channel open".to_string())?;

    write_half.data_bytes(data).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn ssh_pty_resize(
    session_id: String,
    cols: u32,
    rows: u32,
    state: tauri::State<'_, super::SshState>,
) -> Result<(), String> {
    let session = crate::get_session_arc!(state, &session_id);
    let write_half = {
        let guard = session.pty.lock().await;
        guard.as_ref().map(|p| p.write_half.clone())
    }
    .ok_or_else(|| "no pty channel open".to_string())?;

    write_half
        .window_change(cols, rows, 0, 0)
        .await
        .map_err(|e| e.to_string())
}

/// Opens a PTY shell channel on an authenticated session and spawns a
/// background reader task that streams output directly into the caller-
/// supplied `on_event` channel (point-to-point — see `SshPtyEvent`'s docs).
///
/// `session` must already be registered in `state` under `session_id` by the
/// caller *before* this is invoked (see `ssh_connect_async` in `client.rs`).
/// Registering first — rather than the old model's separate
/// `ready_rx`/`ready_tx` rendezvous — is sufficient to avoid ever missing
/// output or racing the reader's disconnect-cleanup path: this whole function
/// runs sequentially on one async task with no `.await` between "channel
/// setup" and "spawn the reader", so there is no window where the reader
/// could run before the map entry exists. That rendezvous existed only to
/// guard against a genuine race under the old OS-thread-per-session reader
/// model, which no longer applies here.
///
/// `cols`/`rows` set the initial terminal size to avoid a jarring resize on connect.
#[allow(clippy::too_many_arguments)]
pub async fn open_shell_channel(
    session: Arc<super::RushSession>,
    session_id: String,
    app: tauri::AppHandle,
    state: super::SshState,
    cols: u32,
    rows: u32,
    blocks: bool,
    on_event: Channel<SshPtyEvent>,
) -> Result<(), String> {
    let channel = session
        .handle
        .channel_open_session()
        .await
        .map_err(|e| e.to_string())?;

    channel
        .request_pty(false, "xterm-256color", cols, rows, 0, 0, &[])
        .await
        .map_err(|e| e.to_string())?;

    // Installs the same OSC7/133 hooks the local PTY gets (see
    // shell_integration::build_bootstrap_script) so the sidebar explorer and
    // cwd breadcrumb can follow `cd` on a remote shell too. Falls back to a
    // bare, non-integrated login shell if the bootstrap exec itself can't be
    // requested (e.g. a server that only permits a fixed "shell" request) —
    // matches the local `Shell::Other` behavior of degrading gracefully
    // rather than failing the connection.
    let bootstrap = super::shell_integration::build_bootstrap_script(blocks);
    let cmd = format!("/bin/sh -c {}", super::shell::shell_quote(&bootstrap));
    if channel.exec(true, cmd).await.is_err() {
        channel.request_shell(true).await.map_err(|e| e.to_string())?;
    }

    let (read_half, write_half) = channel.split();

    {
        let mut guard = session.pty.lock().await;
        *guard = Some(super::PtyChannelState {
            write_half: Arc::new(write_half),
        });
    }

    spawn_reader(
        read_half,
        app,
        session_id,
        state,
        session.shutdown.clone(),
        session.disconnect_reason.clone(),
        on_event,
        session.agent_tap.clone(),
    );

    Ok(())
}

/// Background reader task: streams `ChannelMsg::Data`/`ExtendedData` off the
/// PTY channel's read half into `on_event`, batched and UTF-8-repaired.
///
/// Races the channel read against a batch-flush timer (`tokio::select!`)
/// rather than a plain `while let Some(msg) = read_half.wait().await` loop —
/// this is the async-native equivalent of the old idle-poll loop's job of
/// flushing buffered output after `SSH_BATCH_MS` even when no *new* data has
/// arrived (e.g. a shell prompt sitting in `pending_output` with the session
/// otherwise idle). The timer branch is disabled via the `if
/// !pending_output.is_empty()` guard, so an idle session with nothing
/// buffered just blocks on `read_half.wait()` with zero polling overhead.
#[allow(clippy::too_many_arguments)]
fn spawn_reader(
    mut read_half: russh::ChannelReadHalf,
    app: tauri::AppHandle,
    session_id: String,
    state: super::SshState,
    shutdown: Arc<AtomicBool>,
    disconnect_reason_slot: Arc<Mutex<Option<String>>>,
    on_event: Channel<SshPtyEvent>,
    agent_tap: tokio::sync::broadcast::Sender<String>,
) {
    tokio::spawn(async move {
        // Carry buffer for incomplete multi-byte UTF-8 sequences. When a read ends
        // in the middle of a multi-byte character (e.g. a 3-byte box-drawing glyph
        // split across a message boundary), the trailing incomplete bytes are kept
        // here and prepended to the next chunk. Definitively invalid sequences
        // (e.g. Latin-1 bytes, binary) are replaced with U+FFFD via flush_carry.
        let mut carry: Vec<u8> = Vec::new();

        // Output accumulator: batch small reads into fewer IPC events.
        // Flushed when the buffer reaches SSH_BATCH_BYTES or SSH_BATCH_MS elapses,
        // whichever comes first.
        let mut pending_output = String::new();
        let mut last_flush = Instant::now();

        // Tracks the reason for an unexpected exit so we can notify the frontend.
        // None means the loop ended normally (ssh_disconnect set the shutdown
        // flag, or the frontend's Channel was dropped/closed — neither is an
        // unexpected disconnect worth surfacing via ssh_connection_lost).
        let mut disconnect_reason: Option<String> = None;

        'reader: loop {
            if shutdown.load(Ordering::Relaxed) {
                break; // clean shutdown via ssh_disconnect
            }

            let remaining = SSH_BATCH_MS.saturating_sub(last_flush.elapsed());
            tokio::select! {
                msg = read_half.wait() => {
                    match msg {
                        None => {
                            // Channel/session closed. If ssh_disconnect didn't
                            // request this, it's an unexpected disconnect.
                            if !shutdown.load(Ordering::Relaxed) {
                                disconnect_reason = Some(humanize_disconnect_reason(
                                    &take_disconnect_reason(&disconnect_reason_slot),
                                ));
                            }
                            break 'reader;
                        }
                        Some(russh::ChannelMsg::Data { data }) => {
                            carry.extend_from_slice(&data);
                            if let Some(out) = flush_carry(&mut carry) {
                                pending_output.push_str(&out);
                            }
                        }
                        // PTY channels don't normally get stderr as extended
                        // data since the remote shell is attached to one pty
                        // fd, but handle gracefully if it arrives rather than
                        // silently dropping it.
                        Some(russh::ChannelMsg::ExtendedData { data, .. }) => {
                            carry.extend_from_slice(&data);
                            if let Some(out) = flush_carry(&mut carry) {
                                pending_output.push_str(&out);
                            }
                        }
                        Some(russh::ChannelMsg::Eof) | Some(russh::ChannelMsg::Close) => {
                            if !shutdown.load(Ordering::Relaxed) {
                                disconnect_reason = Some(humanize_disconnect_reason(
                                    &take_disconnect_reason(&disconnect_reason_slot),
                                ));
                            }
                            break 'reader;
                        }
                        Some(_) => {}
                    }
                }
                _ = tokio::time::sleep(remaining), if !pending_output.is_empty() => {
                    // Batch interval elapsed with buffered output waiting — fall
                    // through to the flush check below.
                }
            }

            if !pending_output.is_empty() {
                let should_flush = pending_output.len() >= SSH_BATCH_BYTES
                    || last_flush.elapsed() >= SSH_BATCH_MS;
                if should_flush {
                    let chunk = std::mem::take(&mut pending_output);
                    let _ = agent_tap.send(chunk.clone());
                    if !send_ssh_output(&on_event, chunk) {
                        break 'reader; // frontend unmounted/closed the channel — not a real disconnect
                    }
                    last_flush = Instant::now();
                }
            }
        }

        // Flush any remaining buffered output before the disconnect event so no
        // bytes are lost when the connection closes mid-stream. If the channel is
        // already closed this is a harmless no-op (ignored return value).
        if !pending_output.is_empty() {
            let _ = agent_tap.send(pending_output.clone());
            send_ssh_output(&on_event, pending_output);
        }

        // Emit disconnect event only for unexpected exits.
        if let Some(reason) = disconnect_reason {
            // Clean up the dead session so reconnect can create a fresh one.
            if let Ok(mut map) = state.0.lock() {
                map.remove(&session_id);
            }
            let _ = app.emit(
                "ssh_connection_lost",
                serde_json::json!({
                    "session_id": session_id,
                    "reason": reason
                }),
            );
        }
    });
}

/// Decode as much valid UTF-8 from `carry` as possible, replacing definitively
/// invalid byte sequences with U+FFFD. Incomplete sequences at the *end* of
/// `carry` are left in place so the next read can complete them.
///
/// `Utf8Error` distinguishes two cases at the error position:
///   `error_len() == None`    → incomplete (lead byte without enough continuation
///                              bytes yet) — keep in carry and wait.
///   `error_len() == Some(n)` → invalid (the n bytes are definitively not UTF-8,
///                              e.g. Latin-1, overlong, surrogate halves) — replace
///                              with U+FFFD and drain, then continue scanning.
fn flush_carry(carry: &mut Vec<u8>) -> Option<String> {
    if carry.is_empty() {
        return None;
    }
    let mut out = String::with_capacity(carry.len());
    loop {
        match std::str::from_utf8(carry) {
            Ok(s) => {
                out.push_str(s);
                carry.clear();
                break;
            }
            Err(e) => {
                let valid_end = e.valid_up_to();
                if valid_end > 0 {
                    // SAFETY: from_utf8 verified [..valid_end] is valid UTF-8.
                    out.push_str(unsafe { std::str::from_utf8_unchecked(&carry[..valid_end]) });
                    carry.drain(..valid_end);
                }
                match e.error_len() {
                    None => {
                        // Incomplete sequence at end of carry — wait for the next chunk.
                        break;
                    }
                    Some(n) => {
                        // Definitively invalid bytes — substitute and keep scanning.
                        out.push('\u{FFFD}');
                        carry.drain(..n);
                    }
                }
            }
        }
    }
    if out.is_empty() { None } else { Some(out) }
}

/// Sends a data chunk through the per-session channel. Returns `false` if the
/// channel is closed (frontend unmounted/suspended-and-torn-down) — the caller
/// treats that as a clean, silent exit, not an `ssh_connection_lost` event.
fn send_ssh_output(channel: &Channel<SshPtyEvent>, data: String) -> bool {
    match channel.send(SshPtyEvent::Data { data }) {
        Ok(()) => true,
        Err(e) => {
            log::debug!("ssh pty channel closed, ending reader thread: {e}");
            false
        }
    }
}

/// Reads the disconnect reason `ClientHandler::disconnected()` captured (if
/// any) from the session's shared slot, falling back to a generic "unexpected
/// eof" when nothing was captured — e.g. a hard process/network kill that
/// never let the SSH transport send or process a disconnect message at all.
fn take_disconnect_reason(slot: &Mutex<Option<String>>) -> String {
    slot.lock()
        .ok()
        .and_then(|mut guard| guard.take())
        .unwrap_or_else(|| "unexpected eof".to_string())
}

fn humanize_disconnect_reason(raw: &str) -> String {
    let lower = raw.to_lowercase();
    if lower.contains("transport read") || lower.contains("transport write") {
        format!("Network transport failure — the connection was dropped by the server or network [{raw}]")
    } else if lower.contains("connection reset") {
        "Connection reset by the server".to_string()
    } else if lower.contains("broken pipe") {
        "Connection interrupted — the pipe to the server was broken".to_string()
    } else if lower.contains("timed out") || lower.contains("timeout") {
        "Connection timed out".to_string()
    } else if lower.contains("network is unreachable") || lower.contains("no route to host") {
        "Network unreachable — no route to host".to_string()
    } else if lower.contains("connection refused") {
        "Connection refused by the server".to_string()
    } else if lower.contains("eof") || lower.contains("end of file") {
        "Connection closed by the remote host (EOF)".to_string()
    } else {
        // Capitalize and keep original for unknown errors
        let mut chars = raw.chars();
        match chars.next() {
            None => String::new(),
            Some(c) => c.to_uppercase().to_string() + chars.as_str(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn flush_carry_completes_split_multibyte_char() {
        // "é" = 0xC3 0xA9 — split across two reads.
        let mut carry = vec![0xC3];
        assert_eq!(flush_carry(&mut carry), None);
        assert_eq!(carry, vec![0xC3]); // left in place, waiting for the rest

        carry.push(0xA9);
        assert_eq!(flush_carry(&mut carry), Some("é".to_string()));
        assert!(carry.is_empty());
    }

    #[test]
    fn flush_carry_replaces_invalid_bytes_with_replacement_char() {
        // 0xE9 alone is not valid UTF-8 (Latin-1 'é', not decodable as-is).
        let mut carry = vec![b'a', 0xE9, b'b'];
        let out = flush_carry(&mut carry).unwrap();
        assert_eq!(out, "a\u{FFFD}b");
        assert!(carry.is_empty());
    }

    #[test]
    fn flush_carry_passes_through_valid_ascii() {
        let mut carry = b"hello world".to_vec();
        assert_eq!(flush_carry(&mut carry), Some("hello world".to_string()));
        assert!(carry.is_empty());
    }

    #[test]
    fn flush_carry_empty_input_returns_none() {
        let mut carry: Vec<u8> = Vec::new();
        assert_eq!(flush_carry(&mut carry), None);
    }

    #[test]
    fn humanize_disconnect_reason_maps_known_patterns() {
        assert!(humanize_disconnect_reason("transport read error").contains("Network transport failure"));
        assert_eq!(humanize_disconnect_reason("Connection reset by peer"), "Connection reset by the server");
        assert_eq!(humanize_disconnect_reason("broken pipe"), "Connection interrupted — the pipe to the server was broken");
        assert_eq!(humanize_disconnect_reason("operation timed out"), "Connection timed out");
        assert_eq!(humanize_disconnect_reason("network is unreachable"), "Network unreachable — no route to host");
        assert_eq!(humanize_disconnect_reason("no route to host"), "Network unreachable — no route to host");
        assert_eq!(humanize_disconnect_reason("connection refused"), "Connection refused by the server");
        assert_eq!(humanize_disconnect_reason("unexpected eof"), "Connection closed by the remote host (EOF)");
    }

    #[test]
    fn humanize_disconnect_reason_capitalizes_unknown_errors() {
        assert_eq!(humanize_disconnect_reason("something weird happened"), "Something weird happened");
    }
}
