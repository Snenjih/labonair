import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect } from "react";
import { handleApiError } from "@/lib/errors";
import { useHostsStore } from "@/modules/hosts/store/hostsStore";
import { useNotificationStore } from "@/modules/notifications/store/useNotificationStore";
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
 *  tools have no direct way to reach into frontend state — and re-syncs the
 *  bridge's Rust-side settings (which have no persistence of their own) from
 *  the frontend's preferences store on every change, including at hydrate. */
export function useMcpTabBridge(): void {
  const hydrated = usePreferencesStore((s) => s.hydrated);
  const persistedEnabled = usePreferencesStore((s) => s.mcpBridgeEnabled);
  const persistedPort = usePreferencesStore((s) => s.mcpBridgePort);
  const persistedMaxTimeout = usePreferencesStore((s) => s.mcpMaxCommandTimeoutSecs);
  const persistedAutoRevoke = usePreferencesStore((s) => s.mcpAutoRevokeMinutes);

  // Port/timeout/revoke are simple atomics on the Rust side with no
  // persistence of their own — each gets its own effect (rather than one
  // combined effect) so changing one doesn't also re-invoke `mcp_set_enabled`
  // and unnecessarily restart (disconnect) an already-running listener.
  useEffect(() => {
    if (!hydrated) return;
    invoke("mcp_set_port", { port: persistedPort }).catch((e) =>
      handleApiError(e, "Failed to set AI Agent Bridge port", "MCP"),
    );
  }, [hydrated, persistedPort]);

  useEffect(() => {
    if (!hydrated) return;
    invoke("mcp_set_max_command_timeout_secs", { secs: persistedMaxTimeout }).catch((e) =>
      handleApiError(e, "Failed to set AI Agent Bridge max command timeout", "MCP"),
    );
  }, [hydrated, persistedMaxTimeout]);

  useEffect(() => {
    if (!hydrated) return;
    invoke("mcp_set_auto_revoke_minutes", { minutes: persistedAutoRevoke }).catch((e) =>
      handleApiError(e, "Failed to set AI Agent Bridge auto-revoke timeout", "MCP"),
    );
  }, [hydrated, persistedAutoRevoke]);

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
  useEffect(() => {
    if (!hydrated) return;
    invoke<McpStatus>("mcp_set_enabled", { enabled: persistedEnabled })
      .then((status) => {
        useAgentAccessStore.getState().setBridgeEnabledLocal(status.enabled);
        if (!status.enabled) useAgentAccessStore.getState().clearAllLocal();
      })
      .catch((e) => handleApiError(e, "Failed to enable/disable AI Agent Bridge", "MCP"));
  }, [hydrated, persistedEnabled]);

  useEffect(() => {
    let disposed = false;
    const cleanups: (() => void)[] = [];

    (async () => {
      const [unlistenOpen, unlistenClose, unlistenExpired, unlistenServerError, unlistenActivity] =
        await Promise.all([
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
            void setAgentAccessGrant(tabId, sessionId, true, host.name, "ssh", { hostId: host.id }).then(() => {
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
          // Auto-revoke sweep (Rust) or a host's "Block AI Agent Access"
          // flag being turned on both revoke server-side and notify via this
          // event — clear the local mirror so the badge/checkbox catch up
          // without the user having to notice on their own.
          listen<{ tab_id: string }>("mcp_grant_expired", ({ payload }) => {
            useAgentAccessStore.getState().setLocal(Number(payload.tab_id), null);
          }),
          // Genuine bridge failure (e.g. port already in use) — Rust already
          // rolled `enabled` back to false; mirror that and surface it like
          // any other async error in the app.
          listen<{ message: string }>("mcp_server_error", ({ payload }) => {
            useAgentAccessStore.getState().setBridgeEnabledLocal(false);
            handleApiError(payload.message, "AI Agent Bridge failed to start", "MCP");
          }),
          // Opt-in activity log (Phase B) — deliberately separate from error
          // notifications above: this is direct `addNotification`, never
          // `handleApiError`, and gated on its own preference here (Rust
          // always emits regardless, keeping the filtering decision purely
          // frontend-side).
          listen<{ label: string; action: string; detail: string }>("mcp_activity", ({ payload }) => {
            if (!usePreferencesStore.getState().mcpNotifyOnActivity) return;
            useNotificationStore.getState().addNotification({
              type: "info",
              title: `Agent: ${payload.action} — ${payload.label}`,
              message: payload.detail,
              source: "MCP",
            });
          }),
        ]);
      if (disposed) {
        unlistenOpen();
        unlistenClose();
        unlistenExpired();
        unlistenServerError();
        unlistenActivity();
        return;
      }
      cleanups.push(unlistenOpen, unlistenClose, unlistenExpired, unlistenServerError, unlistenActivity);
    })();

    return () => {
      disposed = true;
      for (const fn of cleanups) fn();
    };
  }, []);
}
