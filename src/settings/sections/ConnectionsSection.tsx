import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { handleApiError } from "@/lib/errors";
import { usePreferencesStore } from "@/modules/settings/preferences";
import {
  applyMcpAutoRevokeMinutes,
  applyMcpBridgeEnabled,
  applyMcpMaxCommandTimeoutSecs,
  applyMcpPort,
  type McpStatus,
  useAgentAccessStore,
} from "@/modules/tabs";
import {
  setExplorerAutoReconnect,
  setExplorerIdleSessionTimeoutMin,
  setExplorerMaxCachedRemoteScopes,
  setExplorerMaxIdleSessions,
  setExplorerRemotePollInterval,
  setHostPingInterval,
  setMcpNotifyOnActivity,
  setSshAutoReconnect,
  setSshAutoReconnectDelay,
  setSshAutoReconnectMaxAttempts,
  setSshConnectTimeoutSecs,
} from "@/modules/settings/store";
import { NumInput } from "../components/NumInput";
import { SectionHeader } from "../components/SectionHeader";
import { SettingRow } from "../components/SettingRow";

const PING_INTERVAL_OPTIONS: { value: string; label: string }[] = [
  { value: "10", label: "Every 10 seconds" },
  { value: "30", label: "Every 30 seconds" },
  { value: "60", label: "Every minute" },
  { value: "120", label: "Every 2 minutes" },
  { value: "300", label: "Every 5 minutes" },
  { value: "0", label: "Never" },
];

function SubSectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="text-sm font-semibold tracking-tight text-foreground">{children}</h3>;
}

function SectionDivider() {
  return <div className="border-t border-border/40" />;
}

/** Settings for the local MCP bridge (`src-tauri/src/modules/mcp/`) that lets
 *  an external agent (e.g. a locally installed `claude` CLI) drive SSH tabs
 *  the user has explicitly granted access to via the tab context menu /
 *  header badge — see `agentAccessStore.ts`. The enabled flag is shared
 *  process-wide via `useAgentAccessStore.bridgeEnabled` (so the tab context
 *  menu and header badge react to it too, not just this settings page); port
 *  and token are Rust-side-only detail this section fetches for itself. */
