import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { AgentFleetTab } from "@/modules/tabs/types";
import { useTabsStore } from "@/modules/tabs";
import { useAgentFleetStore } from "./store/agentFleetStore";
import { AgentCard } from "./AgentCard";
import { AgentLaunchDialog } from "./AgentLaunchDialog";
import type { TerminalPaneHandle } from "@/modules/terminal";

type Props = {
  tab: AgentFleetTab;
  visible: boolean;
};

export function AgentFleetPane({ tab, visible }: Props) {
  const [launchDialogOpen, setLaunchDialogOpen] = useState(false);
  const slotRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [slotRects, setSlotRects] = useState<
    Map<string, { x: number; y: number; w: number; h: number }>
  >(new Map());
  const terminalRefs = useRef<Map<string, TerminalPaneHandle>>(new Map());
  const containerRef = useRef<HTMLDivElement>(null);
  const broadcastBarRef = useRef<HTMLInputElement>(null);

  // Reactive session data
  const sessions = useAgentFleetStore((s) => s.sessions[tab.id] ?? {});

  const updateRects = () => {
    const container = containerRef.current;
    if (!container) return;
    const containerRect = container.getBoundingClientRect();
    const scrollTop = container.scrollTop;
    const next = new Map<string, { x: number; y: number; w: number; h: number }>();
    for (const [configId, slotEl] of slotRefs.current) {
      const r = slotEl.getBoundingClientRect();
      next.set(configId, {
        x: r.left - containerRect.left,
        y: r.top - containerRect.top + scrollTop,
        w: r.width,
        h: r.height,
      });
    }
    setSlotRects(next);
  };

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(updateRects);
    ro.observe(container);
    for (const slotEl of slotRefs.current.values()) {
      ro.observe(slotEl);
    }
    updateRects();
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab.agents]);

  // Launch agents that have no session yet
  useEffect(() => {
    const store = useAgentFleetStore.getState();
    for (const config of tab.agents) {
      const tabSessions = store.sessions[tab.id] ?? {};
      if (!tabSessions[config.id]) {
        store.launchAgent(tab.id, config.id, config.command, config.cwd);
      }
    }
  }, [tab.id, tab.agents]);

  // Update tab title based on running agent count
  useEffect(() => {
    const update = () => {
      const storeSessions = useAgentFleetStore.getState().sessions[tab.id] ?? {};
      const total = tab.agents.length;
      const running = Object.values(storeSessions).filter(
        (s) => s.status !== "exited",
      ).length;
      useTabsStore
        .getState()
        .updateFleetTabTitle(
          tab.id,
          total > 0 ? `Fleet (${running}/${total})` : "Fleet",
        );
    };
    update();
    return useAgentFleetStore.subscribe(update);
  }, [tab.id, tab.agents]);

  // Custom event listener for fleet actions
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as string;
      if (detail === "launch") setLaunchDialogOpen(true);
      if (detail === "broadcast-focus") broadcastBarRef.current?.focus();
    };
    window.addEventListener("nexum:fleet-action", handler);
    return () => window.removeEventListener("nexum:fleet-action", handler);
  }, []);

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border/50 px-3">
        <span className="text-xs font-medium text-foreground">Agent Fleet</span>
        <div className="ml-auto flex items-center gap-1">
          {/* View Mode Toggle */}
          <button
            onClick={() =>
              useTabsStore.getState().updateFleetViewMode(tab.id, "grid")
            }
            className={cn(
              "rounded px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
              tab.viewMode === "grid" && "bg-accent text-foreground",
            )}
          >
            Grid
          </button>
          <button
            onClick={() =>
              useTabsStore.getState().updateFleetViewMode(tab.id, "focus")
            }
            className={cn(
              "rounded px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
              tab.viewMode === "focus" && "bg-accent text-foreground",
            )}
          >
            Focus
          </button>
          <button
            onClick={() => setLaunchDialogOpen(true)}
            className="ml-1 rounded border border-border/60 px-2 py-1 text-xs text-foreground transition-colors hover:bg-accent"
          >
            + Agent
          </button>
        </div>
      </div>

      {/* Content Area */}
      {tab.agents.length === 0 ? (
        /* Empty State */
        <div className="flex flex-1 flex-col items-center justify-center gap-3">
          <p className="text-sm text-muted-foreground">No agents running</p>
          <button
            onClick={() => setLaunchDialogOpen(true)}
            className="rounded border border-border/60 px-3 py-1.5 text-xs hover:bg-accent"
          >
            Launch your first agent
          </button>
        </div>
      ) : (
        /* Grid/Focus Content — relative container with TWO LAYERS */
        <div
          ref={containerRef}
          className={cn(
            "relative min-h-0 flex-1",
            tab.agents.length > 4 && "overflow-y-auto",
          )}
        >
          {/* SLOT LAYER (z-0): CSS Grid with invisible slot bodies */}
          <div
            className="pointer-events-none w-full"
            style={{
              display: "grid",
              gridTemplateColumns:
                tab.viewMode === "focus" ? "1fr" : "repeat(2, 1fr)",
              gridAutoRows:
                tab.viewMode === "focus" ? "100%" : "minmax(200px, 1fr)",
              height: tab.viewMode === "focus" ? "100%" : undefined,
            }}
          >
            {tab.agents.map((config) => {
              const isFocused =
                tab.viewMode === "focus" &&
                (tab.focusedAgentId ?? tab.agents[0]?.id) === config.id;
              if (tab.viewMode === "focus" && !isFocused) return null;
              return (
                <div
                  key={config.id}
                  ref={(el) => {
                    if (el) slotRefs.current.set(config.id, el);
                    else slotRefs.current.delete(config.id);
                  }}
                  className="border-b border-r border-border/30"
                  style={{ minHeight: 200 }}
                />
              );
            })}
          </div>

          {/* TERMINAL LAYER (z-10): Flat absolute AgentCards */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{ zIndex: 1 }}
          >
            {tab.agents.map((config) => {
              const session = sessions[config.id];
              const focusedId = tab.focusedAgentId ?? tab.agents[0]?.id;
              const isVisible =
                visible &&
                (tab.viewMode === "grid" ||
                  (tab.viewMode === "focus" && focusedId === config.id));
              const slotRect = slotRects.get(config.id) ?? null;
              return (
                <div
                  key={session?.ptyId ?? config.id}
                  className="pointer-events-auto"
                >
                  <AgentCard
                    tabId={tab.id}
                    config={config}
                    session={session}
                    isVisible={isVisible}
                    slotRect={slotRect}
                    onFocus={() => {
                      useTabsStore
                        .getState()
                        .updateFleetViewMode(tab.id, "focus");
                      useTabsStore
                        .getState()
                        .setFocusedAgent(tab.id, config.id);
                    }}
                    onKill={() => {
                      terminalRefs.current.get(config.id)?.write("\x03");
                      setTimeout(
                        () =>
                          terminalRefs.current.get(config.id)?.write("exit\n"),
                        100,
                      );
                    }}
                    onRestart={() => {
                      const store = useAgentFleetStore.getState();
                      store.restartAgent(
                        tab.id,
                        config.id,
                        config.command,
                        config.cwd,
                      );
                    }}
                    registerRef={(ref) => {
                      if (ref) terminalRefs.current.set(config.id, ref);
                      else terminalRefs.current.delete(config.id);
                    }}
                  />
                </div>
              );
            })}
          </div>

          {/* Focus Mode Chip Switcher */}
          {tab.viewMode === "focus" && tab.agents.length > 1 && (
            <div className="absolute bottom-0 left-0 right-0 z-20 flex items-center gap-1 border-t border-border/50 bg-card/90 px-2 py-1 backdrop-blur">
              {tab.agents.map((config) => {
                const session = sessions[config.id];
                const focusedId = tab.focusedAgentId ?? tab.agents[0]?.id;
                const isFocused = focusedId === config.id;
                return (
                  <button
                    key={config.id}
                    onClick={() =>
                      useTabsStore.getState().setFocusedAgent(tab.id, config.id)
                    }
                    className={cn(
                      "flex items-center gap-1 rounded px-2 py-0.5 text-xs",
                      isFocused
                        ? "bg-accent text-foreground"
                        : "text-muted-foreground hover:bg-accent/50",
                    )}
                  >
                    <span
                      className={cn(
                        "size-1.5 shrink-0 rounded-full",
                        session?.status === "running"
                          ? "bg-green-500"
                          : session?.status === "idle"
                            ? "bg-yellow-500"
                            : session?.status === "exited"
                              ? "bg-muted-foreground"
                              : "bg-blue-500",
                      )}
                    />
                    {config.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Launch Dialog */}
      <AgentLaunchDialog
        open={launchDialogOpen}
        onClose={() => setLaunchDialogOpen(false)}
        activeFleetTabId={tab.id}
        defaultCwd={tab.agents[0]?.cwd}
      />
    </div>
  );
}
