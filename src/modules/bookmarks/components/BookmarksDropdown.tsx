import { Bookmark02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useHostsStore } from "@/modules/hosts";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { useSftpStore } from "@/modules/sftp/store/sftpStore";
import { selectActiveTab, useTabsStore } from "@/modules/tabs";
import { filterBookmarksForContext } from "../lib/filterBookmarksForContext";
import {
  applicableActions,
  type BookmarkActionKind,
  type EnabledActions,
  resolvePrimaryAction,
} from "../lib/resolveBookmarkAction";
import { isBookmarkOrphaned, type PathBookmark, usePathBookmarksStore } from "../store/pathBookmarksStore";
import { BookmarkRow } from "./BookmarkRow";

type Props = {
  /** Writes `cd <path>` into whichever terminal pane is currently focused —
   *  comes from `useTabManagement()`, owned by `AppShell.tsx`, so it's
   *  threaded down through `Header.tsx` rather than read off a bare store. */
  sendCd: (path: string) => void;
};

type FlatRow = {
  bm: PathBookmark;
  hostLabel: string | undefined;
  orphaned: boolean;
  primary: BookmarkActionKind;
  secondary: BookmarkActionKind[];
};

type RenderItem =
  | { kind: "header"; key: string; title: string }
  | { kind: "row"; key: string; rowIndex: number; row: FlatRow };

