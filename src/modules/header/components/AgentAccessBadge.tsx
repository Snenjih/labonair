import { Cancel01Icon, ShieldUserIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { getPopoverPlacement } from "@/modules/settings/lib/getPopoverPlacement";
import { usePreferencesStore } from "@/modules/settings/preferences";
import { setAgentAccessGrant, useAgentAccessStore, useTabsStore } from "@/modules/tabs";

/** Header badge listing SSH tabs the user has granted MCP agent access to
 *  (see `TabBar.tsx`'s "Grant AI Agent Access" checkbox and
 *  `agentAccessStore.ts`) — lets the user see, jump to, and revoke access at
 *  a glance, mirroring `JumpHostDropdown`'s layout. Hidden entirely when the
 *  MCP agent bridge feature itself is off, or (depending on the
 *  `badgesAlwaysVisible` preference) when there's nothing granted yet. */
export function AgentAccessBadge() {
  const bridgeEnabled = useAgentAccessStore((s) => s.bridgeEnabled);
  const entries = useAgentAccessStore((s) => s.entries);
  const placement = usePreferencesStore((s) => s.barItemPlacements.agentAccess);
  const badgesAlwaysVisible = usePreferencesStore((s) => s.badgesAlwaysVisible);
  const list = Object.values(entries);
  if (!bridgeEnabled) return null;
  if (!badgesAlwaysVisible && list.length === 0) return null;

  const { side, align } = getPopoverPlacement(placement.bar, placement.side);
  const compact = placement.bar === "statusbar";

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "relative shrink-0 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground",
            compact ? "size-5" : "size-7",
          )}
          title="AI Agent Access"
        >
          <HugeiconsIcon icon={ShieldUserIcon} size={compact ? 12 : 16} strokeWidth={1.75} />
          {list.length > 0 && (
            <span
              className={cn(
                "absolute flex items-center justify-center rounded-full font-bold text-white bg-primary",
                compact
                  ? "-right-0.5 -top-0.5 h-2.5 min-w-[10px] px-0.5 text-[7px]"
                  : "-right-0.5 -top-0.5 h-3.5 min-w-[14px] px-0.5 text-[9px]",
              )}
            >
              {list.length}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent side={side} align={align} className="w-[320px] p-0 max-h-[420px] flex flex-col">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
          <span className="text-sm font-semibold">AI Agent Access</span>
        </div>
        {list.length === 0 ? (
          <div className="flex items-center justify-center h-20 text-sm text-muted-foreground select-none">
            No agent access granted
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto divide-y divide-border/40">
            {list.map((entry) => (
              <div
                key={entry.tabId}
                className="flex items-center justify-between gap-2 px-3 py-2 hover:bg-accent/30 transition-colors"
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 text-left text-xs text-foreground truncate"
                  onClick={() => useTabsStore.getState().setActiveId(entry.tabId)}
                  title={`Jump to ${entry.label}`}
                >
                  {entry.label}
                </button>
                <button
                  type="button"
                  title="Revoke agent access"
                  className="shrink-0 rounded p-1 text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
                  onClick={() => void setAgentAccessGrant(entry.tabId, entry.sessionId, false, entry.label)}
                >
                  <HugeiconsIcon icon={Cancel01Icon} size={12} strokeWidth={2} />
                </button>
              </div>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
