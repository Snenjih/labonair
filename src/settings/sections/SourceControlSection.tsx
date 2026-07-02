import { usePreferencesStore } from "@/modules/settings/preferences";
import { setGitStatusPollIntervalMs } from "@/modules/settings/store";
import { SectionHeader } from "../components/SectionHeader";
import { SettingRow } from "../components/SettingRow";

export function SourceControlSection() {
  const gitStatusPollIntervalMs = usePreferencesStore((s) => s.gitStatusPollIntervalMs);

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title="Source Control"
        description="How the Source Control panel and Git Graph poll for changes, locally and over SSH."
      />

      <div className="flex flex-col gap-2">
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

function NumInput({
  value,
  min,
  max,
  step,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <input
      type="number"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="h-7 w-24 rounded-md border border-border/60 bg-transparent px-2 text-center text-[11.5px] focus:outline-none focus:ring-1 focus:ring-ring"
    />
  );
}
