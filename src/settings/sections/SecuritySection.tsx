import { Switch } from "@/components/ui/switch";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { setCredentialEncryption } from "@/modules/settings/store";
import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";
import { SectionHeader } from "../components/SectionHeader";
import { SettingRow } from "../components/SettingRow";

export function SecuritySection() {
  const credentialEncryption = usePreferencesStore((s) => s.credentialEncryption);
  const [pending, setPending] = useState(false);

  async function handleEncryptionToggle(enabled: boolean) {
    setPending(true);
    try {
      await invoke("secrets_set_encryption_enabled", { enabled });
      await setCredentialEncryption(enabled);
    } catch (err) {
      console.error("Failed to toggle credential encryption:", err);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        title="Security"
        description="Configure how Nexum stores and protects your credentials."
      />

      <div className="flex flex-col gap-2">
        <span className="text-[10.5px] font-medium tracking-wide text-muted-foreground uppercase">
          Credential Storage
        </span>
        <SettingRow
          title="Encrypt stored credentials"
          description="Credentials are encrypted on disk using an app-managed AES-256-GCM key. No master password required — encryption and decryption happen automatically."
        >
          <Switch
            checked={credentialEncryption}
            onCheckedChange={handleEncryptionToggle}
            disabled={pending}
          />
        </SettingRow>
      </div>
    </div>
  );
}
