import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { usePreferencesStore } from "@/modules/settings/preferences";
import {
  setSftpShowHiddenFiles,
  setSftpShowUpFolder,
  setExplorerShowHiddenByDefault,
  setSftpColumnSize,
  setSftpColumnModified,
  setSftpColumnPermissions,
  setSftpColumnType,
  setExplorerRemotePollInterval,
  setExplorerAutoReconnect,
  setExplorerIdleSessionTimeoutMin,
  setExplorerMaxIdleSessions,
  setExplorerMaxCachedRemoteScopes,
  setSftpRemoteEditShowTransfers,
  setSftpMaxRemoteFileSizeMb,
  setSftpMaxConcurrentTransfers,
  setSftpDefaultConflictResolution,
  setSftpChunkSizeKb,
  setGitStatusPollIntervalMs,
} from "@/modules/settings/store";
import { NumInput } from "../components/NumInput";
import { SectionHeader } from "../components/SectionHeader";
import { SettingRow } from "../components/SettingRow";

export function FileManagerSection() {
  const sftpShowHiddenFiles = usePreferencesStore((s) => s.sftpShowHiddenFiles);
  const sftpShowUpFolder = usePreferencesStore((s) => s.sftpShowUpFolder);
  const explorerShowHiddenByDefault = usePreferencesStore((s) => s.explorerShowHiddenByDefault);

  const sftpColumnSize = usePreferencesStore((s) => s.sftpColumnSize);
  const sftpColumnModified = usePreferencesStore((s) => s.sftpColumnModified);
  const sftpColumnPermissions = usePreferencesStore((s) => s.sftpColumnPermissions);
  const sftpColumnType = usePreferencesStore((s) => s.sftpColumnType);

  const explorerRemotePollInterval = usePreferencesStore((s) => s.explorerRemotePollInterval);
  const explorerAutoReconnect = usePreferencesStore((s) => s.explorerAutoReconnect);
  const explorerIdleSessionTimeoutMin = usePreferencesStore((s) => s.explorerIdleSessionTimeoutMin);
  const explorerMaxIdleSessions = usePreferencesStore((s) => s.explorerMaxIdleSessions);
  const explorerMaxCachedRemoteScopes = usePreferencesStore((s) => s.explorerMaxCachedRemoteScopes);

  const sftpRemoteEditShowTransfers = usePreferencesStore((s) => s.sftpRemoteEditShowTransfers);
  const sftpMaxRemoteFileSizeMb = usePreferencesStore((s) => s.sftpMaxRemoteFileSizeMb);

  const sftpMaxConcurrentTransfers = usePreferencesStore((s) => s.sftpMaxConcurrentTransfers);
  const sftpDefaultConflictResolution = usePreferencesStore((s) => s.sftpDefaultConflictResolution);
  const sftpChunkSizeKb = usePreferencesStore((s) => s.sftpChunkSizeKb);

  const gitStatusPollIntervalMs = usePreferencesStore((s) => s.gitStatusPollIntervalMs);

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title="File Manager"
        description="File browsing, remote sessions, and transfer settings for SFTP and the sidebar explorer."
      />

      <div className="flex flex-col gap-2">
        <Label>Browsing</Label>
        <div className="flex flex-col gap-2">
          <SettingRow
            title="Show hidden files"
            description="Display files and folders starting with a dot (e.g. .bashrc, .ssh)."
          >
            <Switch checked={sftpShowHiddenFiles} onCheckedChange={(v) => void setSftpShowHiddenFiles(v)} />
          </SettingRow>
          <SettingRow
            title="Show '..' up-folder entry"
            description="Show a '..' entry at the top of each directory to navigate to the parent folder."
          >
            <Switch checked={sftpShowUpFolder} onCheckedChange={(v) => void setSftpShowUpFolder(v)} />
          </SettingRow>
          <SettingRow
            title="Explorer: Show hidden files by default"
            description="Start the sidebar file tree with hidden files visible (applies to local and remote hosts)."
          >
            <Switch
              checked={explorerShowHiddenByDefault}
              onCheckedChange={(v) => void setExplorerShowHiddenByDefault(v)}
            />
          </SettingRow>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Columns</Label>
        <div className="flex flex-col gap-2">
          <SettingRow title="Show Size column" description="Display the file size column in the file list.">
            <Switch checked={sftpColumnSize} onCheckedChange={(v) => void setSftpColumnSize(v)} />
          </SettingRow>
          <SettingRow
            title="Show Modified column"
            description="Display the last modified date column in the file list."
          >
            <Switch checked={sftpColumnModified} onCheckedChange={(v) => void setSftpColumnModified(v)} />
          </SettingRow>
          <SettingRow
            title="Show Permissions column"
            description="Display the Unix permissions column in the file list."
          >
            <Switch
              checked={sftpColumnPermissions}
              onCheckedChange={(v) => void setSftpColumnPermissions(v)}
            />
          </SettingRow>
          <SettingRow
            title="Show Type column"
            description="Display the file type / extension column in the file list."
          >
            <Switch checked={sftpColumnType} onCheckedChange={(v) => void setSftpColumnType(v)} />
          </SettingRow>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Remote Sessions</Label>
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
            description="Automatically retry the sidebar's SSH browsing connection when it drops unexpectedly, using the SSH reconnect delay/attempts in Terminal settings."
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

      <div className="flex flex-col gap-2">
        <Label>Remote Editing</Label>
        <div className="flex flex-col gap-2">
          <SettingRow
            title="Show remote edit transfers"
            description="Display temporary download and upload operations when editing remote files in the transfers panel."
          >
            <Switch
              checked={sftpRemoteEditShowTransfers}
              onCheckedChange={(v) => void setSftpRemoteEditShowTransfers(v)}
            />
          </SettingRow>
          <SettingRow
            title="Max remote file size (MB)"
            description="Largest remote file that can be opened for in-app editing or AI attachment (1–100 MB)."
          >
            <NumInput
              value={sftpMaxRemoteFileSizeMb}
              min={1}
              max={100}
              step={1}
              onChange={(v) => void setSftpMaxRemoteFileSizeMb(v)}
            />
          </SettingRow>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Transfers</Label>
        <div className="flex flex-col gap-2">
          <SettingRow
            title="Concurrent transfers"
            description="How many uploads/downloads run at the same time (1–6)."
          >
            <NumInput
              value={sftpMaxConcurrentTransfers}
              min={1}
              max={6}
              step={1}
              onChange={(v) => void setSftpMaxConcurrentTransfers(v)}
            />
          </SettingRow>
          <SettingRow
            title="On name conflict"
            description="What to do automatically when a transfer target already exists."
          >
            <Select
              value={sftpDefaultConflictResolution}
              onValueChange={(v) => void setSftpDefaultConflictResolution(v as "ask" | "overwrite" | "skip")}
            >
              <SelectTrigger className="h-7 w-36 text-[11.5px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ask" className="text-[11.5px]">
                  Always ask
                </SelectItem>
                <SelectItem value="overwrite" className="text-[11.5px]">
                  Always overwrite
                </SelectItem>
                <SelectItem value="skip" className="text-[11.5px]">
                  Always skip
                </SelectItem>
              </SelectContent>
            </Select>
          </SettingRow>
          <SettingRow
            title="Transfer chunk size (KB)"
            description="Size of each read/write chunk during file transfers (16–1024 KB)."
          >
            <NumInput
              value={sftpChunkSizeKb}
              min={16}
              max={1024}
              step={16}
              onChange={(v) => void setSftpChunkSizeKb(v)}
            />
          </SettingRow>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Source Control</Label>
        <SettingRow
          title="Refresh interval"
          description="How often Source Control polls for status changes (in ms). Repositories on a remote SSH host automatically use a longer effective interval — each check is a network round-trip over the same session the file tree uses, so a longer interval reduces load without a second setting to manage."
        >
          <NumInput
            value={gitStatusPollIntervalMs}
            min={2000}
            max={30000}
            step={500}
            onChange={(v) => void setGitStatusPollIntervalMs(v)}
          />
        </SettingRow>
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <span className="text-[11px] font-medium tracking-tight text-muted-foreground">{children}</span>;
}
