import {
  FlashIcon,
  FolderTreeIcon,
  GitBranchIcon,
  Globe02Icon,
  LayoutTopIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { ReactNode } from "react";
import {
  ContextMenu,
  ContextMenuLabel,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { cn } from "@/lib/utils";
import { AgentStatusPill } from "@/modules/ai/components/AgentStatusPill";
import { AiOpenButton, AiStatusBarControls } from "@/modules/ai/components/AiStatusBarControls";
import { BookmarksDropdown } from "@/modules/bookmarks";
import { AgentAccessBadge } from "@/modules/header/components/AgentAccessBadge";
import { JumpHostDropdown } from "@/modules/header/components/JumpHostDropdown";
import { TransferDropdown } from "@/modules/header/components/TransferDropdown";
import { UpdaterButton } from "@/modules/header/components/UpdaterButton";
import { NotificationDropdown } from "@/modules/notifications/components/NotificationDropdown";
import { BarItemContextMenu } from "@/modules/settings/components/BarItemContextMenu";
import { withDividers } from "@/modules/settings/lib/barItemLayout";
import {
  BAR_ITEM_CATEGORY,
  type BarId,
  type BarItemId,
  type BarItemPlacement,
  type BarSide,
  PANEL_ITEM_TO_PANEL,
  visibleItemsFor,
} from "@/modules/settings/lib/barItems";
import { setBarItemPlacement } from "@/modules/settings/store";
import type { BreadcrumbRemoteTarget } from "../CwdBreadcrumb";
import { CwdBreadcrumb } from "../CwdBreadcrumb";
import type { SidebarPanel } from "../StatusBar";

export interface RenderBarItemCtx {
  placements: Record<BarItemId, BarItemPlacement>;
  // panels
  onPanelToggle?: (panel: SidebarPanel, side?: BarSide) => void;
  leftActivePanel?: SidebarPanel;
  rightActivePanel?: SidebarPanel;
  tabsLocation: "titlebar" | "sidebar";
  // badges
  bookmarksEnabled: boolean;
  sendCd: (path: string) => void;
  // info
  home: string | null;
  cwd: string | null;
  filePath: string | null;
  remoteTarget: BreadcrumbRemoteTarget | null;
  onCd: (path: string) => void;
  onCdInNewTab?: (path: string) => void;
  cursorLine: number;
  cursorCol: number;
  detectedPreviewUrl?: string | null;
  onOpenPreview?: () => void;
  // ai
  aiEnabled: boolean;
  panelOpen: boolean;
  hasComposer: boolean;
  onOpenMini: () => void;
  openAiPanel: () => void;
}

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

function hostFromUrl(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/** AI's context-menu extension point — a Panel/Mini surface-mode radio group. */
function renderAiExtra(placement: BarItemPlacement): ReactNode {
  const surfaceMode = (placement.extra?.surfaceMode as "panel" | "mini" | undefined) ?? "panel";
  return (
    <>
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

/**
 * Renders a single bar item, sized for whichever bar it's *currently*
 * assigned to (read from its own placement) — this is what makes moving an
 * item between titlebar and statusbar actually work everywhere instead of
 * only in the bar it originally shipped in, and what scales its size to
 * match (titlebar is taller, so items render a notch larger there).
 */
function renderBarItem(id: BarItemId, ctx: RenderBarItemCtx): ReactNode {
  const placement = ctx.placements[id];
  const compact = placement?.bar === "statusbar";

  switch (id) {
    case "updater":
      return <UpdaterButton />;
    case "notifications":
      return <NotificationDropdown />;
    case "jumpHosts":
      return <JumpHostDropdown onPanelToggle={ctx.onPanelToggle} />;
    case "agentAccess":
      return <AgentAccessBadge />;
    case "transfers":
      return <TransferDropdown />;
    case "bookmarks":
      return ctx.bookmarksEnabled ? <BookmarksDropdown sendCd={ctx.sendCd} /> : null;

    case "explorerPanel":
    case "snippetsPanel":
    case "sourceControlPanel":
    case "tabsPanel": {
      if (id === "tabsPanel" && ctx.tabsLocation !== "sidebar") return null;
      const panel = PANEL_ITEM_TO_PANEL[id];
      const isActive = ctx.leftActivePanel === panel || ctx.rightActivePanel === panel;
      return (
        <button
          type="button"
          title={PANEL_TITLES[id]}
          onClick={() => ctx.onPanelToggle?.(panel, placement?.side)}
          className={cn(
            "flex items-center justify-center rounded transition-colors",
            compact ? "h-5 w-5" : "size-7",
            isActive
              ? "bg-primary/20 text-foreground dark:text-primary"
              : "text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
        >
          <HugeiconsIcon icon={PANEL_ICONS[id]} size={compact ? 12 : 16} strokeWidth={1.75} />
        </button>
      );
    }

    case "cwdBreadcrumb":
      return (
        <CwdBreadcrumb
          cwd={ctx.cwd}
          filePath={ctx.filePath}
          home={ctx.home}
          remoteTarget={ctx.remoteTarget}
          onCd={ctx.onCd}
          onCdInNewTab={ctx.onCdInNewTab}
        />
      );

    case "cursorPosition":
      return ctx.filePath ? (
        <span className={cn("tabular-nums text-muted-foreground", compact ? "text-[11px]" : "text-xs")}>
          Ln {ctx.cursorLine}, Col {ctx.cursorCol}
        </span>
      ) : null;

    case "previewUrl":
      return ctx.detectedPreviewUrl && ctx.onOpenPreview ? (
        <button
          type="button"
          onClick={ctx.onOpenPreview}
          title={`Open ${ctx.detectedPreviewUrl} as a preview tab`}
          className={cn(
            "flex max-w-64 items-center gap-1.5 rounded-md border border-border/70 bg-accent/40 text-foreground/90 transition-colors hover:bg-accent hover:text-foreground",
            compact ? "h-6 px-2 text-[11px]" : "h-7 px-2.5 text-xs",
          )}
        >
          <HugeiconsIcon
            icon={Globe02Icon}
            size={compact ? 11 : 13}
            strokeWidth={1.75}
            className="shrink-0 text-muted-foreground"
          />
          <span className="truncate">Open preview</span>
          <span className="truncate text-muted-foreground">{hostFromUrl(ctx.detectedPreviewUrl)}</span>
        </button>
      ) : null;

    case "ai": {
      if (!ctx.aiEnabled) return null;
      const surfaceMode = (placement?.extra?.surfaceMode as "panel" | "mini" | undefined) ?? "panel";
      return (
        <>
          <AgentStatusPill onClick={ctx.onOpenMini} />
          {ctx.panelOpen && ctx.hasComposer ? (
            <AiStatusBarControls />
          ) : (
            <AiOpenButton onOpen={surfaceMode === "mini" ? ctx.onOpenMini : ctx.openAiPanel} />
          )}
        </>
      );
    }
    default:
      return null;
  }
}

/**
 * Builds one fully-wrapped (context-menu + divider) bucket of bar items for
 * a given (bar, side) — the single shared entry point `Header` and
 * `StatusBar` both call, so any item can land in either bar without the two
 * call sites needing their own copies of the switch/wrapping logic.
 */
export function buildBarBucket(
  bar: BarId,
  side: BarSide,
  ctx: RenderBarItemCtx,
  dividerClassName: string,
): ReactNode[] {
  const ids = visibleItemsFor(ctx.placements, bar, side);
  const clusters = ids
    .map((id) => {
      const content = renderBarItem(id, ctx);
      if (content === null) return null;
      const category = BAR_ITEM_CATEGORY[id];
      // CwdBreadcrumb manages its own right-click menu internally (its
      // segments already have per-path actions) — don't double-wrap it.
      if (id === "cwdBreadcrumb") {
        return { key: id, node: <div className="min-w-0 truncate">{content}</div>, category };
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
        category,
      };
    })
    .filter((c): c is NonNullable<typeof c> => c !== null);
  return withDividers(clusters, dividerClassName);
}
