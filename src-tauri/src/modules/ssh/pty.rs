use std::io::{Read, Write};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};
use serde::Serialize;
use tauri::Emitter;
use tauri::ipc::Channel;

const SSH_BATCH_BYTES: usize = 16 * 1024;
const SSH_BATCH_MS: Duration = Duration::from_millis(4);

// Idle-poll backoff: an idle reader thread starts at IDLE_POLL_MIN_MS and steps
// up by IDLE_POLL_STEP_MS every idle iteration once it has been idle for more
// than IDLE_BACKOFF_THRESHOLD consecutive iterations, capping at
// IDLE_POLL_MAX_MS. Any successful data read resets it to IDLE_POLL_MIN_MS
// immediately, so interactive typing/echo latency never regresses — only
// genuinely idle sessions (e.g. a background tab sitting on a shell prompt)
// back off, which cuts their wakeup/lock-acquisition rate on the shared
// `SshState` mutex by up to 5x (200/s -> 40/s per idle session).
const IDLE_POLL_MIN_MS: u64 = 5;
const IDLE_POLL_MAX_MS: u64 = 25;
const IDLE_POLL_STEP_MS: u64 = 5;
const IDLE_BACKOFF_THRESHOLD: u32 = 4;

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

/// Computes the next idle-poll interval (in ms) given the current interval and
/// how many *consecutive* idle iterations have elapsed. Pure so it can be unit
/// tested without spinning up threads/channels. Callers reset to
/// `IDLE_POLL_MIN_MS` (and `idle_iterations` to 0) on the iteration after any
/// data is read — that reset is trivial state, not part of this function.
fn step_idle_poll(current_ms: u64, idle_iterations: u32) -> u64 {
    if idle_iterations > IDLE_BACKOFF_THRESHOLD {
        (current_ms + IDLE_POLL_STEP_MS).min(IDLE_POLL_MAX_MS)
    } else {
        current_ms
    }
}

