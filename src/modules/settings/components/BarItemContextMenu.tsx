import type { ReactNode } from "react";
import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";
import type { BarId, BarItemId, BarItemPlacement, BarSide } from "@/modules/settings/lib/barItems";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { setBarItemPlacement } from "@/modules/settings/store";

export interface BarItemContextMenuProps {
  itemId: BarItemId;
  /** Extra controls rendered below the bar/side choices, above "Hide" — e.g.
   *  AI's Panel/Mini surface-mode radio group. */
  extra?: (placement: BarItemPlacement) => ReactNode;
  /** Defaults to "w-44" — widen for items whose `extra` content needs more
   *  room (e.g. CwdBreadcrumb's migrated path actions). */
  className?: string;
}

/**
 * Shared right-click menu for every positionable titlebar/statusbar item,
 * unified across all item types: Side (Left/Right), a divider, Bar
 * (Titlebar/Statusbar) — four choices total, the active one checked in each
 * group — then, if the item contributes any, a divider + its own extra
 * controls, then a final divider + "Hide".
 */
export function BarItemContextMenu({ itemId, extra, className }: BarItemContextMenuProps) {
  const placement = usePreferencesStore((s) => s.barItemPlacements[itemId]);
  if (!placement) return null;

  return (
    <ContextMenuContent className={className ?? "w-44"}>
      <ContextMenuRadioGroup
        value={placement.side}
        onValueChange={(v) => void setBarItemPlacement(itemId, { side: v as BarSide })}
      >
        <ContextMenuRadioItem value="left">Left</ContextMenuRadioItem>
        <ContextMenuRadioItem value="right">Right</ContextMenuRadioItem>
      </ContextMenuRadioGroup>
      <ContextMenuSeparator />
      <ContextMenuRadioGroup
        value={placement.bar}
        onValueChange={(v) => void setBarItemPlacement(itemId, { bar: v as BarId })}
      >
        <ContextMenuRadioItem value="titlebar">Titlebar</ContextMenuRadioItem>
        <ContextMenuRadioItem value="statusbar">Statusbar</ContextMenuRadioItem>
      </ContextMenuRadioGroup>
      {extra && (
        <>
          <ContextMenuSeparator />
          {extra(placement)}
        </>
      )}
      <ContextMenuSeparator />
      <ContextMenuItem
        className="text-[12px]"
        onSelect={() => void setBarItemPlacement(itemId, { hidden: true })}
      >
        Hide
      </ContextMenuItem>
    </ContextMenuContent>
  );
}
