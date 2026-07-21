import { Cancel01Icon, ShieldUserIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { setAgentAccessGrant, useAgentAccessStore, useTabsStore } from "@/modules/tabs";

/** Header badge listing SSH tabs the user has granted MCP agent access to
 *  (see `TabBar.tsx`'s "Grant AI Agent Access" checkbox and
 *  `agentAccessStore.ts`) — lets the user see, jump to, and revoke access at
 *  a glance, mirroring `JumpHostDropdown`'s layout. Hidden entirely when
 *  nothing is granted, same as that component. */
export function AgentAccessBadge() {
  const bridgeEnabled = useAgentAccessStore((s) => s.bridgeEnabled);
  const entries = useAgentAccessStore((s) => s.entries);
  const list = Object.values(entries);
  if (!bridgeEnabled || list.length === 0) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative size-7 shrink-0 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          title="AI Agent Access"
        >
          <HugeiconsIcon icon={ShieldUserIcon} size={16} strokeWidth={1.75} />
          <span
            className={cn(
              "absolute -top-0.5 -right-0.5 min-w-[14px] h-3.5 px-0.5 rounded-full text-[9px] font-bold",
              "flex items-center justify-center text-white bg-primary",
            )}
          >
            {list.length}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[320px] p-0 max-h-[420px] flex flex-col">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
          <span className="text-sm font-semibold">AI Agent Access</span>
        </div>
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
      </PopoverContent>
    </Popover>
  );
}
