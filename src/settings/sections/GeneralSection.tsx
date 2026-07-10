import appIcon from "@/assets/app-icon.png";
import { handleApiError } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePreferencesStore } from "@/modules/settings/preferences";
import {
  setAutostart,
  setCheckForUpdates,
  setCredentialEncryption,
  setDefaultStartupTab,
  setHostPingInterval,
  setRestoreWindowState,
  setSessionRestore,
  setSessionScrollbackLines,
  setStartupTerminalCount,
  setVimMode,
  setReduceMotion,
  setNewTabInheritsCwd,
  setConfirmCloseTerminalTab,
  setConfirmQuitWithSsh,
  setNotifyOnErrors,
} from "@/modules/settings/store";
import { useUpdater } from "@/modules/updater";
import { AlertDiamondIcon, GithubIcon, Globe02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { getName, getVersion } from "@tauri-apps/api/app";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { arch, platform } from "@tauri-apps/plugin-os";
import { useEffect, useState } from "react";
import { SectionHeader } from "../components/SectionHeader";
import { SettingRow } from "../components/SettingRow";

const REPO_URL = "https://github.com/Snenjih/labonair";
const WEBSITE = "https://labonair.app";

const PLATFORM_LABEL: Record<string, string> = {
  macos: "macOS",
  windows: "Windows",
  linux: "Linux",
  ios: "iOS",
  android: "Android",
  freebsd: "FreeBSD",
};

const PING_INTERVAL_OPTIONS: { value: string; label: string }[] = [
  { value: "10", label: "Every 10 seconds" },
  { value: "30", label: "Every 30 seconds" },
  { value: "60", label: "Every minute" },
  { value: "120", label: "Every 2 minutes" },
  { value: "300", label: "Every 5 minutes" },
  { value: "0", label: "Never" },
];

const LINKS: {
  icon: typeof AlertDiamondIcon;
  label: string;
  description: string;
  href: string;
}[] = [
  {
    icon: AlertDiamondIcon,
    label: "Report a problem",
    description: "Generate a pre-filled GitHub issue",
    href: `${REPO_URL}/issues/new?template=bug_report.yml`,
  },
  {
    icon: GithubIcon,
    label: "GitHub",
    description: "Source code",
    href: REPO_URL,
  },
  {
    icon: Globe02Icon,
    label: "Website",
    description: WEBSITE.replace("https://", ""),
    href: WEBSITE,
  },
];

export function GeneralSection() {
  const [version, setVersion] = useState("");
  const [name, setName] = useState("Labonair");
  const [build, setBuild] = useState("");
  const [pendingEncryption, setPendingEncryption] = useState(false);

  const autostart = usePreferencesStore((s) => s.autostart);
  const restoreWindowState = usePreferencesStore((s) => s.restoreWindowState);
  const sessionRestore = usePreferencesStore((s) => s.sessionRestore);
  const sessionScrollbackLines = usePreferencesStore((s) => s.sessionScrollbackLines);
  const vimMode = usePreferencesStore((s) => s.vimMode);
  const checkForUpdates = usePreferencesStore((s) => s.checkForUpdates);
  const defaultStartupTab = usePreferencesStore((s) => s.defaultStartupTab);
  const startupTerminalCount = usePreferencesStore((s) => s.startupTerminalCount);
  const hostPingInterval = usePreferencesStore((s) => s.hostPingInterval);
  const credentialEncryption = usePreferencesStore((s) => s.credentialEncryption);
  const reduceMotion = usePreferencesStore((s) => s.reduceMotion);
  const newTabInheritsCwd = usePreferencesStore((s) => s.newTabInheritsCwd);
  const confirmCloseTerminalTab = usePreferencesStore((s) => s.confirmCloseTerminalTab);
  const confirmQuitWithSsh = usePreferencesStore((s) => s.confirmQuitWithSsh);
  const notifyOnErrors = usePreferencesStore((s) => s.notifyOnErrors);

  const { status, check, install } = useUpdater({ autoCheck: false });
  const checking = status.kind === "checking";
  const downloading = status.kind === "downloading";
  const available = status.kind === "available";
  const ready = status.kind === "ready";
  const checkLabel =
    status.kind === "uptodate"
      ? "You're up to date"
      : status.kind === "error"
        ? "Check failed — retry"
        : checking
          ? "Checking…"
          : downloading
            ? "Downloading…"
            : ready
              ? "Restart to install"
              : available
                ? `Install v${status.update.version}`
                : "Check for updates";

  const onUpdateClick = () => {
    if (available) void install();
    else void check({ manual: true });
  };

  useEffect(() => {
    void getVersion().then(setVersion);
    void getName().then(setName);
    try {
      const p = platform();
      const a = arch();
      const platformLabel = PLATFORM_LABEL[p] ?? p;
      setBuild(`${platformLabel} · ${a}`);
    } catch {
      setBuild("");
    }
  }, []);

  // Reconcile autostart pref with the actual OS state on mount.
  useEffect(() => {
    let alive = true;
    void isEnabled()
      .then((on) => {
        if (!alive) return;
        if (on !== usePreferencesStore.getState().autostart) {
          void setAutostart(on);
        }
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const onToggleAutostart = async (next: boolean) => {
    try {
      if (next) await enable();
      else await disable();
      await setAutostart(next);
    } catch (e) {
      handleApiError(e, "Could not toggle autostart", "Settings");
    }
  };

  async function handleEncryptionToggle(enabled: boolean) {
    setPendingEncryption(true);
    try {
      await invoke("secrets_set_encryption_enabled", { enabled });
      await setCredentialEncryption(enabled);
    } catch (err) {
      handleApiError(err, "Could not toggle credential encryption", "Settings");
    } finally {
      setPendingEncryption(false);
    }
  }

  const buildString = build ? `${build} · v${version || "—"}` : `v${version || "—"}`;

  return (
    <div className="flex flex-col gap-[var(--ui-section-gap)]">
      <SectionHeader title="General" description="Editor, startup, and security." />

      {/* About hero */}
      <div className="flex items-start gap-8 rounded-xl border border-border/60 bg-card/40 px-5 py-5">
        {/* Left: identity + updater */}
        <div className="flex flex-1 flex-col gap-3">
          <div className="flex items-center gap-3">
            <img src={appIcon} alt="" className="size-14" draggable={false} />
            <div className="flex flex-col">
              <span className="text-[21px] font-semibold tracking-tight leading-tight">{name}</span>
              <span className="font-mono text-[10.5px] text-muted-foreground mt-0.5">{buildString}</span>
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <Button
              size="sm"
              onClick={onUpdateClick}
              disabled={checking || downloading || ready}
              className="w-fit"
            >
              {checkLabel}
            </Button>
            {status.kind === "error" && (
              <p className="font-mono text-[10.5px] break-all text-destructive/80">{status.message}</p>
            )}
            {downloading && status.contentLength ? (
              <p className="text-[11px] text-muted-foreground">
                {Math.min(100, Math.round((status.downloaded / status.contentLength) * 100))}%
              </p>
            ) : null}
          </div>
        </div>

        {/* Right: links */}
        <div className="flex flex-col gap-0.5">
          {LINKS.map((link) => (
            <button
              key={link.href}
              type="button"
              onClick={() => void openUrl(link.href)}
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-accent/50"
            >
              <HugeiconsIcon
                icon={link.icon}
                size={16}
                strokeWidth={1.75}
                className="shrink-0 text-muted-foreground"
              />
              <div className="flex flex-col">
                <span className="text-[12px] font-medium leading-tight">{link.label}</span>
                <span className="text-[10.5px] text-muted-foreground leading-tight">{link.description}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Editor</Label>
        <SettingRow title="Vim mode" description="Enable Vim keybindings in the code editor.">
          <Switch checked={vimMode} onCheckedChange={(v) => void setVimMode(v)} />
        </SettingRow>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Startup</Label>
        <div className="flex flex-col gap-2">
          <SettingRow title="Launch at login" description="Open Labonair automatically when you sign in.">
            <Switch checked={autostart} onCheckedChange={(v) => void onToggleAutostart(v)} />
          </SettingRow>
          <SettingRow
            title="Restore window position & size"
            description="Reopen the main window where you left it. Applies on next launch."
          >
            <Switch checked={restoreWindowState} onCheckedChange={(v) => void setRestoreWindowState(v)} />
          </SettingRow>
          <SettingRow
            title="Session restore"
            description="Reopen all tabs, SSH connections, SFTP paths, and editor files on the next launch. Periodically auto-saved."
          >
            <Switch checked={sessionRestore} onCheckedChange={(v) => void setSessionRestore(v)} />
          </SettingRow>
          {sessionRestore && (
            <SettingRow
              title="Scrollback history"
              description="How many lines of terminal output to save and restore per session."
            >
              <Select
                value={String(sessionScrollbackLines)}
                onValueChange={(v) => void setSessionScrollbackLines(Number(v))}
              >
                <SelectTrigger className="h-7 w-36 text-[11.5px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="200">200 lines</SelectItem>
                  <SelectItem value="500">500 lines</SelectItem>
                  <SelectItem value="1000">1 000 lines</SelectItem>
                  <SelectItem value="2000">2 000 lines</SelectItem>
                  <SelectItem value="5000">5 000 lines</SelectItem>
                  <SelectItem value="0">Full scrollback</SelectItem>
                </SelectContent>
              </Select>
            </SettingRow>
          )}
          <SettingRow
            title="Check for updates on launch"
            description="Show an update button in the titlebar when a new version is available."
          >
            <Switch checked={checkForUpdates} onCheckedChange={(v) => void setCheckForUpdates(v)} />
          </SettingRow>
          <SettingRow
            title="Default opening tab"
            description="Which tab opens when Labonair launches. Takes effect on next launch."
          >
            <Select
              value={defaultStartupTab}
              onValueChange={(v) => void setDefaultStartupTab(v as "terminal" | "host-manager")}
            >
              <SelectTrigger className="h-7 w-40 text-[11.5px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="host-manager">Host Manager</SelectItem>
                <SelectItem value="terminal">Local Terminal</SelectItem>
              </SelectContent>
            </Select>
          </SettingRow>
          {defaultStartupTab === "terminal" && (
            <SettingRow
              title="Startup terminal count"
              description="How many terminal tabs to open on launch. Takes effect on next launch."
            >
              <Select
                value={String(startupTerminalCount)}
                onValueChange={(v) => void setStartupTerminalCount(Number(v) as 1 | 2 | 3)}
              >
                <SelectTrigger className="h-7 w-20 text-[11.5px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 tab</SelectItem>
                  <SelectItem value="2">2 tabs</SelectItem>
                  <SelectItem value="3">3 tabs</SelectItem>
                </SelectContent>
              </Select>
            </SettingRow>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Host Manager</Label>
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

      <div className="flex flex-col gap-2">
        <Label>Security</Label>
        <SettingRow
          title="Encrypt stored credentials"
          description="Credentials are encrypted on disk using an app-managed AES-256-GCM key. No master password required — encryption and decryption happen automatically."
        >
          <Switch
            checked={credentialEncryption}
            onCheckedChange={handleEncryptionToggle}
            disabled={pendingEncryption}
          />
        </SettingRow>
        <SettingRow
          title="Confirm quit with active SSH connections"
          description="Show a confirmation dialog before closing the app when SSH sessions are open."
        >
          <Switch checked={confirmQuitWithSsh} onCheckedChange={(v) => void setConfirmQuitWithSsh(v)} />
        </SettingRow>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Tabs</Label>
        <SettingRow
          title="New tab inherits current directory"
          description="Open new terminal tabs in the working directory of the active tab instead of the home directory."
        >
          <Switch checked={newTabInheritsCwd} onCheckedChange={(v) => void setNewTabInheritsCwd(v)} />
        </SettingRow>
        <SettingRow
          title="Confirm before closing terminal tab"
          description="Show a confirmation dialog when closing a terminal tab with a running shell."
        >
          <Switch
            checked={confirmCloseTerminalTab}
            onCheckedChange={(v) => void setConfirmCloseTerminalTab(v)}
          />
        </SettingRow>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Accessibility</Label>
        <SettingRow
          title="Reduce motion"
          description="Disable all UI animations. Useful for motion sensitivity or older hardware."
        >
          <Switch checked={reduceMotion} onCheckedChange={(v) => void setReduceMotion(v)} />
        </SettingRow>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Notifications</Label>
        <SettingRow
          title="Notify on errors"
          description="Show a notification whenever an error occurs. Disabled by default."
        >
          <Switch checked={notifyOnErrors} onCheckedChange={(v) => void setNotifyOnErrors(v)} />
        </SettingRow>
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <span className="text-[11px] font-medium tracking-tight text-muted-foreground">{children}</span>;
}
