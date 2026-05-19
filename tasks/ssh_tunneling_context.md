# PRD: SSH Tunneling & Port Forwarding
**Project:** Nexum
**Component:** Host Manager & SSH Backend
**Goal:** Implement native Local Port Forwarding (SSH `-L`). Users can define port mappings in the Host Manager. When connecting to the host, Nexum will automatically bind local ports and route traffic through the SSH connection to the remote destination.

## 1. Data Model Updates (SQLite & TypeScript)
Tunnels belong to a specific Host. Since the number of tunnels per host is dynamic and small, we will store them as a JSON array string in a new `tunnels` column on the `hosts` table.

### 1.1 TypeScript Types (`src/modules/hosts/types.ts`)
```typescript
export interface TunnelConfig {
  id: string; // e.g., generated UUID
  type: "local"; // "local" is MVP. "remote" or "dynamic" can be added later.
  local_port: number;
  remote_host: string; // usually "127.0.0.1" or "localhost"
  remote_port: number;
}
```
Add `tunnels?: string;` (the stringified JSON array) to `Host`, `CreateHostPayload`, and `UpdateHostPayload`.

### 1.2 Rust Database Migrations (`src-tauri/src/modules/hosts/db.rs`)
- In `initialize_db`, add the migration: `ALTER TABLE hosts ADD COLUMN tunnels TEXT`.
- Update `row_to_host`, `SELECT_HOSTS`, `hosts_create`, and `hosts_update` to map the `tunnels` column.

## 2. UI Implementation (`HostFormPanel.tsx`)
Extend the Master-Detail panel to manage tunnels.

### 2.1 The "Tunnels" Tab
- Add a new `<TabsTrigger value="tunnels">Tunnels</TabsTrigger>` to the HostFormPanel.
- Inside `<TabsContent value="tunnels">`:
  - A list of existing tunnels for the host.
  - An "Add Tunnel" button.
  - **Tunnel Row UI:** 
    - Flex layout showing: `Local Port [ 5432 ] ➔ Remote [ 127.0.0.1 ] : [ 5432 ]`.
    - Input fields for these three values.
    - A Trash/Delete icon button to remove the tunnel.
  - When the user edits these fields, update the `tunnels` array in the `form` state and `JSON.stringify` it to the backend on blur.

## 3. Backend Implementation (Rust `ssh2` Tunneling)
*CRITICAL ARCHITECTURE NOTE:* The main `SshSession` in `SshState` is wrapped in a `Mutex`. If we pump TCP data through an `ssh2::Channel` on the same session, it will constantly lock the Mutex and **freeze the interactive terminal**.
**The Solution:** For port forwarding, we will establish a *dedicated, secondary background SSH connection* exclusively for tunnels.

### 3.1 Background Tunnel Manager (`src-tauri/src/modules/ssh/tunnels.rs`)
Create a new file `tunnels.rs` to handle the forwarding logic.

**Workflow:**
1. Create a new command: `ssh_start_tunnels(host_id)`.
2. This command looks up the host in SQLite, fetches the password from the keychain, and reads the `tunnels` JSON string.
3. If tunnels exist, it spawns a `tokio::task` that creates a NEW blocking `ssh2::Session` and connects to the server (exactly like `client::ssh_connect`, but without PTY or SFTP).
4. Once authenticated, for each tunnel, spawn a standard `std::thread` that runs a `std::net::TcpListener::bind` on `127.0.0.1:{local_port}`.

### 3.2 The TCP ↔ SSH Data Pump
When the local `TcpListener` accepts a new connection:
1. Open a direct TCP/IP channel on the SSH session: `session.channel_direct_tcpip(&remote_host, remote_port, None)`.
2. Use standard Rust threads to pump data bidirectionally between the local `TcpStream` and the `ssh2::Channel`.
*(Note to AI: `ssh2::Channel` can be read from and written to. You will need to clone the `TcpStream` and spawn two lightweight threads per active connection: one copying TCP→SSH, one copying SSH→TCP, using `std::io::copy`).*

