# Task 03.2 — SSH PTY & Interactive Terminal (Frontend + Backend)
**Phase:** 3 — Interactive SSH Terminal
**Status:** not_started
**Priority:** Critical
**Dependencies:** TASK_03_1

## Background & Context
Once an SSH session is established (Task 03.1), the user needs a fully interactive terminal. This task wires up a pseudo-terminal (PTY) on the SSH channel and streams its output to an xterm.js instance in the frontend. The SSH terminal tab must feel identical to the local terminal tab — same fonts, same rendering pipeline, same keyboard behavior — because it reuses xterm.js with a different data transport (SSH channel instead of local PTY).

## Work Instructions

### 1. Implement `src-tauri/src/modules/ssh/pty.rs`
Replace the stub from Task 03.1 with the full implementation.

**`ssh_pty_write` command:**
```rust
#[tauri::command]
pub async fn ssh_pty_write(
    tab_id: String,
    data: String,
    state: tauri::State<'_, super::SshState>,
) -> Result<(), String> {
    use std::io::Write;
    let mut map = state.0.lock().map_err(|e| e.to_string())?;
    let session = map.get_mut(&tab_id).ok_or("no session for tab")?;
    let channel = session.channel.as_mut().ok_or("no channel open")?;
    channel.write_all(data.as_bytes()).map_err(|e| e.to_string())?;
    channel.flush().map_err(|e| e.to_string())?;
    Ok(())
}
```

**`ssh_pty_resize` command:**
```rust
#[tauri::command]
pub async fn ssh_pty_resize(
    tab_id: String,
    cols: u32,
    rows: u32,
    state: tauri::State<'_, super::SshState>,
) -> Result<(), String> {
    let mut map = state.0.lock().map_err(|e| e.to_string())?;
    let session = map.get_mut(&tab_id).ok_or("no session for tab")?;
    let channel = session.channel.as_mut().ok_or("no channel open")?;
    channel.request_pty_size(cols, rows, None, None)
        .map_err(|e| e.to_string())?;
    Ok(())
}
```

**PTY open and output streaming** — this must happen AFTER authentication in `client.rs`. Add a helper function `pub fn open_shell_channel(session: &ssh2::Session, tab_id: &str, app: &tauri::AppHandle) -> Result<ssh2::Channel, String>` (or integrate directly in `ssh_connect`):

```rust
// After session.authenticated() is confirmed in ssh_connect:

// 1. Request PTY on the session
let mut channel = session.channel_session().map_err(|e| e.to_string())?;
channel.request_pty("xterm-256color", None, Some((80, 24, 0, 0)))
    .map_err(|e| e.to_string())?;

// 2. Open a shell
channel.shell().map_err(|e| e.to_string())?;

// 3. Set non-blocking mode for the reader thread
// NOTE: We need to move a separate read-handle into a thread.
// ssh2::Channel does not implement Clone, so we store the channel in SshState
// and spawn a thread that re-locks, reads, and re-releases the mutex in a tight loop.
// Use an Arc<AtomicBool> as a stop signal.
```

**Reading output — background thread approach:**
Since `ssh2::Channel` does not implement `Clone` and cannot be shared across threads safely without the Mutex, use the following approach:

Store the `SshSession` (with channel) in `SshState`. Spawn a `std::thread` (not tokio task — ssh2 is not async) that:
1. Loops until the session is removed from the map or the channel EOF flag is set.
2. In each iteration: lock the `SshState` mutex, try to read available bytes from the channel, unlock, emit event if bytes were read, sleep ~5ms if no bytes.