function AgentBridgeSection() {
  const bridgeEnabled = useAgentAccessStore((s) => s.bridgeEnabled);
  const maxCommandTimeoutSecs = usePreferencesStore((s) => s.mcpMaxCommandTimeoutSecs);
  const autoRevokeMinutes = usePreferencesStore((s) => s.mcpAutoRevokeMinutes);
  const notifyOnActivity = usePreferencesStore((s) => s.mcpNotifyOnActivity);
  const [port, setPort] = useState<number | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    invoke<McpStatus>("mcp_get_status")
      .then((status) => {
        useAgentAccessStore.getState().setBridgeEnabledLocal(status.enabled);
        setPort(status.port);
        setToken(status.token);
      })
      .catch((e) => handleApiError(e, "Failed to load AI Agent Bridge status", "MCP"));
  }, []);

  const setupCommand =
    token && bridgeEnabled && port
      ? `claude mcp add --transport http labonair http://127.0.0.1:${port}/mcp --header "Authorization: Bearer ${token}" --scope user`
      : null;

  const handleToggle = async (enabled: boolean) => {
    try {
      const status = await applyMcpBridgeEnabled(enabled);
      setPort(status.port);
      setToken(status.token);
    } catch (e) {
      handleApiError(e, "Failed to enable/disable AI Agent Bridge", "MCP");
    }
  };

  const handlePortChange = async (value: number) => {
    try {
      const status = await applyMcpPort(value);
      setPort(status.port);
      setToken(status.token);
    } catch (e) {
      handleApiError(e, "Failed to change AI Agent Bridge port", "MCP");
    }
  };

  const handleRegenerate = async () => {
    try {
      const status = await invoke<McpStatus>("mcp_regenerate_token");
      setPort(status.port);
      setToken(status.token);
    } catch (e) {
      handleApiError(e, "Failed to regenerate AI Agent Bridge token", "MCP");
    }
  };

  const handleCopy = async () => {
    if (!setupCommand) return;
    try {
      await navigator.clipboard.writeText(setupCommand);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      handleApiError(e, "Failed to copy setup command", "MCP");
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <SubSectionTitle>AI Agent Bridge (MCP)</SubSectionTitle>
      <div className="flex flex-col gap-2">
        <SettingRow
          title="Enable agent bridge"
          description="Lets an external agent you run locally (e.g. the claude CLI) list and run commands in SSH or local tabs you explicitly grant it access to — visibly, in the real terminal pane. Off by default; each tab must also be individually granted via its context menu. Turning this off immediately revokes every granted tab."
        >
          <Switch checked={bridgeEnabled} onCheckedChange={(v) => void handleToggle(v)} />
        </SettingRow>
        {bridgeEnabled && (
          <>
            <SettingRow title="Port" description="Local port the bridge listens on (1024–65535).">
              <NumInput
                value={port ?? 47823}
                min={1024}
                max={65535}
                step={1}
                onChange={(v) => void handlePortChange(v)}
              />
            </SettingRow>
            <SettingRow
              title="Max command timeout (s)"
              description="Upper bound on how long a single agent-run command may block before returning still_running, regardless of what the agent requests."
            >
              <NumInput
                value={maxCommandTimeoutSecs}
                min={5}
                max={3600}
                step={5}
                onChange={(v) =>
                  void applyMcpMaxCommandTimeoutSecs(v).catch((e) =>
                    handleApiError(e, "Failed to change max command timeout", "MCP"),
                  )
                }
              />
            </SettingRow>
            <SettingRow
              title="Auto-revoke after inactivity (min)"
              description="Automatically revoke a granted tab after this many minutes of no agent activity. 0 disables auto-revoke."
            >
              <NumInput
                value={autoRevokeMinutes}
                min={0}
                max={1440}
                step={5}
                onChange={(v) =>
                  void applyMcpAutoRevokeMinutes(v).catch((e) =>
                    handleApiError(e, "Failed to change auto-revoke timeout", "MCP"),
                  )
                }
              />
            </SettingRow>
            <SettingRow
              title="Notify on agent activity"
              description="Show a notification every time the agent runs a command, sends keys, or opens/closes a tab — separate from error notifications, which are always on."
            >
              <Switch checked={notifyOnActivity} onCheckedChange={(v) => void setMcpNotifyOnActivity(v)} />
            </SettingRow>
          </>
        )}
        {bridgeEnabled && setupCommand && (
          <SettingRow
            title="Setup command"
            description="Run this once in your terminal to connect your local claude CLI to this bridge. Regenerating the token invalidates any previously configured setup."
          >
            <div className="flex flex-col gap-1.5 w-full">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground">claude mcp add …</span>
                <button
                  onClick={() => void handleCopy()}
                  className="text-[11px] text-primary hover:underline"
                >
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
              <textarea
                readOnly
                value={setupCommand}
                rows={2}
                className="w-full rounded-md border border-input bg-muted px-3 py-2 text-[11px] font-mono text-muted-foreground resize-none"
              />
              <button
                onClick={() => void handleRegenerate()}
                className="self-start text-[11px] text-muted-foreground hover:text-destructive hover:underline"
              >
                Regenerate token
              </button>
            </div>
          </SettingRow>
        )}
      </div>
    </div>
  );
}

