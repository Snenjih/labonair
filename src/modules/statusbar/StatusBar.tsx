import React from "react";
import { AgentStatusPill } from "@/modules/ai/components/AgentStatusPill";
import { AiOpenButton, AiStatusBarControls } from "@/modules/ai/components/AiStatusBarControls";
import { useChatStore } from "@/modules/ai";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { openSettingsWindow } from "@/modules/settings/openSettingsWindow";
import {
  FolderTreeIcon,
  FlashIcon,
  GitBranchIcon,
  Globe02Icon,
  LayoutTopIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { cn } from "@/lib/utils";
import { CwdBreadcrumb } from "./CwdBreadcrumb";
import { useEditorCursorStore } from "@/modules/editor/lib/cursorStore";
import { useTabsStore } from "@/modules/tabs/store/tabsStore";
import type { WorkspaceTab } from "@/modules/tabs/types";
import {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  STATUSBAR_ITEM_REGISTRY,
  STATUSBAR_ITEM_SETTERS,
  type StatusBarItemDescriptor,
} from "./lib/statusBarItems";

export type SidebarPanel = "explorer" | "snippets" | "source-control" | "hosts" | "tabs" | null;

type Props = {
  home: string | null;
  onCd: (path: string) => void;
  onCdInNewTab?: (path: string) => void;
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

const PANEL_BUTTONS: Array<{
  panel: SidebarPanel;
  icon: typeof FolderTreeIcon;
  title: string;
  prefKey: "statusBarShowExplorerButton" | "statusBarShowSnippetsButton" | "statusBarShowSourceControlButton";
}> = [
  {
    panel: "explorer",
    icon: FolderTreeIcon,
    title: "Explorer (Cmd+B)",
    prefKey: "statusBarShowExplorerButton",
  },
  { panel: "snippets", icon: FlashIcon, title: "Snippets", prefKey: "statusBarShowSnippetsButton" },
  {
    panel: "source-control",
    icon: GitBranchIcon,
    title: "Source Control",
    prefKey: "statusBarShowSourceControlButton",
  },
];

export const StatusBar = React.memo(function StatusBar({
  home,
  onCd,
  onCdInNewTab,
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
  const showCursorPosition = usePreferencesStore((s) => s.editorShowCursorPosition);
  const tabsLocation = usePreferencesStore((s) => s.tabsLocation);
  const showExplorerButton = usePreferencesStore((s) => s.statusBarShowExplorerButton);
  const showSnippetsButton = usePreferencesStore((s) => s.statusBarShowSnippetsButton);
  const showSourceControlButton = usePreferencesStore((s) => s.statusBarShowSourceControlButton);
  const showTabsButton = usePreferencesStore((s) => s.statusBarShowTabsButton);
  const showCwdBreadcrumb = usePreferencesStore((s) => s.statusBarShowCwdBreadcrumb);
  const showPreviewUrl = usePreferencesStore((s) => s.statusBarShowPreviewUrl);
  const showAiControls = usePreferencesStore((s) => s.statusBarShowAiControls);
  const cursorLine = useEditorCursorStore((s) => s.line);
  const cursorCol = useEditorCursorStore((s) => s.col);

  const panelButtonVisibility = {
    statusBarShowExplorerButton: showExplorerButton,
    statusBarShowSnippetsButton: showSnippetsButton,
    statusBarShowSourceControlButton: showSourceControlButton,
  };
  const showTabsBtn = tabsLocation === "sidebar" && showTabsButton;
  const anyPanelButtonVisible =
    showExplorerButton || showSnippetsButton || showSourceControlButton || showTabsBtn;

  const cwd = useTabsStore((s) => {
    const tab = s.tabs.find((t) => t.id === s.activeId);
    if (tab?.kind !== "workspace") return null;
    const wt = tab as WorkspaceTab;
    const session = wt.sessions[wt.activePaneId];
    return session?.kind === "local" ? (session.cwd ?? null) : null;
  });
  const filePath = useTabsStore((s) => {
    const tab = s.tabs.find((t) => t.id === s.activeId);
    if (tab?.kind !== "editor") return null;
    const et = tab as { isUntitled: boolean; path: string };
    return et.isUntitled ? (et.path.split("/").pop() ?? "untitled.txt") : et.path;
  });

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <footer className="flex h-8 shrink-0 items-center justify-between gap-3 border-t border-border/60 bg-status-bar px-3 text-[11px]">
          <div className="flex min-w-0 flex-1 items-center gap-1 truncate">
            {/* Panel switcher buttons */}
            {anyPanelButtonVisible && (
              <div className="flex shrink-0 items-center gap-0.5">
                {PANEL_BUTTONS.map(({ panel, icon, title, prefKey }) =>
                  panelButtonVisibility[prefKey] ? (
                    <button
                      key={panel}
                      type="button"
                      title={title}
                      onClick={() => onPanelToggle?.(panel)}
                      className={cn(
                        "flex h-5 w-5 items-center justify-center rounded transition-colors",
                        activePanel === panel
                          ? "bg-primary/20 text-foreground dark:text-primary"
                          : "text-muted-foreground hover:bg-accent hover:text-foreground",
                      )}
                    >
                      <HugeiconsIcon icon={icon} size={12} strokeWidth={1.75} />
                    </button>
                  ) : null,
                )}
                {showTabsBtn && (
                  <button
                    type="button"
                    title="Tabs"
                    onClick={() => onPanelToggle?.("tabs")}
                    className={cn(
                      "flex h-5 w-5 items-center justify-center rounded transition-colors",
                      activePanel === "tabs"
                        ? "bg-primary/20 text-foreground dark:text-primary"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground",
                    )}
                  >
                    <HugeiconsIcon icon={LayoutTopIcon} size={12} strokeWidth={1.75} />
                  </button>
                )}
              </div>
            )}
            {/* Divider + Path breadcrumb */}
            {showCwdBreadcrumb && (
              <>
                {anyPanelButtonVisible && <div className="mx-1 h-3.5 w-px shrink-0 bg-border/60" />}
                <div className="min-w-0 truncate">
                  <CwdBreadcrumb
                    cwd={cwd}
                    filePath={filePath}
                    home={home}
                    onCd={onCd}
                    onCdInNewTab={onCdInNewTab}
                  />
                </div>
              </>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {filePath && showCursorPosition && (
              <span className="tabular-nums text-muted-foreground">
                Ln {cursorLine}, Col {cursorCol}
              </span>
            )}
            {showPreviewUrl && detectedPreviewUrl && onOpenPreview ? (
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
                <span className="truncate text-muted-foreground">{hostFromUrl(detectedPreviewUrl)}</span>
              </button>
            ) : null}
            {aiEnabled && showAiControls && <AgentStatusPill onClick={onOpenMini} />}
            {aiEnabled &&
              showAiControls &&
              (panelOpen && hasComposer ? <AiStatusBarControls /> : <AiOpenButton onOpen={openPanel} />)}
          </div>
        </footer>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-64">
        <ContextMenuLabel className="px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Status Bar Items
        </ContextMenuLabel>
        {STATUSBAR_ITEM_REGISTRY.map((item) => {
          if (item.id === "tabsButton" && tabsLocation !== "sidebar") return null;
          return <StatusBarMenuCheckboxItem key={item.id} descriptor={item} />;
        })}
        <ContextMenuSeparator />
        <ContextMenuItem className="text-[12px]" onSelect={() => void openSettingsWindow("appearance")}>
          Status Bar Settings…
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
});

function StatusBarMenuCheckboxItem({ descriptor }: { descriptor: StatusBarItemDescriptor }) {
  const enabled = usePreferencesStore((s) => s[descriptor.prefKey] as boolean);
  return (
    <ContextMenuCheckboxItem
      checked={enabled}
      onCheckedChange={(v) => void STATUSBAR_ITEM_SETTERS[descriptor.id](v)}
    >
      <div className="flex flex-col gap-0.5">
        <span className="text-[12px]">{descriptor.label}</span>
        <span className="text-[10px] text-muted-foreground">{descriptor.description}</span>
      </div>
    </ContextMenuCheckboxItem>
  );
}

function hostFromUrl(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
