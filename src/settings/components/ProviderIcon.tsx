import type { ProviderId } from "@/modules/ai/config";
import {
  AiChipIcon,
  AiNetworkIcon,
  BotIcon,
  ChatGptIcon,
  ClaudeIcon,
  ComputerIcon,
  ComputerTerminal01Icon,
  DeepseekIcon,
  FlashIcon,
  GoogleGeminiIcon,
  Grok02Icon,
  MistralIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

const ICON_BY_PROVIDER = {
  openai: ChatGptIcon,
  anthropic: ClaudeIcon,
  google: GoogleGeminiIcon,
  xai: Grok02Icon,
  cerebras: AiChipIcon,
  groq: FlashIcon,
  lmstudio: ComputerTerminal01Icon,
  "openai-compatible": ComputerIcon,
  deepseek: DeepseekIcon,
  mistral: MistralIcon,
  openrouter: AiNetworkIcon,
  mlx: ComputerTerminal01Icon,
  ollama: BotIcon,
} as const satisfies Record<ProviderId, typeof ChatGptIcon>;

type Props = {
  provider: ProviderId;
  size?: number;
  className?: string;
};

export function ProviderIcon({ provider, size = 14, className }: Props) {
  const icon = (ICON_BY_PROVIDER as Record<string, typeof ChatGptIcon | undefined>)[provider] ?? BotIcon;
  return <HugeiconsIcon icon={icon} size={size} strokeWidth={1.75} className={className} />;
}