```rust
// In ssh_connect, after storing SshSession:
let state_clone = state.inner().clone(); // SshState is Arc-wrapped by Tauri manage
// Wait — SshState is not Clone. Use app_handle to emit, pass tab_id + Arc<SshState>.
// Actually Tauri State<SshState> provides a reference; we need to use AppHandle.

// Preferred pattern: use a dedicated reader thread with its own TcpStream clone.
// ssh2 allows calling session.stream(0) to get a separate Read handle.
// However, stream(0) borrows from the channel mutably.

// SIMPLEST CORRECT APPROACH for MVP:
// Store channel in SshSession. Spawn std::thread. In the thread, lock SshState,
// read with a short timeout, emit if data, unlock, repeat.

let app_clone = app.clone();
let tab_id_clone = tab_id.clone();

std::thread::spawn(move || {
    use std::io::Read;
    loop {
        // Try to get data
        let data = {
            let mut map = match state_clone.0.lock() {
                Ok(m) => m,
                Err(_) => break,
            };
            let Some(sess) = map.get_mut(&tab_id_clone) else { break };
            let Some(ch) = sess.channel.as_mut() else { break };

            if ch.eof() {
                break;
            }

            let mut buf = [0u8; 4096];
            match ch.read(&mut buf) {
                Ok(0) => None,
                Ok(n) => Some(String::from_utf8_lossy(&buf[..n]).to_string()),
                Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => None,
                Err(_) => break,
            }
        };

        if let Some(output) = data {
            let _ = app_clone.emit("ssh_pty_output", serde_json::json!({
                "tab_id": tab_id_clone,
                "data": output
            }));
        } else {
            std::thread::sleep(std::time::Duration::from_millis(5));
        }
    }
});
```

**IMPORTANT**: Before spawning the reader thread, call `session.set_blocking(false)` so the `channel.read()` call returns `WouldBlock` immediately when no data is available rather than blocking the mutex forever.

Register `ssh_pty_write` and `ssh_pty_resize` in `lib.rs`.

### 2. Update `src-tauri/src/modules/ssh/mod.rs`
Ensure `pub mod pty;` is uncommented and the commands are re-exported or accessible from `lib.rs`:
```rust
pub mod client;
pub mod pty;
```

### 3. Create `src/modules/terminal/SshLoadingScreen.tsx`
This component is shown while an SSH connection is being established. Props:
```typescript
interface SshLoadingScreenProps {
  tabId: string;
  hostId: string;
  onConnected: () => void;
  onError: (message: string) => void;
}
```

**Internal state:** `status: "connecting" | "waiting_trust" | "waiting_auth" | "error"`, `errorMessage: string`, `fingerprint: string`, `promptMessage: string`.

**On mount:**
- Listen to `known_hosts_warning` Tauri event. On receive: if `payload.tab_id === tabId`, set `status = "waiting_trust"`, store fingerprint/host.
- Listen to `auth_required` Tauri event. On receive: if `payload.tab_id === tabId`, set `status = "waiting_auth"`, store prompt message.
- Listen to `session_established` Tauri event. On receive: if `payload.tab_id === tabId`, call `onConnected()`.
- Invoke `ssh_connect` (pass `tab_id` and `host_id`). On rejection (Err): set `status = "error"`, store error message.

**Cleanup on unmount:** Unlisten to all Tauri events.

**Render:**
- **"connecting" state**: centered spinner (animate-spin border-2 rounded-full border-primary), text "Connecting to host…"
- **"waiting_trust" state**: card with fingerprint displayed (monospace), "The authenticity of host `{host}` can't be established. Fingerprint: `{fingerprint}`". Two buttons: "Trust & Connect" (calls `invoke("ssh_connect", ...)` again — for MVP, just call `onConnected()`) and "Abort" (calls `onError("User aborted")`).
- **"waiting_auth" state**: form with password input, submit button. On submit, `invoke("ssh_pty_write", { tab_id: tabId, data: password + "\n" })`. (For MVP, show the prompt and let the user know the terminal will handle interactive auth.)
- **"error" state**: error card with message and "Retry" / "Close" buttons.

Use `motion.div` with `AnimatePresence` for transitions between states. No hardcoded colors.

### 4. Create `src/modules/terminal/SshTerminalPane.tsx`
This is the main component for SSH terminal tabs.

```typescript
interface SshTerminalPaneProps {
  tab: SshTerminalTab; // from useTabs types
  isActive: boolean;
}
```

