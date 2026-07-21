import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";

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

interface AgentAccessState {
  entries: Record<number, AgentAccessEntry>;
  setLocal: (tabId: number, entry: AgentAccessEntry | null) => void;
}

export const useAgentAccessStore = create<AgentAccessState>((set) => ({
  entries: {},
  setLocal: (tabId, entry) =>
    set((s) => {
      if (!entry) {
        const { [tabId]: _drop, ...rest } = s.entries;
        return { entries: rest };
      }
      return { entries: { ...s.entries, [tabId]: entry } };
    }),
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