### 4. Integration
- The frontend should invoke `ssh_start_tunnels(hostId)` right after receiving the `session_established` event in `SshLoadingScreen.tsx`, or as part of the connection flow.
- (Optional for MVP but good practice): Provide a way to kill the background tunnel session when the tab is closed, e.g., storing the tunnel thread handles or session in a `TunnelState` map and disconnecting them on `ssh_disconnect`.

## 5. Advanced UI/UX & Layout Specifics (Addendum)
To ensure the "Tunnels" tab perfectly matches the Nexum aesthetic:
- **Empty State:** If the `tunnels` array is empty or undefined, render a clean empty state inside the tab: a subtle icon (e.g., `WaypointsIcon` or `ArrowRightDoubleIcon`), text "No tunnels configured", and an "Add Tunnel" button below it.
- **Row Layout:** Use a `grid` or `flex` row for each tunnel. 
  - `Local port` (Input type="number", placeholder="e.g. 5432", w-24)
  - An arrow icon `➔` (text-muted-foreground)
  - `Remote host` (Input type="text", placeholder="127.0.0.1", flex-1)
  - `Remote port` (Input type="number", placeholder="5432", w-24)
- **Validation:** Port inputs must have `min={1}` and `max={65535}`.
- **Default Values:** When clicking "Add Tunnel", push a new object with generated ID, `type: "local"`, `local_port: 8080`, `remote_host: "127.0.0.1"`, `remote_port: 8080`.

## 6. Lifecycle & Port Collision Edge Cases (CRITICAL)
If the AI agent does not handle these, the app will crash or leak memory:

### 6.1 Multi-Tab / Double-Bind Issue
- **The Problem:** If a user opens *two* SSH tabs to the same host, the app will try to call `ssh_start_tunnels(host_id)` twice. The second call will crash because the local port is already bound by the first call.
- **The Solution:** In `src-tauri/src/modules/ssh/tunnels.rs`, create a global `TunnelState` (wrapped in a Mutex) that tracks active tunnels by `host_id`. 
  - `pub struct TunnelState(pub Arc<Mutex<HashMap<String, tokio::sync::oneshot::Sender<()>>>>);`
  - If `ssh_start_tunnels` is called and `host_id` is already in the map, **silently return Ok(())** (the tunnel is already running).

### 6.2 Port In Use (Graceful Degradation)
- **The Problem:** If `TcpListener::bind` fails (e.g., the user has Postgres running locally on 5432, and the tunnel tries to bind 5432), Rust must not panic.
- **The Solution:** Catch the `bind` error, log it via `log::warn!`, and continue trying to bind the *other* tunnels in the list. Do not crash the entire SSH connection just because one tunnel failed.

### 6.3 Zombie Tunnels (Proper Shutdown)
- **The Problem:** When the user closes the SSH tab, the background `TcpListener` loops will run forever in the background, keeping the local ports locked.
- **The Solution:** 
  1. Wrap the `TcpListener::accept` loop in a Tokio `select!` macro alongside a `oneshot::Receiver`.
  2. Save the `oneshot::Sender` in the `TunnelState` map.
  3. Create a command `ssh_stop_tunnels(host_id)`. When called, it removes the sender from the map and sends a shutdown signal, causing the accept-loop to terminate.
  4. **Frontend Wiring:** Update `ssh_disconnect` (or the frontend `closeTab` logic) so that when the LAST tab for a specific `hostId` is closed, it invokes `ssh_stop_tunnels(hostId)`.

## 7. Implementation Status
- ✅ Phase 1: Data model — `TunnelConfig` type, `tunnels` column in SQLite, Rust `Host` struct updated
- ✅ Phase 2: UI — "Tunnels" tab in `HostFormPanel.tsx` with empty state, add/edit/delete tunnel rows
- ✅ Phase 3: Backend — `tunnels.rs` with `TunnelState`, `ssh_start_tunnels`, `ssh_stop_tunnels`, bidirectional TCP↔SSH pump
- ✅ Frontend wiring — `ssh_start_tunnels` called on `session_established`; `ssh_stop_tunnels` called on SSH pane cleanup
