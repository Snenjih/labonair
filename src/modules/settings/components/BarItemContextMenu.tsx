import type { ReactNode } from "react";
import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";
import type { BarId, BarItemId, BarItemPlacement, BarSide } from "@/modules/settings/lib/barItems";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { setBarItemPlacement } from "@/modules/settings/store";

export interface BarItemContextMenuProps {
  itemId: BarItemId;
  /** Extra controls rendered above "Hide" — e.g. AI's Panel/Mini surface-mode radio group. */
  extra?: (placement: BarItemPlacement) => ReactNode;
}

/**
 * Shared right-click menu for every positionable titlebar/statusbar/sidebar
 * item: choose which bar + which side it lives on, plus a "Hide" action.
 * Panel items (bar: "sidebar") skip the Bar choice since they only have a
 * dock side, not a titlebar/statusbar choice.
 */
export function BarItemContextMenu({ itemId, extra }: BarItemContextMenuProps) {
  const placement = usePreferencesStore((s) => s.barItemPlacements[itemId]);
  if (!placement) return null;
  const isPanelItem = placement.bar === "sidebar";

  return (
    <ContextMenuContent className="w-52">
      <ContextMenuLabel className="text-[11px]">Position</ContextMenuLabel>
      {!isPanelItem && (
        <ContextMenuRadioGroup
          value={placement.bar}
          onValueChange={(v) => void setBarItemPlacement(itemId, { bar: v as BarId })}
        >
          <ContextMenuRadioItem value="titlebar">Titlebar</ContextMenuRadioItem>
          <ContextMenuRadioItem value="statusbar">Statusbar</ContextMenuRadioItem>
        </ContextMenuRadioGroup>
      )}
      <ContextMenuRadioGroup
        value={placement.side}
        onValueChange={(v) => void setBarItemPlacement(itemId, { side: v as BarSide })}
      >
        <ContextMenuRadioItem value="left">{isPanelItem ? "Left dock" : "Left"}</ContextMenuRadioItem>
        <ContextMenuRadioItem value="right">{isPanelItem ? "Right dock" : "Right"}</ContextMenuRadioItem>
      </ContextMenuRadioGroup>
      {extra?.(placement)}
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
