import {
  FlashIcon,
  FolderTreeIcon,
  GitBranchIcon,
  Globe02Icon,
  LayoutTopIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ReactNode } from "react";
import React from "react";
import {
  ContextMenu,
  ContextMenuLabel,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { cn } from "@/lib/utils";
import { useChatStore } from "@/modules/ai";
import { AgentStatusPill } from "@/modules/ai/components/AgentStatusPill";
import { AiOpenButton, AiStatusBarControls } from "@/modules/ai/components/AiStatusBarControls";
import { useEditorCursorStore } from "@/modules/editor/lib/cursorStore";
import { useLazyExplorerSession } from "@/modules/explorer/lib/useLazyExplorerSession";
import { BarItemContextMenu } from "@/modules/settings/components/BarItemContextMenu";
import { withDividers } from "@/modules/settings/lib/barItemLayout";
import {
  type BarItemId,
  type BarItemPlacement,
  PANEL_ITEM_TO_PANEL,
  visibleItemsFor,
} from "@/modules/settings/lib/barItems";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { setBarItemPlacement } from "@/modules/settings/store";
import { useTabsStore } from "@/modules/tabs/store/tabsStore";
import type { WorkspaceTab } from "@/modules/tabs/types";
import { CwdBreadcrumb } from "./CwdBreadcrumb";

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
  /** Active panel in each dual-dock slot — drives the panel switcher button highlight */
  leftActivePanel?: SidebarPanel;
  rightActivePanel?: SidebarPanel;
  onPanelToggle?: (panel: SidebarPanel, side?: "left" | "right") => void;
};

const PANEL_ICONS: Record<keyof typeof PANEL_ITEM_TO_PANEL, typeof FolderTreeIcon> = {
  explorerPanel: FolderTreeIcon,
  snippetsPanel: FlashIcon,
  sourceControlPanel: GitBranchIcon,
  tabsPanel: LayoutTopIcon,
};

const PANEL_TITLES: Record<keyof typeof PANEL_ITEM_TO_PANEL, string> = {
  explorerPanel: "Explorer (Cmd+B)",
  snippetsPanel: "Snippets",
  sourceControlPanel: "Source Control",
  tabsPanel: "Tabs",
};

