import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect } from "react";
import { useHostsStore } from "@/modules/hosts/store/hostsStore";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { setAgentAccessGrant, type McpStatus, useAgentAccessStore } from "../store/agentAccessStore";
import { useTabsStore } from "../store/tabsStore";
import type { WorkspaceTab } from "../types";

interface TabOpResult {
  ok: boolean;
  session_id?: string;
  tab_id?: string;
  error?: string;
}

/** Completes a pending MCP `open_tab`/`close_tab` tool call (see
 *  `src-tauri/src/modules/mcp/server.rs`) — the Rust side has no way to
 *  create or close a tab itself (tabs are pure frontend/Zustand state), so it
 *  emits a request event and awaits this response on a oneshot channel,
 *  mirroring the existing `known_hosts_warning`/`ssh_trust_host` pattern. */
function respond(requestId: string, result: TabOpResult): void {
  void invoke("mcp_tab_op_response", { requestId, result });
}

/** Mounted once at the app root (see `App.tsx`). Bridges the Rust MCP
 *  server's `open_tab`/`close_tab` tools to the actual tab store, since those
 *  tools have no direct way to reach into frontend state. */
export function useMcpTabBridge(): void {
  // The Rust `McpState` always boots disabled (it has no persistence of its
  // own) — mirror the persisted preference here on every change, not just
  // once at boot. Settings runs in its own webview with its own
  // `useAgentAccessStore` instance, so `applyMcpBridgeEnabled` toggling the
  // bridge there only ever updates *that* window's local `bridgeEnabled`
  // flag — it never reaches this (main) window, which is what the tab
  // context menu's "Grant AI Agent Access" item and the header badge
  // actually read. This effect is what keeps this window's local flag (and
  // therefore that menu item) in sync, driven by
  // `usePreferencesStore.mcpBridgeEnabled`, which IS correctly synced
  // cross-window (see `onPreferencesChange` in `settings/store.ts`).
  // Re-invoking `mcp_set_enabled` here is harmless even when this window's
  // state was already correct — it's idempotent on the Rust side.
  const hydrated = usePreferencesStore((s) => s.hydrated);
  const persistedEnabled = usePreferencesStore((s) => s.mcpBridgeEnabled);
  useEffect(() => {
    if (!hydrated) return;
    void invoke<McpStatus>("mcp_set_enabled", { enabled: persistedEnabled }).then((status) => {
      useAgentAccessStore.getState().setBridgeEnabledLocal(status.enabled);
      if (!status.enabled) useAgentAccessStore.getState().clearAllLocal();
    });
  }, [hydrated, persistedEnabled]);

  useEffect(() => {
    let disposed = false;
    const cleanups: (() => void)[] = [];

    (async () => {
      const [unlistenOpen, unlistenClose] = await Promise.all([
        listen<{ request_id: string; host_id: string }>("mcp_open_tab_request", ({ payload }) => {
          const host = useHostsStore.getState().hosts.find((h) => h.id === payload.host_id);
          if (!host) {
            respond(payload.request_id, { ok: false, error: `host '${payload.host_id}' not found` });
            return;
          }
          const tabId = useTabsStore.getState().newSshTab(host.id, host.name);
          const tab = useTabsStore.getState().tabs.find((t) => t.id === tabId) as WorkspaceTab | undefined;
          const sessionId = tab?.activePaneId;
          if (!sessionId) {
            respond(payload.request_id, { ok: false, error: "failed to create tab" });
            return;
          }
          // Auto-grant: the agent explicitly asked to open this tab for its
          // own use, so it starts out already accessible — the user can
          // revoke it any time via the same toggle/badge as any other tab.
          void setAgentAccessGrant(tabId, sessionId, true, host.name).then(() => {
            respond(payload.request_id, { ok: true, session_id: sessionId, tab_id: String(tabId) });
          });
        }),
        listen<{ request_id: string; session_id: string }>("mcp_close_tab_request", ({ payload }) => {
          const tabs = useTabsStore.getState().tabs;
          const tab = tabs.find(
            (t) => t.kind === "workspace" && Object.values(t.sessions).some((s) => s.id === payload.session_id),
          );
          if (!tab) {
            respond(payload.request_id, { ok: false, error: "no tab found for that session_id" });
            return;
          }
          useTabsStore.getState().closeTab(tab.id);
          const stillOpen = useTabsStore.getState().tabs.some((t) => t.id === tab.id);
          if (stillOpen) {
            respond(payload.request_id, {
              ok: false,
              error: "tab could not be closed (it may be the last remaining tab)",
            });
            return;
          }
          respond(payload.request_id, { ok: true });
        }),
      ]);
      if (disposed) {
        unlistenOpen();
        unlistenClose();
        return;
      }
      cleanups.push(unlistenOpen, unlistenClose);
    })();

    return () => {
      disposed = true;
      for (const fn of cleanups) fn();
    };
  }, []);
}