export function BookmarksDropdown({ sendCd }: Props) {
  const [open, setOpen] = useState(false);
  const [focusPos, setFocusPos] = useState<{ row: number; col: number } | null>(null);

  const hydrated = usePathBookmarksStore((s) => s.hydrated);
  const hydrate = usePathBookmarksStore((s) => s.hydrate);
  useEffect(() => {
    if (!hydrated) void hydrate();
  }, [hydrated, hydrate]);

  // Opened either by clicking the titlebar icon (PopoverTrigger, handled by
  // Radix) or by the global shortcut — the shortcut dispatches this event
  // instead of the handler owning an `open` prop threaded through Header, so
  // both triggers land on the exact same popover instance/anchor.
  useEffect(() => {
    function onOpenEvent() {
      setOpen(true);
    }
    window.addEventListener("labonair:bookmarks-open", onOpenEvent);
    return () => window.removeEventListener("labonair:bookmarks-open", onOpenEvent);
  }, []);

  const bookmarks = usePathBookmarksStore((s) => s.bookmarks);
  const removeBookmark = usePathBookmarksStore((s) => s.removeBookmark);
  const hosts = useHostsStore((s) => s.hosts);
  const activeTab = useTabsStore(selectActiveTab);

  const enabledActions: EnabledActions = {
    "new-terminal": usePreferencesStore((s) => s.bookmarksActionNewTerminal),
    "current-terminal": usePreferencesStore((s) => s.bookmarksActionCurrentTerminal),
    "current-sftp": usePreferencesStore((s) => s.bookmarksActionCurrentSftp),
    "new-sftp": usePreferencesStore((s) => s.bookmarksActionNewSftp),
  };
  const primaryClickBehavior = usePreferencesStore((s) => s.bookmarksPrimaryClickBehavior);
  const showBadge = usePreferencesStore((s) => s.bookmarksShowBadge);

  const result = filterBookmarksForContext(activeTab, bookmarks, hosts);

  function hostLabelFor(hostId: string | undefined): string | undefined {
    if (!hostId) return undefined;
    return hosts.find((h) => h.id === hostId)?.name;
  }

  // Single pass builds both the flat, keyboard-indexable row list and the
  // section-grouped render list, so the two can never drift out of sync.
  const flatRows: FlatRow[] = [];
  const renderItems: RenderItem[] = [];
  for (const section of result.sections) {
    if (section.bookmarks.length === 0) continue;
    renderItems.push({
      kind: "header",
      key: `h-${section.hostId ?? "local"}`,
      title: section.title,
    });
    for (const bm of section.bookmarks) {
      const orphaned = isBookmarkOrphaned(bm, hosts);
      const actions = orphaned ? [] : applicableActions(bm, activeTab, enabledActions);
      const primary = orphaned
        ? "new-terminal"
        : resolvePrimaryAction(bm, activeTab, primaryClickBehavior, enabledActions);
      const row: FlatRow = {
        bm,
        hostLabel: hostLabelFor(bm.hostId),
        orphaned,
        primary,
        secondary: actions.filter((a) => a !== primary),
      };
      const rowIndex = flatRows.length;
      flatRows.push(row);
      renderItems.push({ kind: "row", key: bm.id, rowIndex, row });
    }
  }
  const totalShown = flatRows.length;

  // Keyboard focus starts cleared — the roving-focus outline should only
  // appear once the user actually presses an arrow key, not just from
  // opening the popover or interacting with it by mouse. It's cleared again
  // on close, and whenever the row count changes while open (e.g. the
  // active tab changed), so a stale position doesn't point past the end.
  // biome-ignore lint/correctness/useExhaustiveDependencies: totalShown isn't read in the body — it's the intentional re-run trigger for clearing a stale position when the row count changes
  useEffect(() => {
    setFocusPos(null);
  }, [open, totalShown]);

  function execute(bm: PathBookmark, action: BookmarkActionKind) {
    const { newTab, newSshTab, newSftpTab, activeId } = useTabsStore.getState();
    switch (action) {
      case "new-terminal":
        if (bm.hostId) newSshTab(bm.hostId, hostLabelFor(bm.hostId) ?? bm.hostId, bm.path);
        else newTab(bm.path);
        break;
      case "current-terminal":
        sendCd(bm.path);
        break;
      case "current-sftp": {
        const tabId = String(activeId);
        if (bm.hostId) void useSftpStore.getState().loadRemoteDir(tabId, bm.path);
        else void useSftpStore.getState().loadLocalDir(tabId, bm.path);
        break;
      }
      case "new-sftp":
        // Only ever reachable for host bookmarks — applicableActions()
        // never includes "new-sftp" for a local one.
        newSftpTab(bm.hostId!, hostLabelFor(bm.hostId!) ?? bm.hostId!, true, bm.path);
        break;
    }
    setOpen(false);
  }

  // Roving 2D focus: Up/Down move rows (always resetting to column 0 — rows
  // have different action counts, so preserving a column across rows would
  // be surprising); Left/Right move within the focused row's columns (0 =
  // primary action, 1..N = its visible icons); Enter executes; Escape
  // closes. Same capture-phase idiom `useGlobalShortcuts` uses, for the same
  // reason: an open popover's arrow keys/Enter/Escape must never leak
  // through to a focused xterm instance sitting behind it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: flatRows/execute are recreated fresh every render (not memoized) by design, so the listener always closes over the latest data — the list is small enough that re-subscribing every render is cheap
  useEffect(() => {
    if (!open || totalShown === 0) return;
    const cur = focusPos ?? { row: 0, col: 0 };
    function onKeyDown(e: KeyboardEvent) {
      const row = flatRows[cur.row];
      switch (e.key) {
        case "ArrowDown":
          setFocusPos({ row: Math.min(cur.row + 1, flatRows.length - 1), col: 0 });
          break;
        case "ArrowUp":
          setFocusPos({ row: Math.max(cur.row - 1, 0), col: 0 });
          break;
        case "ArrowRight":
          setFocusPos({ row: cur.row, col: Math.min(cur.col + 1, row?.secondary.length ?? 0) });
          break;
        case "ArrowLeft":
          setFocusPos({ row: cur.row, col: Math.max(cur.col - 1, 0) });
          break;
        case "Enter": {
          if (row && !row.orphaned) {
            const action = cur.col === 0 ? row.primary : row.secondary[cur.col - 1];
            if (action) execute(row.bm, action);
          }
          break;
        }
        case "Escape":
          setOpen(false);
          break;
        default:
          return;
      }
      e.preventDefault();
      e.stopImmediatePropagation();
    }
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [open, totalShown, focusPos, flatRows]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative size-7 shrink-0 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          title="Bookmarks"
        >
          <HugeiconsIcon icon={Bookmark02Icon} size={16} strokeWidth={1.75} />
          {showBadge && totalShown > 0 && (
            <span
              className={cn(
                "absolute -top-0.5 -right-0.5 min-w-[14px] h-3.5 px-0.5 rounded-full text-[9px] font-bold",
                "flex items-center justify-center text-white bg-primary",
              )}
            >
              {totalShown}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-80 max-h-96 overflow-y-auto p-1.5"
        // Radix otherwise auto-focuses the first focusable button on open,
        // which paints its native focus-visible ring immediately — we drive
        // our own roving-focus highlight instead (only after an arrow key),
        // so suppress the automatic one.
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {totalShown === 0 ? (
          <div className="px-2 py-4 text-center text-xs text-muted-foreground">
            No bookmarks yet. Right-click a path in the breadcrumb, SFTP manager, or file explorer to add one.
          </div>
        ) : (
          <div className="flex flex-col gap-0.5">
            {renderItems.map((item) =>
              item.kind === "header" ? (
                <span
                  key={item.key}
                  className="mt-1 px-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground first:mt-0"
                >
                  {item.title}
                </span>
              ) : (
                <BookmarkRow
                  key={item.key}
                  bookmark={item.row.bm}
                  hostLabel={item.row.hostLabel}
                  orphaned={item.row.orphaned}
                  primaryAction={item.row.primary}
                  secondaryActions={item.row.secondary}
                  focusedColumn={focusPos?.row === item.rowIndex ? focusPos.col : null}
                  onExecute={(action) => execute(item.row.bm, action)}
                  onRemove={() => void removeBookmark(item.row.bm.id)}
                />
              ),
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