export const StatusBar = React.memo(function StatusBar({
  home,
  onCd,
  onCdInNewTab,
  onOpenMini,
  hasComposer,
  detectedPreviewUrl,
  onOpenPreview,
  leftActivePanel,
  rightActivePanel,
  onPanelToggle,
}: Props) {
  const panelOpen = useChatStore((s) => s.panelOpen);
  const openAiPanel = useChatStore((s) => s.openPanel);
  const aiEnabled = usePreferencesStore((s) => s.aiEnabled);
  const tabsLocation = usePreferencesStore((s) => s.tabsLocation);
  const placements = usePreferencesStore((s) => s.barItemPlacements);
  const cursorLine = useEditorCursorStore((s) => s.line);
  const cursorCol = useEditorCursorStore((s) => s.col);

  const cwd = useTabsStore((s) => {
    const tab = s.tabs.find((t) => t.id === s.activeId);
    if (tab?.kind !== "workspace") return null;
    const wt = tab as WorkspaceTab;
    const session = wt.sessions[wt.activePaneId];
    if (session?.kind === "local") return session.cwd ?? null;
    if (session?.kind === "ssh") return session.cwd ?? null;
    return null;
  });
  // Same {hostId} the sidebar tree's ExplorerTarget resolves to for an SSH
  // workspace pane — acquiring it here (ref-counted, idempotent) reuses the
  // sidebar's already-open session when there is one, or lazily connects a
  // shared one otherwise, instead of the breadcrumb standing up its own.
  const sshHostId = useTabsStore((s) => {
    const tab = s.tabs.find((t) => t.id === s.activeId);
    if (tab?.kind !== "workspace") return null;
    const wt = tab as WorkspaceTab;
    const session = wt.sessions[wt.activePaneId];
    return session?.kind === "ssh" ? (session.hostId ?? null) : null;
  });
  const lazySession = useLazyExplorerSession(sshHostId);
  const remoteTarget =
    sshHostId && lazySession ? { hostId: sshHostId, sessionId: lazySession.sessionId } : null;
  const filePath = useTabsStore((s) => {
    const tab = s.tabs.find((t) => t.id === s.activeId);
    if (tab?.kind !== "editor") return null;
    const et = tab as { isUntitled: boolean; path: string };
    return et.isUntitled ? (et.path.split("/").pop() ?? "untitled.txt") : et.path;
  });

  function renderAiExtra(placement: BarItemPlacement): ReactNode {
    const surfaceMode = (placement.extra?.surfaceMode as "panel" | "mini" | undefined) ?? "panel";
    return (
      <>
        <ContextMenuSeparator />
        <ContextMenuLabel className="text-[11px]">Opens as</ContextMenuLabel>
        <ContextMenuRadioGroup
          value={surfaceMode}
          onValueChange={(v) =>
            void setBarItemPlacement("ai", { extra: { ...placement.extra, surfaceMode: v } })
          }
        >
          <ContextMenuRadioItem value="panel">Docked panel</ContextMenuRadioItem>
          <ContextMenuRadioItem value="mini">Mini window</ContextMenuRadioItem>
        </ContextMenuRadioGroup>
      </>
    );
  }

  function renderItem(id: BarItemId): ReactNode {
    switch (id) {
      case "explorerPanel":
      case "snippetsPanel":
      case "sourceControlPanel":
      case "tabsPanel": {
        if (id === "tabsPanel" && tabsLocation !== "sidebar") return null;
        const panel = PANEL_ITEM_TO_PANEL[id];
        const isActive = leftActivePanel === panel || rightActivePanel === panel;
        return (
          <button
            type="button"
            title={PANEL_TITLES[id]}
            onClick={() => onPanelToggle?.(panel, placements[id]?.side)}
            className={cn(
              "flex h-5 w-5 items-center justify-center rounded transition-colors",
              isActive
                ? "bg-primary/20 text-foreground dark:text-primary"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            <HugeiconsIcon icon={PANEL_ICONS[id]} size={12} strokeWidth={1.75} />
          </button>
        );
      }
      case "cursorPosition":
        return filePath ? (
          <span className="tabular-nums text-muted-foreground">
            Ln {cursorLine}, Col {cursorCol}
          </span>
        ) : null;
      case "previewUrl":
        return detectedPreviewUrl && onOpenPreview ? (
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
        ) : null;
      case "ai": {
        if (!aiEnabled) return null;
        const surfaceMode = (placements.ai?.extra?.surfaceMode as "panel" | "mini" | undefined) ?? "panel";
        return (
          <>
            <AgentStatusPill onClick={onOpenMini} />
            {panelOpen && hasComposer ? (
              <AiStatusBarControls />
            ) : (
              <AiOpenButton onOpen={surfaceMode === "mini" ? onOpenMini : openAiPanel} />
            )}
          </>
        );
      }
      case "cwdBreadcrumb":
        return (
          <CwdBreadcrumb
            cwd={cwd}
            filePath={filePath}
            home={home}
            remoteTarget={remoteTarget}
            onCd={onCd}
            onCdInNewTab={onCdInNewTab}
          />
        );
      default:
        return null;
    }
  }

  function renderBucket(side: "left" | "right", dividerClassName: string) {
    const ids = visibleItemsFor(placements, "statusbar", side);
    const clusters = ids
      .map((id) => {
        const content = renderItem(id);
        if (content === null) return null;
        // CwdBreadcrumb manages its own right-click menu internally (its
        // segments already have per-path actions) — don't double-wrap it.
        if (id === "cwdBreadcrumb") {
          return { key: id, node: <div className="min-w-0 truncate">{content}</div> };
        }
        return {
          key: id,
          node: (
            <ContextMenu key={id}>
              <ContextMenuTrigger asChild>
                <div className={cn("flex shrink-0 items-center", id === "ai" ? "gap-1.5" : "gap-0.5")}>
                  {content}
                </div>
              </ContextMenuTrigger>
              <BarItemContextMenu itemId={id} extra={id === "ai" ? renderAiExtra : undefined} />
            </ContextMenu>
          ),
        };
      })
      .filter((c): c is NonNullable<typeof c> => c !== null);
    return withDividers(clusters, dividerClassName);
  }

  return (
    <footer className="flex h-8 shrink-0 items-center justify-between gap-3 border-t border-border/60 bg-status-bar px-3 text-[11px]">
      <div className="flex min-w-0 flex-1 items-center gap-1 truncate">
        {renderBucket("left", "mx-1 h-3.5 w-px shrink-0 bg-border/60")}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {renderBucket("right", "mx-1 h-3.5 w-px shrink-0 bg-border/60")}
      </div>
    </footer>
  );
});

function hostFromUrl(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
