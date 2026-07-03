import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CLOUD_PROVIDER_IDS, LOCAL_PROVIDER_IDS, PROVIDERS, type ProviderId } from "@/modules/ai/config";
import { Add01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { ProviderIcon } from "./ProviderIcon";

type Props = {
  onSelect: (providerId: ProviderId) => void;
};

const PROVIDER_LABELS: Record<string, string> = Object.fromEntries(PROVIDERS.map((p) => [p.id, p.label]));

export function AddProviderDropdown({ onSelect }: Props) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="h-8 gap-1.5 rounded-full px-3 text-[12px]">
          <HugeiconsIcon icon={Add01Icon} size={12} strokeWidth={2} />
          Add provider
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
          Cloud
        </DropdownMenuLabel>
        {CLOUD_PROVIDER_IDS.map((id) => (
          <DropdownMenuItem key={id} onClick={() => onSelect(id)} className="gap-2 text-[13px]">
            <ProviderIcon provider={id} size={15} />
            {PROVIDER_LABELS[id] ?? id}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
          Local &amp; Custom
        </DropdownMenuLabel>
        {LOCAL_PROVIDER_IDS.map((id) => (
          <DropdownMenuItem key={id} onClick={() => onSelect(id)} className="gap-2 text-[13px]">
            <ProviderIcon provider={id} size={15} />
            {PROVIDER_LABELS[id] ?? id}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
