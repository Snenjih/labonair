import { useEffect, useRef, useState } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";
import type { Layout } from "react-resizable-panels";
import { cn } from "@/lib/utils";
import type { AgentFleetTab } from "@/modules/tabs/types";
import { useTabsStore } from "@/modules/tabs";
import { useAgentFleetStore } from "./store/agentFleetStore";
import type { FleetSession } from "./store/agentFleetStore";
import { AgentCard } from "./AgentCard";
import { AgentLaunchDialog } from "./AgentLaunchDialog";
import { BroadcastBar } from "./BroadcastBar";
import type { TerminalPaneHandle } from "@/modules/terminal";

const EMPTY_SESSIONS: Record<string, FleetSession> = {};

type Props = {
  tab: AgentFleetTab;
  visible: boolean;
};

function computeGridDims(n: number): { cols: number; rows: number } {
  if (n <= 1) return { cols: 1, rows: 1 };
  if (n === 2) return { cols: 2, rows: 1 };
  if (n <= 4) return { cols: 2, rows: 2 };
  if (n <= 6) return { cols: 3, rows: 2 };
  const cols = Math.ceil(Math.sqrt(n));
  return { cols, rows: Math.ceil(n / cols) };
}

function equalSize(count: number): number {
  return 100 / count;
}

function rowPanelId(tabId: number, rowIdx: number): string {
  return `fleet-${tabId}-row-${rowIdx}`;
}

function agentPanelId(tabId: number, configId: string): string {
  return `fleet-${tabId}-agent-${configId}`;
}

