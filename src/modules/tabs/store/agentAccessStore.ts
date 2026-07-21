import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import { setMcpBridgeEnabled as persistMcpBridgeEnabled } from "@/modules/settings/store";

/** One SSH tab the user has explicitly granted MCP agent access to. Mirrors
 *  (client-side, for instant UI reads) whatever was last pushed to the Rust
 *  `McpState.grants` map via `mcp_set_session_grant` — see that command for
 *  why grants are keyed by `tabId` rather than `sessionId` (a tab's
 *  underlying SSH session can rebind across a reconnect while the tab itself
 *  persists). */
export interface AgentAccessEntry {
  tabId: number;
  sessionId: string;
  label: string;
}

export interface McpStatus {
  enabled: boolean;
  port: number;
  token: string | null;
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
 *  without round-tripping through Tauri on every render. */
export async function setAgentAccessGrant(
  tabId: number,
  sessionId: string,
  granted: boolean,
  label: string,
): Promise<void> {
  await invoke("mcp_set_session_grant", { tabId: String(tabId), sessionId, granted, label });
  useAgentAccessStore.getState().setLocal(tabId, granted ? { tabId, sessionId, label } : null);
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