#[tauri::command]
pub fn ssh_pty_write(
    session_id: String,
    data: String,
    state: tauri::State<'_, super::SshState>,
) -> Result<(), String> {
    let inner = crate::get_session_arc!(state, &session_id);
    let mut guard = inner.lock().map_err(|e| e.to_string())?;
    let channel = guard.channel.as_mut().ok_or("no channel open")?;
    channel.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
    channel.flush().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn ssh_pty_resize(
    session_id: String,
    cols: u32,
    rows: u32,
    state: tauri::State<'_, super::SshState>,
) -> Result<(), String> {
    let inner = crate::get_session_arc!(state, &session_id);
    let mut guard = inner.lock().map_err(|e| e.to_string())?;
    let channel = guard.channel.as_mut().ok_or("no channel open")?;
    channel
        .request_pty_size(cols, rows, None, None)
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Opens a PTY shell channel on an authenticated session and spawns a
/// background reader thread that streams output directly into the caller-
/// supplied `on_event` channel (point-to-point — see `SshPtyEvent`'s docs).
///
/// Stores the opened channel directly into `inner_arc` (so it lives behind
/// the same lock as the session it was opened from — see `SshSessionInner`)
/// and returns just the shutdown flag. The caller must:
/// 1. Insert `inner_arc` (with `shutdown`) into `SshState` as the `SshSession`.
/// 2. Send `()` on `ready_tx` to unblock the reader thread.
///
/// `cols`/`rows` set the initial terminal size to avoid a jarring resize on connect.
#[allow(clippy::too_many_arguments)]
pub fn open_shell_channel(
    inner_arc: std::sync::Arc<std::sync::Mutex<super::SshSessionInner>>,
    session_id: &str,
    app: &tauri::AppHandle,
    state: super::SshState,
    ready_rx: std::sync::mpsc::Receiver<()>,
    cols: u32,
    rows: u32,
    keep_alive_interval: Option<u32>,
    keep_alive_tries: Option<u32>,
    blocks: bool,
    on_event: Channel<SshPtyEvent>,
) -> Result<Arc<AtomicBool>, String> {
    let mut guard = inner_arc.lock().map_err(|e| e.to_string())?;
    let mut channel = guard.session.channel_session().map_err(|e| e.to_string())?;
    channel
        .request_pty("xterm-256color", None, Some((cols, rows, 0, 0)))
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
    if channel.exec(&cmd).is_err() {
        channel.shell().map_err(|e| e.to_string())?;
    }

    // Non-blocking so the reader never holds the session lock indefinitely.
    guard.session.set_blocking(false);
    guard.channel = Some(channel);
    drop(guard);

    let app_clone = app.clone();
    let session_id_clone = session_id.to_string();
    let shutdown = Arc::new(AtomicBool::new(false));
    let shutdown_clone = shutdown.clone();
    let inner_arc_clone = inner_arc.clone();

    std::thread::spawn(move || {
        // Block until the session has been inserted into SshState so we never
        // miss a single byte of output (replaces the old 200×10ms retry loop).
        let _ = ready_rx.recv();

        let ka_interval = Duration::from_secs(keep_alive_interval.unwrap_or(25) as u64);
        let ka_max_fails = keep_alive_tries.unwrap_or(3);
        let mut last_keepalive = Instant::now();
        let mut ka_consecutive_fails: u32 = 0;

        // Tracks the reason for an unexpected exit so we can notify the frontend.
        // None means the loop ended normally (ssh_disconnect set the shutdown
        // flag, or the frontend's Channel was dropped/closed — neither is an
        // unexpected disconnect worth surfacing via ssh_connection_lost).
        let mut disconnect_reason: Option<String> = None;

        // Carry buffer for incomplete multi-byte UTF-8 sequences. When a read ends
        // in the middle of a multi-byte character (e.g. a 3-byte box-drawing glyph
        // split across a 4096-byte boundary), the trailing incomplete bytes are kept
        // here and prepended to the next chunk. Definitively invalid sequences
        // (e.g. Latin-1 bytes, binary) are replaced with U+FFFD via flush_carry.
        let mut carry: Vec<u8> = Vec::new();

        // Output accumulator: batch small reads into fewer IPC events.
        // Flushed when the buffer reaches SSH_BATCH_BYTES or SSH_BATCH_MS elapses,
        // whichever comes first.
        let mut pending_output = String::new();
        let mut last_flush = Instant::now();

        // Idle-poll backoff state (see the constants' doc comment above).
        let mut idle_iterations: u32 = 0;
        let mut current_poll_ms: u64 = IDLE_POLL_MIN_MS;

        'reader: loop {
            if shutdown_clone.load(Ordering::Relaxed) {
                break; // clean shutdown via ssh_disconnect
            }

            // Locks the SAME per-session mutex that guards keepalive and any
            // concurrent exec call (ssh_exec_command, snippets, git-over-exec)
            // for this session — this is the fix for the "transport read"
            // race: previously this read only held the outer SshState map
            // lock, entirely independent of the session-level lock those
            // other callers used, so libssh2's non-thread-safe transport
            // could be touched from two threads at once.
            let data = {
                let mut guard = match inner_arc_clone.lock() {
                    Ok(g) => g,
                    Err(_) => {
                        disconnect_reason = Some("Internal lock error".to_string());
                        break;
                    }
                };
                let Some(ch) = guard.channel.as_mut() else { break };

                if ch.eof() {
                    disconnect_reason = Some("Connection closed by remote host".to_string());
                    break;
                }

                let mut buf = [0u8; 32768];
                match ch.read(&mut buf) {
                    Ok(0) => None,
                    Ok(n) => {
                        ka_consecutive_fails = 0; // live data proves connection is alive
                        // Real I/O activity — snap the poll interval back to the
                        // minimum immediately so echo/typing latency never regresses.
                        idle_iterations = 0;
                        current_poll_ms = IDLE_POLL_MIN_MS;
                        carry.extend_from_slice(&buf[..n]);
                        flush_carry(&mut carry)
                    }
                    Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => None,
                    Err(e) => {
                        disconnect_reason = Some(humanize_disconnect_reason(&e.to_string()));
                        break;
                    }
                }
            };

            if let Some(output) = data {
                pending_output.push_str(&output);
                let should_flush = pending_output.len() >= SSH_BATCH_BYTES
                    || last_flush.elapsed() >= SSH_BATCH_MS;
                if should_flush {
                    let chunk = std::mem::take(&mut pending_output);
                    if !send_ssh_output(&on_event, chunk) {
                        break 'reader; // frontend unmounted/closed the channel — not a real disconnect
                    }
                    last_flush = Instant::now();
                }
            } else {
                // WouldBlock / idle — flush pending output if the timer elapsed.
                if !pending_output.is_empty() && last_flush.elapsed() >= SSH_BATCH_MS {
                    let chunk = std::mem::take(&mut pending_output);
                    if !send_ssh_output(&on_event, chunk) {
                        break 'reader;
                    }
                    last_flush = Instant::now();
                }
                if last_keepalive.elapsed() >= ka_interval {
                    // Same `inner_arc_clone` as the read above — no separate
                    // lock, so this can never race the read loop or any
                    // concurrent exec call on this session.
                    if let Ok(guard) = inner_arc_clone.lock() {
                        match guard.session.keepalive_send() {
                            Ok(_) => {
                                last_keepalive = Instant::now();
                                ka_consecutive_fails = 0;
                            }
                            Err(ref e) if matches!(e.code(), ssh2::ErrorCode::Session(-37)) => {
                                // LIBSSH2_ERROR_EAGAIN: non-blocking would block.
                                // Don't reset last_keepalive — retry next idle iteration.
                            }
                            Err(e) => {
                                ka_consecutive_fails += 1;
                                if ka_consecutive_fails >= ka_max_fails {
                                    disconnect_reason =
                                        Some(humanize_disconnect_reason(&e.to_string()));
                                    break 'reader;
                                }
                                last_keepalive = Instant::now();
                            }
                        }
                    }
                }
                idle_iterations = idle_iterations.saturating_add(1);
                current_poll_ms = step_idle_poll(current_poll_ms, idle_iterations);
                std::thread::sleep(Duration::from_millis(current_poll_ms));
            }
        }

        // Flush any remaining buffered output before the disconnect event so no
        // bytes are lost when the connection closes mid-stream. If the channel is
        // already closed this is a harmless no-op (ignored return value).
        if !pending_output.is_empty() {
            send_ssh_output(&on_event, pending_output);
        }

        // Emit disconnect event only for unexpected exits.
        if let Some(reason) = disconnect_reason {
            // Clean up the dead session so reconnect can create a fresh one.
            if let Ok(mut map) = state.0.lock() {
                map.remove(&session_id_clone);
            }
            let _ = app_clone.emit(
                "ssh_connection_lost",
                serde_json::json!({
                    "session_id": session_id_clone,
                    "reason": reason
                }),
            );
        }
    });

    Ok(shutdown)
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

fn humanize_disconnect_reason(raw: &str) -> String {
    let lower = raw.to_lowercase();
    if lower.contains("transport read") || lower.contains("transport write") {
        format!("Network transport failure — the connection was dropped by the server or network [{raw}]")
    } else if lower.contains("connection reset") {
        "Connection reset by the server".to_string()
    } else if lower.contains("broken pipe") {
        "Connection interrupted — the pipe to the server was broken".to_string()
    } else if lower.contains("timed out") {
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

    #[test]
    fn step_idle_poll_stays_at_current_below_threshold() {
        let mut poll = IDLE_POLL_MIN_MS;
        for iter in 1..=IDLE_BACKOFF_THRESHOLD {
            poll = step_idle_poll(poll, iter);
            assert_eq!(poll, IDLE_POLL_MIN_MS, "should not step up at iteration {iter}");
        }
    }

    #[test]
    fn step_idle_poll_steps_up_past_threshold_and_caps() {
        let mut poll = IDLE_POLL_MIN_MS;
        for iter in 1..=20u32 {
            poll = step_idle_poll(poll, iter);
        }
        assert_eq!(poll, IDLE_POLL_MAX_MS, "should cap at the max after many idle iterations");
    }

    #[test]
    fn step_idle_poll_ramps_gradually() {
        // Iterations 1-4 (<= threshold) hold at min; iteration 5 takes the first step.
        let mut poll = IDLE_POLL_MIN_MS;
        for iter in 1..=4u32 {
            poll = step_idle_poll(poll, iter);
        }
        assert_eq!(poll, IDLE_POLL_MIN_MS);
        poll = step_idle_poll(poll, 5);
        assert_eq!(poll, IDLE_POLL_MIN_MS + IDLE_POLL_STEP_MS);
    }
}