export function AgentFleetPane({ tab, visible }: Props) {
  const [launchDialogOpen, setLaunchDialogOpen] = useState(false);
  const terminalRefs = useRef<Map<string, TerminalPaneHandle>>(new Map());
  const broadcastBarRef = useRef<HTMLInputElement>(null);

  const sessions = useAgentFleetStore((s) => s.sessions[tab.id] ?? EMPTY_SESSIONS);

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
      const newTitle = total > 0 ? `Fleet (${running}/${total})` : "Fleet";
      const current = useTabsStore.getState().tabs.find((t) => t.id === tab.id);
      if (current && current.title !== newTitle) {
        useTabsStore.getState().updateFleetTabTitle(tab.id, newTitle);
      }
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

  const { cols, rows } = computeGridDims(tab.agents.length);

  const agentRows = Array.from({ length: rows }, (_, r) =>
    tab.agents.slice(r * cols, (r + 1) * cols),
  );

  // Build defaultLayout for the vertical (rows) group
  function buildRowLayout(): Layout {
    const stored = tab.panelSizes?.rowSizes;
    const layout: Layout = {};
    for (let r = 0; r < rows; r++) {
      const id = rowPanelId(tab.id, r);
      layout[id] = stored?.length === rows ? (stored[r] ?? equalSize(rows)) : equalSize(rows);
    }
    return layout;
  }

  // Build defaultLayout for a horizontal (cols) group in a row
  function buildColLayout(rowIdx: number, rowAgents: typeof agentRows[0]): Layout {
    const stored = tab.panelSizes?.colSizes[rowIdx];
    const layout: Layout = {};
    rowAgents.forEach((config, colIdx) => {
      const id = agentPanelId(tab.id, config.id);
      layout[id] = stored?.length === rowAgents.length
        ? (stored[colIdx] ?? equalSize(rowAgents.length))
        : equalSize(rowAgents.length);
    });
    return layout;
  }

  function handleRowLayoutChanged(layout: Layout) {
    const rowSizes = agentRows.map((_, r) => layout[rowPanelId(tab.id, r)] ?? equalSize(rows));
    const existing = (
      useTabsStore.getState().tabs.find((t) => t.id === tab.id) as AgentFleetTab | undefined
    )?.panelSizes;
    useTabsStore.getState().updateFleetPanelSizes(tab.id, rowSizes, existing?.colSizes ?? []);
  }

  function handleColLayoutChanged(rowIdx: number, rowAgents: typeof agentRows[0], layout: Layout) {
    const colSizes = rowAgents.map((config) =>
      layout[agentPanelId(tab.id, config.id)] ?? equalSize(rowAgents.length),
    );
    const existing = (
      useTabsStore.getState().tabs.find((t) => t.id === tab.id) as AgentFleetTab | undefined
    )?.panelSizes;
    const newColSizes = [...(existing?.colSizes ?? [])];
    newColSizes[rowIdx] = colSizes;
    useTabsStore.getState().updateFleetPanelSizes(
      tab.id,
      existing?.rowSizes ?? Array<number>(rows).fill(equalSize(rows)),
      newColSizes,
    );
  }

  function makeAgentHandlers(config: (typeof tab.agents)[0]) {
    return {
      onFocus: () => {
        useTabsStore.getState().updateFleetViewMode(tab.id, "focus");
        useTabsStore.getState().setFocusedAgent(tab.id, config.id);
      },
      onKill: () => {
        terminalRefs.current.get(config.id)?.write("\x03");
        setTimeout(() => terminalRefs.current.get(config.id)?.write("exit\n"), 100);
      },
      onRestart: () => {
        useAgentFleetStore
          .getState()
          .restartAgent(tab.id, config.id, config.command, config.cwd);
      },
      onClose: () => {
        const ref = terminalRefs.current.get(config.id);
        if (ref) {
          ref.write("\x03");
          setTimeout(() => ref.write("exit\n"), 100);
        }
        setTimeout(() => {
          useAgentFleetStore.getState().removeSession(tab.id, config.id);
          useTabsStore.getState().removeFleetAgent(tab.id, config.id);
          terminalRefs.current.delete(config.id);
        }, 200);
      },
      registerRef: (ref: TerminalPaneHandle | null) => {
        if (ref) terminalRefs.current.set(config.id, ref);
        else terminalRefs.current.delete(config.id);
      },
    };
  }

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border/50 px-3">
        <span className="text-xs font-medium text-foreground">Agent Fleet</span>
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => useTabsStore.getState().updateFleetViewMode(tab.id, "grid")}
            className={cn(
              "rounded px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
              tab.viewMode === "grid" && "bg-accent text-foreground",
            )}
          >
            Grid
          </button>
          <button
            onClick={() => useTabsStore.getState().updateFleetViewMode(tab.id, "focus")}
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
        <div className="flex flex-1 flex-col items-center justify-center gap-3">
          <p className="text-sm text-muted-foreground">No agents running</p>
          <button
            onClick={() => setLaunchDialogOpen(true)}
            className="rounded border border-border/60 px-3 py-1.5 text-xs hover:bg-accent"
          >
            Launch your first agent
          </button>
        </div>
      ) : tab.viewMode === "focus" ? (
        /* Focus Mode — single agent full-screen */
        <div className="relative min-h-0 flex-1">
          {tab.agents.map((config) => {
            const session = sessions[config.id];
            const focusedId = tab.focusedAgentId ?? tab.agents[0]?.id;
            const isFocused = focusedId === config.id;
            const handlers = makeAgentHandlers(config);
            return (
              <div
                key={session?.ptyId ?? config.id}
                className={cn("absolute inset-0", !isFocused && "hidden")}
              >
                <AgentCard
                  tabId={tab.id}
                  config={config}
                  session={session}
                  isVisible={visible && isFocused}
                  {...handlers}
                />
              </div>
            );
          })}

          {/* Focus Mode Chip Switcher */}
          {tab.agents.length > 1 && (
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
      ) : (
        /* Grid Mode — resizable panel grid */
        <div className="min-h-0 flex-1">
          <Group
            orientation="vertical"
            className="flex h-full w-full flex-col"
            defaultLayout={buildRowLayout()}
            onLayoutChanged={handleRowLayoutChanged}
          >
            {agentRows.map((rowAgents, rowIdx) => (
              <>
                {rowIdx > 0 && (
                  <Separator
                    key={`row-sep-${rowIdx}`}
                    className="h-1 w-full shrink-0 cursor-row-resize bg-border/40 transition-colors hover:bg-border"
                  />
                )}
                <Panel
                  key={rowPanelId(tab.id, rowIdx)}
                  id={rowPanelId(tab.id, rowIdx)}
                  defaultSize={equalSize(rows)}
                  minSize={5}
                >
                  <Group
                    orientation="horizontal"
                    className="flex h-full w-full"
                    defaultLayout={buildColLayout(rowIdx, rowAgents)}
                    onLayoutChanged={(layout) =>
                      handleColLayoutChanged(rowIdx, rowAgents, layout)
                    }
                  >
                    {rowAgents.map((config, colIdx) => {
                      const session = sessions[config.id];
                      const handlers = makeAgentHandlers(config);
                      return (
                        <>
                          {colIdx > 0 && (
                            <Separator
                              key={`col-sep-${config.id}`}
                              className="w-1 shrink-0 cursor-col-resize bg-border/40 transition-colors hover:bg-border"
                            />
                          )}
                          <Panel
                            key={agentPanelId(tab.id, config.id)}
                            id={agentPanelId(tab.id, config.id)}
                            defaultSize={equalSize(rowAgents.length)}
                            minSize={10}
                          >
                            <AgentCard
                              tabId={tab.id}
                              config={config}
                              session={session}
                              isVisible={visible}
                              {...handlers}
                            />
                          </Panel>
                        </>
                      );
                    })}
                  </Group>
                </Panel>
              </>
            ))}
          </Group>
        </div>
      )}

      {/* Broadcast Bar */}
      {tab.agents.length > 0 && (
        <BroadcastBar
          configs={tab.agents}
          sessions={sessions}
          terminalRefs={terminalRefs.current}
          inputRef={broadcastBarRef}
        />
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
