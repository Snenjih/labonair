import { AgentStatusPill } from "@/modules/ai/components/AgentStatusPill";
import {
  AiOpenButton,
  AiStatusBarControls,
} from "@/modules/ai/components/AiStatusBarControls";
import { useChatStore } from "@/modules/ai";
import { usePreferencesStore } from "@/modules/settings/preferences";
import {
  CodeIcon,
  FlashIcon,
  Globe02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { cn } from "@/lib/utils";
import { CwdBreadcrumb } from "./CwdBreadcrumb";

export type SidebarPanel = "explorer" | "snippets" | "hosts" | null;

type Props = {
  cwd: string | null;
  filePath?: string | null;
  home: string | null;
  onCd: (path: string) => void;
  onOpenMini: () => void;
  /** Only rendered when the AI panel is open and a key is loaded. */
  hasComposer: boolean;
  /** When set, render a one-click "Open preview" chip pointing at this URL. */
  detectedPreviewUrl?: string | null;
  onOpenPreview?: () => void;
  /** Active sidebar panel — drives the panel switcher button highlight */
  activePanel?: SidebarPanel;
  onPanelToggle?: (panel: SidebarPanel) => void;
};

const PANEL_BUTTONS: Array<{ panel: SidebarPanel; icon: typeof CodeIcon; title: string }> = [
  { panel: "explorer", icon: CodeIcon, title: "Explorer (Cmd+B)" },
  { panel: "snippets", icon: FlashIcon, title: "Snippets" },
];

export function StatusBar({
  cwd,
  filePath,
  home,
  onCd,
  onOpenMini,
  hasComposer,
  detectedPreviewUrl,
  onOpenPreview,
  activePanel,
  onPanelToggle,
}: Props) {
  const panelOpen = useChatStore((s) => s.panelOpen);
  const openPanel = useChatStore((s) => s.openPanel);
  const aiEnabled = usePreferencesStore((s) => s.aiEnabled);

  return (
    <footer className="flex h-8 shrink-0 items-center justify-between gap-3 border-t border-border/60 bg-card/60 px-3 text-[11px]">
      <div className="flex min-w-0 flex-1 items-center gap-1 truncate">
        {/* Panel switcher buttons */}
        <div className="flex shrink-0 items-center gap-0.5">
          {PANEL_BUTTONS.map(({ panel, icon, title }) => (
            <button
              key={panel}
              type="button"
              title={title}
              onClick={() => onPanelToggle?.(panel)}
              className={cn(
                "flex h-5 w-5 items-center justify-center rounded transition-colors",
                activePanel === panel
                  ? "bg-primary/20 text-primary"
                  : "text-muted-foreground/60 hover:bg-primary/10 hover:text-primary/80"
              )}
            >
              <HugeiconsIcon icon={icon} size={12} strokeWidth={1.75} />
            </button>
          ))}
        </div>
        {/* Divider */}
        <div className="mx-1 h-3.5 w-px shrink-0 bg-border/60" />
        {/* Path breadcrumb */}
        <div className="min-w-0 truncate">
          <CwdBreadcrumb cwd={cwd} filePath={filePath} home={home} onCd={onCd} />
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {detectedPreviewUrl && onOpenPreview ? (
          <button
            type="button"
            onClick={onOpenPreview}
            title={`Open ${detectedPreviewUrl} as a preview tab`}
            className="flex h-6 max-w-64 items-center gap-1.5 rounded-md border border-border/70 bg-accent/40 px-2 text-[11px] text-foreground/90 transition-colors hover:bg-accent hover:text-foreground"
          >
            <HugeiconsIcon
              icon={Globe02Icon}
              size={11}
              strokeWidth={1.75}
              className="shrink-0 text-muted-foreground"
            />
            <span className="truncate">Open preview</span>
            <span className="truncate text-muted-foreground">
              {hostFromUrl(detectedPreviewUrl)}
            </span>
          </button>
        ) : null}
        {aiEnabled && <AgentStatusPill onClick={onOpenMini} />}
        {aiEnabled && (panelOpen && hasComposer ? (
          <AiStatusBarControls />
        ) : (
          <AiOpenButton onOpen={openPanel} />
        ))}
      </div>
    </footer>
  );
}

function hostFromUrl(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
