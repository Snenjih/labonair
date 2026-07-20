import { usePreferencesStore } from "@/modules/settings/preferences";
import { setGitStatusPollIntervalMs } from "@/modules/settings/store";
import { NumInput } from "../components/NumInput";
import { SectionHeader } from "../components/SectionHeader";
import { SettingRow } from "../components/SettingRow";

export function SourceControlSection() {
  const gitStatusPollIntervalMs = usePreferencesStore((s) => s.gitStatusPollIntervalMs);

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title="Source Control"
        description="Git status polling for local and remote repositories."
      />

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
  );
}
