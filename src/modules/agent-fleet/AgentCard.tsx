import { forwardRef, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Cancel01Icon, Refresh01Icon, ArrowExpand01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { FleetAgentConfig } from "@/modules/tabs/types";
import type { FleetSession } from "./store/agentFleetStore";
import { useAgentFleetStore } from "./store/agentFleetStore";
import type { TerminalPaneHandle } from "@/modules/terminal";
import { TerminalPane } from "@/modules/terminal/TerminalPane";

type Rect = { x: number; y: number; w: number; h: number };

type AgentCardProps = {
  tabId: number;
  config: FleetAgentConfig;
  session: FleetSession | undefined;
  isVisible: boolean;
  slotRect: Rect | null;
  onFocus: () => void;
  onKill: () => void;
  onRestart: () => void;
  registerRef: (ref: TerminalPaneHandle | null) => void;
};

type DisplayStatus = "starting" | "running" | "idle" | "exited";

function StatusDot({ status }: { status: DisplayStatus }) {
  return (
    <span
      className={cn(
        "size-1.5 shrink-0 rounded-full",
        status === "running" && "bg-green-500",
        status === "idle" && "bg-yellow-500",
        status === "exited" && "bg-muted-foreground",
        status === "starting" && "animate-pulse bg-blue-500",
      )}
    />
  );
}

export const AgentCard = forwardRef<TerminalPaneHandle, AgentCardProps>(
  function AgentCard(
    { tabId, config, session, isVisible, slotRect, onFocus, onKill, onRestart, registerRef },
    _ref,
  ) {
    const [displayStatus, setDisplayStatus] = useState<DisplayStatus>("starting");

    useEffect(() => {
      if (!session) {
        setDisplayStatus("starting");
        return;
      }
      if (session.status === "exited") {
        setDisplayStatus("exited");
        return;
      }
      const tick = () => {
        if (!session || session.status === "exited") return;
        const idle = Date.now() - session.lastOutputAt > 2000;
        setDisplayStatus(idle ? "idle" : session.status === "running" ? "running" : "starting");
      };
      tick();
      const id = setInterval(tick, 2000);
      return () => clearInterval(id);
    }, [session]);

    const fullCommand =
      config.command + (config.extraFlags ? " " + config.extraFlags : "");

    return (
      <>
        {/* Header — absolute, always in slot area */}
        {slotRect && (
          <div
            style={{
              position: "absolute",
              left: slotRect.x,
              top: slotRect.y,
              width: slotRect.w,
              height: 32,
              zIndex: 20,
            }}
            className="flex items-center gap-1.5 border-b border-border/50 bg-card px-2"
          >
            <StatusDot status={displayStatus} />
            <span className="truncate text-xs font-medium">{config.label}</span>
            <span className="shrink-0 rounded bg-accent/60 px-1 py-0.5 text-[10px] text-muted-foreground">
              {config.tool}
            </span>
            <div className="ml-auto flex items-center gap-1">
              <button
                onClick={onFocus}
                title="Focus"
                className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <HugeiconsIcon icon={ArrowExpand01Icon} size={11} strokeWidth={1.75} />
              </button>
              {session?.status === "exited" ? (
                <button
                  onClick={onRestart}
                  title="Restart"
                  className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <HugeiconsIcon icon={Refresh01Icon} size={11} strokeWidth={1.75} />
                </button>
              ) : (
                <button
                  onClick={onKill}
                  title="Kill"
                  disabled={!session}
                  className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-destructive/20 hover:text-destructive disabled:opacity-40"
                >
                  <HugeiconsIcon icon={Cancel01Icon} size={11} strokeWidth={1.75} />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Terminal Pane */}
        {session && slotRect && (
          <div
            style={{
              position: "absolute",
              left: slotRect.x,
              top: slotRect.y + 32,
              width: slotRect.w,
              height: slotRect.h - 32,
            }}
          >
            <TerminalPane
              tabId={session.ptyId}
              visible={isVisible}
              initialCommand={fullCommand}
              onActivity={() =>
                useAgentFleetStore.getState().recordActivity(tabId, config.id)
              }
              onExit={(_, code) =>
                useAgentFleetStore.getState().setStatus(tabId, config.id, "exited", code)
              }
              ref={(h) => registerRef(h)}
            />
          </div>
        )}

        {/* Not started state */}
        {!session && slotRect && (
          <div
            style={{
              position: "absolute",
              left: slotRect.x,
              top: slotRect.y + 32,
              width: slotRect.w,
              height: slotRect.h - 32,
            }}
            className="flex items-center justify-center"
          >
            <button
              onClick={onRestart}
              className="text-xs text-muted-foreground underline hover:text-foreground"
            >
              Start agent
            </button>
          </div>
        )}
      </>
    );
  },
);