**State:** `isConnected: boolean` (initially `false`), `hasError: boolean`.

**Connection flow:**
- When `isConnected === false`: renders `<SshLoadingScreen>` with the tab's `hostId`, `onConnected={() => setIsConnected(true)}`, `onError={() => setHasError(true)}`.
- When `isConnected === true`: renders the xterm.js terminal.

**xterm.js setup (mirror `TerminalPane.tsx` exactly):**
- Use a `useRef<HTMLDivElement>` for the container.
- Use `useEffect` to initialize `Terminal` + `WebglAddon` (or `CanvasAddon` as fallback).
- Use `FitAddon` to size the terminal to the container.
- **CRITICAL**: Instead of `invoke("pty_write", ...)`, call `invoke("ssh_pty_write", { tab_id: tab.id.toString(), data })`.
- **CRITICAL**: Instead of `invoke("pty_resize", ...)`, call `invoke("ssh_pty_resize", { tab_id: tab.id.toString(), cols, rows })`.
- **CRITICAL**: Instead of listening to `pty_output` event, listen to `ssh_pty_output` and filter by `payload.tab_id === tab.id.toString()`.
- On unmount: call `invoke("ssh_disconnect", { tab_id: tab.id.toString() })` and unlisten to all events.

**Study the existing `TerminalPane.tsx`** (at `src/modules/terminal/TerminalPane.tsx`) to copy its exact xterm.js initialization pattern, options, addons loading, and resize observer setup. The only changes are the IPC command/event names.

### 5. Update `src/app/App.tsx`
Find the SSH terminal tab placeholder block. Replace it:
```tsx
import { SshTerminalPane } from "@/modules/terminal/SshTerminalPane";
// ...
// In the tabs rendering section:
{tabs.map((tab) => (
  tab.kind === "ssh-terminal" && (
    <div
      key={tab.id}
      className={cn("absolute inset-0", activeTab?.id !== tab.id && "invisible pointer-events-none")}
    >
      <SshTerminalPane tab={tab as SshTerminalTab} isActive={activeTab?.id === tab.id} />
    </div>
  )
))}
```

### 6. Export from Terminal Module
Update `src/modules/terminal/index.ts` (or create if it doesn't exist) to export `SshTerminalPane` and `SshLoadingScreen`.

## Files to Create
- `src/modules/terminal/SshLoadingScreen.tsx`
- `src/modules/terminal/SshTerminalPane.tsx`

## Files to Modify
- `src-tauri/src/modules/ssh/pty.rs` (replace stub)
- `src-tauri/src/modules/ssh/client.rs` (add PTY open + reader thread after auth)
- `src-tauri/src/modules/ssh/mod.rs` (verify pty module declared)
- `src-tauri/src/lib.rs` (register `ssh_pty_write`, `ssh_pty_resize`)
- `src/app/App.tsx`
- `src/modules/terminal/index.ts`

## Expected Outcome
- Clicking "Connect SSH" on a host in the inspector opens a new SSH terminal tab.
- The loading screen appears while connecting.
- Once connected, a fully interactive xterm.js terminal appears.
- Typing in the terminal sends keystrokes to the remote shell.
- Commands execute on the remote machine and output streams back in real-time.
- Terminal resize (window resize or panel drag) propagates to the SSH channel.
- Closing the tab disconnects the SSH session cleanly.
- `cargo check` and `pnpm exec tsc --noEmit` pass.

## Additional Information
- **Verify:** Run both `cargo check` and `pnpm exec tsc --noEmit` before marking complete.
- `session.set_blocking(false)` MUST be called before spawning the reader thread, otherwise the mutex will be held indefinitely on slow connections.
- The reader thread exits when: the channel reports EOF, the session is removed from `SshState`, or an unrecoverable read error occurs.
- Avoid `unwrap()` — all `lock().unwrap()` should be `lock().map_err(|e| e.to_string())?` or equivalent.
- Listen to Tauri events using `listen` from `@tauri-apps/api/event`, not `window.__TAURI__`.