export function ConnectionsSection() {
  const hostPingInterval = usePreferencesStore((s) => s.hostPingInterval);

  const sshAutoReconnect = usePreferencesStore((s) => s.sshAutoReconnect);
  const sshAutoReconnectDelay = usePreferencesStore((s) => s.sshAutoReconnectDelay);
  const sshAutoReconnectMaxAttempts = usePreferencesStore((s) => s.sshAutoReconnectMaxAttempts);
  const sshConnectTimeoutSecs = usePreferencesStore((s) => s.sshConnectTimeoutSecs);

  const explorerRemotePollInterval = usePreferencesStore((s) => s.explorerRemotePollInterval);
  const explorerAutoReconnect = usePreferencesStore((s) => s.explorerAutoReconnect);
  const explorerIdleSessionTimeoutMin = usePreferencesStore((s) => s.explorerIdleSessionTimeoutMin);
  const explorerMaxIdleSessions = usePreferencesStore((s) => s.explorerMaxIdleSessions);
  const explorerMaxCachedRemoteScopes = usePreferencesStore((s) => s.explorerMaxCachedRemoteScopes);

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title="Connections"
        description="How Labonair manages remote hosts — availability checks, SSH terminal sessions, and the sidebar's remote file browsing sessions."
      />

      {/* Host Availability */}
      <div className="flex flex-col gap-4">
        <SubSectionTitle>Host Availability</SubSectionTitle>
        <SettingRow
          title="Ping interval"
          description="How often to check whether each host is reachable. Set to Never to disable availability checks."
        >
          <Select value={String(hostPingInterval)} onValueChange={(v) => void setHostPingInterval(Number(v))}>
            <SelectTrigger className="h-7 w-44 text-[11.5px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PING_INTERVAL_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value} className="text-[11.5px]">
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingRow>
      </div>

      <SectionDivider />

      {/* SSH Terminal Sessions */}
      <div className="flex flex-col gap-4">
        <SubSectionTitle>SSH Terminal Sessions</SubSectionTitle>
        <div className="flex flex-col gap-2">
          <SettingRow
            title="Connect timeout (s)"
            description="How long to wait for the initial TCP connection before giving up (3–60 s)."
          >
            <NumInput
              value={sshConnectTimeoutSecs}
              min={3}
              max={60}
              step={1}
              onChange={(v) => void setSshConnectTimeoutSecs(v)}
            />
          </SettingRow>
          <SettingRow
            title="Auto-reconnect SSH sessions"
            description="Automatically retry when an SSH connection is lost unexpectedly."
          >
            <Switch checked={sshAutoReconnect} onCheckedChange={(v) => void setSshAutoReconnect(v)} />
          </SettingRow>
          {sshAutoReconnect && (
            <>
              <SettingRow
                title="Reconnect delay (s)"
                description="Seconds to wait before the first reconnect attempt (1–30)."
              >
                <NumInput
                  value={sshAutoReconnectDelay}
                  min={1}
                  max={30}
                  step={1}
                  onChange={(v) => void setSshAutoReconnectDelay(v)}
                />
              </SettingRow>
              <SettingRow
                title="Max reconnect attempts"
                description="Give up after this many failed attempts (1–10)."
              >
                <NumInput
                  value={sshAutoReconnectMaxAttempts}
                  min={1}
                  max={10}
                  step={1}
                  onChange={(v) => void setSshAutoReconnectMaxAttempts(v)}
                />
              </SettingRow>
            </>
          )}
        </div>
      </div>

      <SectionDivider />

      {/* Remote File Browsing (Explorer/SFTP) */}
      <div className="flex flex-col gap-4">
        <SubSectionTitle>Remote File Browsing (Explorer/SFTP)</SubSectionTitle>
        <div className="flex flex-col gap-2">
          <SettingRow
            title="Explorer: Remote refresh interval"
            description="How often the sidebar file tree re-polls an SSH host's expanded folders for changes (SFTP has no live watch)."
          >
            <Select
              value={String(explorerRemotePollInterval)}
              onValueChange={(v) => void setExplorerRemotePollInterval(Number(v))}
            >
              <SelectTrigger className="h-7 w-36 text-[11.5px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="10" className="text-[11.5px]">
                  Every 10 seconds
                </SelectItem>
                <SelectItem value="20" className="text-[11.5px]">
                  Every 20 seconds
                </SelectItem>
                <SelectItem value="30" className="text-[11.5px]">
                  Every 30 seconds
                </SelectItem>
                <SelectItem value="60" className="text-[11.5px]">
                  Every minute
                </SelectItem>
                <SelectItem value="0" className="text-[11.5px]">
                  Never
                </SelectItem>
              </SelectContent>
            </Select>
          </SettingRow>
          <SettingRow
            title="Explorer: Auto-reconnect remote sessions"
            description="Automatically retry the sidebar's SSH browsing connection when it drops unexpectedly, using the SSH reconnect delay/attempts above."
          >
            <Switch
              checked={explorerAutoReconnect}
              onCheckedChange={(v) => void setExplorerAutoReconnect(v)}
            />
          </SettingRow>
          <SettingRow
            title="Explorer: Idle session timeout (min)"
            description="Disconnect a background SSH browsing session after it has had no active viewer for this many minutes (1–30)."
          >
            <NumInput
              value={explorerIdleSessionTimeoutMin}
              min={1}
              max={30}
              step={1}
              onChange={(v) => void setExplorerIdleSessionTimeoutMin(v)}
            />
          </SettingRow>
          <SettingRow
            title="Explorer: Max cached remote sessions"
            description="How many idle SSH browsing connections the sidebar keeps warm before disconnecting the oldest (1–10)."
          >
            <NumInput
              value={explorerMaxIdleSessions}
              min={1}
              max={10}
              step={1}
              onChange={(v) => void setExplorerMaxIdleSessions(v)}
            />
          </SettingRow>
          <SettingRow
            title="Explorer: Max cached remote folders"
            description="How many recently-viewed SSH host directory trees the sidebar keeps in memory for instant tab-switching (1–20). Hosts with a currently open tab are always kept regardless of this number."
          >
            <NumInput
              value={explorerMaxCachedRemoteScopes}
              min={1}
              max={20}
              step={1}
              onChange={(v) => void setExplorerMaxCachedRemoteScopes(v)}
            />
          </SettingRow>
        </div>
      </div>

      <SectionDivider />

      <AgentBridgeSection />
    </div>
  );
}
