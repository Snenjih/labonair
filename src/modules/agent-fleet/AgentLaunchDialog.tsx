import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { AgentTool, FleetAgentConfig } from "@/modules/tabs/types";
import { useTabsStore } from "@/modules/tabs";
import { useAgentFleetStore } from "./store/agentFleetStore";
import { usePreferencesStore } from "@/modules/settings/preferences";

type Props = {
  open: boolean;
  onClose: () => void;
  activeFleetTabId: number | null;
  defaultCwd?: string;
};

const TOOLS: { id: AgentTool; label: string; defaultCmd: string }[] = [
  {
    id: "claude",
    label: "Claude Code",
    defaultCmd: "claude --dangerously-skip-permissions",
  },
  { id: "codex", label: "Codex", defaultCmd: "codex" },
  { id: "open-code", label: "Open Code", defaultCmd: "open-code" },
  { id: "aider", label: "Aider", defaultCmd: "aider" },
  { id: "custom", label: "Custom…", defaultCmd: "" },
];

const INPUT_CLASS =
  "h-8 w-full rounded border border-border/60 bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring";

export function AgentLaunchDialog({
  open,
  onClose,
  activeFleetTabId,
  defaultCwd,
}: Props) {
  const fleetDefaultPath = usePreferencesStore((s) => s.agentFleetDefaultPath);

  const [selectedTool, setSelectedTool] = useState<AgentTool>("claude");
  const [label, setLabel] = useState("");
  const [cwd, setCwd] = useState(defaultCwd ?? fleetDefaultPath);
  const [extraFlags, setExtraFlags] = useState("");
  const [customCommand, setCustomCommand] = useState("");

  const availableTools = useAgentFleetStore((s) => s.availableTools);

  // Detect tools on dialog open
  useEffect(() => {
    if (open) {
      useAgentFleetStore.getState().detectTools();
    }
  }, [open]);

  // Update cwd when defaultCwd or the settings default path changes
  useEffect(() => {
    setCwd(defaultCwd ?? fleetDefaultPath);
  }, [defaultCwd, fleetDefaultPath]);

  // Auto-label when tool changes
  useEffect(() => {
    if (activeFleetTabId === null) return;
    const tab = useTabsStore
      .getState()
      .tabs.find((t) => t.id === activeFleetTabId);
    if (tab?.kind !== "agent-fleet") return;
    const count = tab.agents.filter((a) => a.tool === selectedTool).length + 1;
    setLabel(`${selectedTool}-${count}`);
  }, [selectedTool, activeFleetTabId]);

  const computedCommand =
    selectedTool === "custom"
      ? customCommand
      : (TOOLS.find((t) => t.id === selectedTool)?.defaultCmd ?? selectedTool);

  const addToFleet = () => {
    if (activeFleetTabId === null) return;
    const config: FleetAgentConfig = {
      id: crypto.randomUUID(),
      tool: selectedTool,
      label: label || `${selectedTool}-1`,
      command: computedCommand,
      cwd: cwd || "",
      extraFlags,
    };
    useTabsStore.getState().addFleetAgent(activeFleetTabId, config);
    useAgentFleetStore
      .getState()
      .launchAgent(activeFleetTabId, config.id, config.command, config.cwd);
    onClose();
  };

  const newFleetTab = () => {
    const config: FleetAgentConfig = {
      id: crypto.randomUUID(),
      tool: selectedTool,
      label: label || `${selectedTool}-1`,
      command: computedCommand,
      cwd: cwd || "",
      extraFlags,
    };
    const tabId = useTabsStore.getState().newAgentFleetTab(cwd || undefined);
    useTabsStore.getState().addFleetAgent(tabId, config);
    useAgentFleetStore
      .getState()
      .launchAgent(tabId, config.id, config.command, config.cwd);
    useTabsStore.getState().setActiveId(tabId);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Launch Agent</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {/* Tool Picker */}
          <div className="grid grid-cols-5 gap-1.5">
            {TOOLS.map((tool) => {
              const avail = availableTools[tool.id];
              const isChecking = avail === "checking";
              const isAvail = avail === true || tool.id === "custom";
              const isUnavail = avail === false;
              return (
                <button
                  key={tool.id}
                  disabled={isUnavail}
                  onClick={() => setSelectedTool(tool.id)}
                  title={
                    isUnavail
                      ? `${tool.label} not found in PATH`
                      : undefined
                  }
                  className={cn(
                    "flex flex-col items-center gap-1 rounded border p-2 text-center text-[10px] transition-colors",
                    selectedTool === tool.id
                      ? "border-foreground bg-accent"
                      : "border-border/60 hover:bg-accent/50",
                    isUnavail && "cursor-not-allowed opacity-40",
                  )}
                >
                  <span className="font-medium">{tool.label}</span>
                  <span
                    className={cn(
                      "text-[9px]",
                      isAvail
                        ? "text-green-500"
                        : isUnavail
                          ? "text-destructive"
                          : "text-muted-foreground",
                    )}
                  >
                    {isChecking ? "…" : isUnavail ? "not found" : isAvail ? "✓" : "–"}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Label */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">Label</label>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className={INPUT_CLASS}
              placeholder="e.g. claude-1"
            />
          </div>

          {/* CWD */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground">
              Working Directory
            </label>
            <input
              value={cwd}
              onChange={(e) => setCwd(e.target.value)}
              className={INPUT_CLASS}
              placeholder="~/projekte/..."
            />
          </div>

          {/* Extra Flags (not shown for custom) */}
          {selectedTool !== "custom" && (
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">
                Extra Flags
              </label>
              <input
                value={extraFlags}
                onChange={(e) => setExtraFlags(e.target.value)}
                className={INPUT_CLASS}
                placeholder="--model claude-opus-4"
              />
            </div>
          )}

          {/* Custom Command */}
          {selectedTool === "custom" && (
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground">Command</label>
              <input
                value={customCommand}
                onChange={(e) => setCustomCommand(e.target.value)}
                className={INPUT_CLASS}
                placeholder="my-agent --flag"
              />
            </div>
          )}
        </div>

        <DialogFooter className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={newFleetTab}
            disabled={!computedCommand}
          >
            New Fleet Tab
          </Button>
          <Button
            size="sm"
            onClick={addToFleet}
            disabled={!computedCommand || activeFleetTabId === null}
          >
            Add to Fleet
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
