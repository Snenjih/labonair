import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { usePreferencesStore } from "@/modules/settings/preferences";
import {
  setAgentFleetBroadcastAutoEnter,
  setAgentFleetDefaultPath,
} from "@/modules/settings/store";
import { SectionHeader } from "../components/SectionHeader";
import { SettingRow } from "../components/SettingRow";

export function AgentFleetSection() {
  const broadcastAutoEnter = usePreferencesStore((s) => s.agentFleetBroadcastAutoEnter);
  const defaultPath = usePreferencesStore((s) => s.agentFleetDefaultPath);

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title="Agent Fleet"
        description="Configure defaults for the Agent Fleet multi-terminal feature."
      />

      <div className="flex flex-col gap-2">
        <SettingRow
          title="Auto-submit broadcast"
          description="Automatically press Enter after broadcasting a command so it executes immediately in all selected terminals."
        >
          <Switch
            checked={broadcastAutoEnter}
            onCheckedChange={(v) => void setAgentFleetBroadcastAutoEnter(v)}
          />
        </SettingRow>

        <SettingRow
          title="Default working directory"
          description="Pre-filled project path in the new agent dialog. Leave empty to start blank."
        >
          <Input
            value={defaultPath}
            onChange={(e) => void setAgentFleetDefaultPath(e.target.value)}
            placeholder="~/projects/my-repo"
            className="h-7 w-52 font-mono text-[11.5px]"
          />
        </SettingRow>
      </div>
    </div>
  );
}
