import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import { handleApiError } from "@/lib/errors";
import {
  setMcpAutoRevokeMinutes as persistMcpAutoRevokeMinutes,
  setMcpBridgeEnabled as persistMcpBridgeEnabled,
  setMcpBridgePort as persistMcpBridgePort,
  setMcpMaxCommandTimeoutSecs as persistMcpMaxCommandTimeoutSecs,
} from "@/modules/settings/store";

/** One tab (SSH or local) the user has explicitly granted MCP agent access
 *  to. Mirrors (client-side, for instant UI reads) whatever was last pushed
 *  to the Rust `McpState.grants` map via `mcp_set_session_grant` — see that
 *  command for why grants are keyed by `tabId` rather than `sessionId` (an
 *  SSH tab's underlying session can rebind across a reconnect while the tab
 *  itself persists). */
export interface AgentAccessEntry {
  tabId: number;
  sessionId: string;
  label: string;
}

export interface McpStatus {
  enabled: boolean;
  port: number;
  token: string | null;
  max_command_timeout_secs: number;
  auto_revoke_minutes: number;
}

interface AgentAccessState {
  entries: Record<number, AgentAccessEntry>;
  /** Whether the MCP bridge is currently running (Rust-side source of truth,
   *  mirrored here so the tab context menu / header badge don't each need
   *  their own `mcp_get_status` round-trip). */
  bridgeEnabled: boolean;
  setLocal: (tabId: number, entry: AgentAccessEntry | null) => void;
  setBridgeEnabledLocal: (enabled: boolean) => void;
  clearAllLocal: () => void;
}

export const useAgentAccessStore = create<AgentAccessState>((set) => ({
  entries: {},
  bridgeEnabled: false,
  setLocal: (tabId, entry) =>
    set((s) => {
      if (!entry) {
        const { [tabId]: _drop, ...rest } = s.entries;
        return { entries: rest };
      }
      return { entries: { ...s.entries, [tabId]: entry } };
    }),
  setBridgeEnabledLocal: (enabled) => set({ bridgeEnabled: enabled }),
  clearAllLocal: () => set({ entries: {} }),
}));

/** Grants or revokes MCP agent access for a tab: pushes the change to the
 *  Rust-side bridge (`mcp_set_session_grant`) and mirrors it locally so the
 *  tab context-menu checkbox and header badge can read it synchronously
 *  without round-tripping through Tauri on every render. `kind`/`hostId`/
 *  `localPtyId` only matter for a *grant* (Rust's revoke path ignores them)
 *  — callers that only ever revoke (the badge's revoke button, tab-close
 *  cleanup) can omit them and rely on the `"ssh"` default. Errors are
 *  reported here (not left to the caller) since most call sites fire this
 *  off with `void` rather than awaiting/catching it themselves. */
export async function setAgentAccessGrant(
  tabId: number,
  sessionId: string,
  granted: boolean,
  label: string,
  kind: "ssh" | "local" = "ssh",
  opts?: { hostId?: string; localPtyId?: number },
): Promise<void> {
  try {
    await invoke("mcp_set_session_grant", {
      tabId: String(tabId),
      sessionId,
      granted,
      label,
      kind,
      localPtyId: opts?.localPtyId ?? null,
      hostId: opts?.hostId ?? null,
    });
    useAgentAccessStore.getState().setLocal(tabId, granted ? { tabId, sessionId, label } : null);
  } catch (e) {
    handleApiError(e, granted ? "Failed to grant AI agent access" : "Failed to revoke AI agent access", "MCP");
  }
}

/** The single place that turns the MCP bridge on/off — used by both the
 *  Settings toggle and the search-driven `applySettingChange` path (see
 *  `SettingsApp.tsx`), so neither one can drift from the other. Starts/stops
 *  the actual Rust listener (`mcp_set_enabled`), persists the preference for
 *  next launch (`setMcpBridgeEnabled` in `settings/store.ts`), and — turning
 *  it off — revokes every currently-granted tab both server-side (Rust
 *  already clears its grants map) and in this local mirror, so the header
 *  badge/context-menu option disappear immediately rather than waiting on a
 *  stale local entry to be individually revoked. */
export async function applyMcpBridgeEnabled(enabled: boolean): Promise<McpStatus> {
  const status = await invoke<McpStatus>("mcp_set_enabled", { enabled });
  await persistMcpBridgeEnabled(enabled);
  useAgentAccessStore.getState().setBridgeEnabledLocal(enabled);
  if (!enabled) useAgentAccessStore.getState().clearAllLocal();
  return status;
}

/** Changes the bridge's listening port, restarting it immediately if
 *  currently enabled (see `mcp_set_port` on the Rust side) — used by both
 *  the Settings input and `applySettingChange`. */
export async function applyMcpPort(port: number): Promise<McpStatus> {
  const status = await invoke<McpStatus>("mcp_set_port", { port });
  await persistMcpBridgePort(port);
  return status;
}

export async function applyMcpMaxCommandTimeoutSecs(secs: number): Promise<void> {
  await invoke("mcp_set_max_command_timeout_secs", { secs });
  await persistMcpMaxCommandTimeoutSecs(secs);
}

export async function applyMcpAutoRevokeMinutes(minutes: number): Promise<void> {
  await invoke("mcp_set_auto_revoke_minutes", { minutes });
  await persistMcpAutoRevokeMinutes(minutes);
}
