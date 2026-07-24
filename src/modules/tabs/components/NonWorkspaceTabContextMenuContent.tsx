import { ContextMenuContent, ContextMenuItem, ContextMenuSeparator } from "@/components/ui/context-menu";
import { pluralLabelFor } from "../lib/tabUtils";
import type { Tab } from "../types";

export interface NonWorkspaceTabContextMenuContentProps {
  tab: Tab;
  onClose: (id: number) => void;
  onDuplicate: (id: number) => void;
  onCloseOthers: (id: number) => void;
  onCloseAll: () => void;
  onCloseByKind: (kind: Tab["kind"]) => void;
}

/** Shared context menu for every non-workspace tab kind (editor, preview,
 *  sftp, home, git-graph, ...) — used identically by `TabBar` and
 *  `SidebarTabList`. */
export function NonWorkspaceTabContextMenuContent({
  tab,
  onClose,
  onDuplicate,
  onCloseOthers,
  onCloseAll,
  onCloseByKind,
}: NonWorkspaceTabContextMenuContentProps) {
  return (
    <ContextMenuContent>
      {tab.kind !== "home" && (
        <>
          <ContextMenuItem onSelect={() => onClose(tab.id)}>Close Tab</ContextMenuItem>
          <ContextMenuItem onSelect={() => onDuplicate(tab.id)}>Duplicate Tab</ContextMenuItem>
          <ContextMenuSeparator />
        </>
      )}
      <ContextMenuItem onSelect={() => onCloseOthers(tab.id)}>Close Others</ContextMenuItem>
      <ContextMenuItem onSelect={onCloseAll}>Close All</ContextMenuItem>
      <ContextMenuItem onSelect={() => onCloseByKind(tab.kind)}>
        Close All {pluralLabelFor(tab.kind)}
      </ContextMenuItem>
    </ContextMenuContent>
  );
}
