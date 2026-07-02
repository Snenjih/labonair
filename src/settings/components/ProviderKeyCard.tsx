import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import type { ProviderInfo } from "@/modules/ai/config";
import { ArrowUpRight01Icon, ViewIcon, ViewOffSlashIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useState } from "react";
import { ProviderIcon } from "./ProviderIcon";

type Props = {
  provider: ProviderInfo;
  currentKey: string | null;
  onSave: (key: string) => Promise<void>;
  onClear: () => Promise<void>;
};

function maskKey(key: string): string {
  if (key.length <= 8) return "•".repeat(key.length);
  const prefix = key.slice(0, 4);
  const suffix = key.slice(-4);
  return `${prefix}${"•".repeat(Math.min(8, key.length - 8))}${suffix}`;
}

export function ProviderKeyCard({ provider, currentKey, onSave }: Props) {
  const [draft, setDraft] = useState("");
  const [reveal, setReveal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    const trimmed = draft.trim();
    if (!trimmed) {
      setError("Enter your API key.");
      return;
    }
    if (provider.keyPrefix && !trimmed.startsWith(provider.keyPrefix)) {
      setError(`Keys start with "${provider.keyPrefix}".`);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(trimmed);
      setDraft("");
      setReveal(false);
    } catch (e) {
      setError(`Failed to save: ${String(e)}`);
    } finally {
      setSaving(false);
    }
  };

  const placeholder = currentKey
    ? maskKey(currentKey)
    : provider.keyPrefix
      ? `${provider.keyPrefix}…`
      : "Paste API key";

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border/50 bg-card/50 px-3 py-2.5">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5">
          <ProviderIcon provider={provider.id} size={14} />
          <span className="text-[12.5px] font-medium">{provider.label}</span>
        </span>
        {provider.consoleUrl && (
          <button
            type="button"
            onClick={() => void openUrl(provider.consoleUrl)}
            className="flex items-center gap-0.5 text-[10.5px] text-muted-foreground transition-colors hover:text-foreground"
          >
            Get key
            <HugeiconsIcon icon={ArrowUpRight01Icon} size={10} strokeWidth={2} />
          </button>
        )}
      </div>

      <div className="flex gap-1.5">
        <div className="relative flex-1">
          <Input
            type={reveal ? "text" : "password"}
            autoComplete="off"
            spellCheck={false}
            placeholder={placeholder}
            value={draft}
            disabled={saving}
            onChange={(e) => {
              setDraft(e.target.value);
              if (error) setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void handleSave();
              }
            }}
            className="h-8 pr-8 font-mono text-[11.5px]"
          />
          <button
            type="button"
            onClick={() => setReveal((v) => !v)}
            tabIndex={-1}
            className="absolute top-1/2 right-2.5 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
            aria-label={reveal ? "Hide key" : "Show key"}
          >
            <HugeiconsIcon icon={reveal ? ViewOffSlashIcon : ViewIcon} size={12} strokeWidth={1.75} />
          </button>
        </div>
        <Button
          size="sm"
          onClick={() => void handleSave()}
          disabled={saving || !draft.trim()}
          className="h-8 px-3 text-[11px]"
        >
          {saving && <Spinner className="mr-1 size-3" />}
          Save
        </Button>
      </div>

      {error && <p className="text-[10.5px] text-destructive">{error}</p>}
    </div>
  );
}
