import { useState } from "react";
import { cn } from "@/lib/utils";
import type { FleetAgentConfig } from "@/modules/tabs/types";
import type { FleetSession } from "./store/agentFleetStore";
import type { TerminalPaneHandle } from "@/modules/terminal";
import { usePreferencesStore } from "@/modules/settings/preferences";

type Props = {
  configs: FleetAgentConfig[];
  sessions: Record<string, FleetSession>;
  terminalRefs: Map<string, TerminalPaneHandle>;
  inputRef?: React.RefObject<HTMLInputElement | null>;
};

export function BroadcastBar({ configs, sessions, terminalRefs, inputRef }: Props) {
  const [selected, setSelected] = useState<Set<string>>(
    () =>
      new Set(
        configs
          .filter((c) => sessions[c.id]?.status !== "exited")
          .map((c) => c.id),
      ),
  );
  const [input, setInput] = useState("");
  const autoEnter = usePreferencesStore((s) => s.agentFleetBroadcastAutoEnter);

  const broadcast = () => {
    if (!input.trim()) return;
    const text = autoEnter ? (input.endsWith("\n") ? input : input + "\n") : input;
    for (const configId of selected) {
      const session = sessions[configId];
      if (!session || session.status === "exited") continue;
      terminalRefs.get(configId)?.write(text);
    }
    setInput("");
  };

  const toggleAll = () => {
    const nonExited = configs
      .filter((c) => sessions[c.id]?.status !== "exited")
      .map((c) => c.id);
    setSelected(new Set(nonExited));
  };

  const toggleNone = () => {
    setSelected(new Set());
  };

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-border/50 bg-card px-2 py-1.5">
      <span className="text-xs text-muted-foreground">Broadcast:</span>

      {/* Agent checkboxes */}
      <div className="flex flex-wrap items-center gap-1">
        {configs.map((config) => {
          const isExited = sessions[config.id]?.status === "exited";
          const isChecked = selected.has(config.id);
          return (
            <label
              key={config.id}
              className={cn(
                "flex cursor-pointer items-center gap-1 rounded px-1.5 py-0.5 text-xs transition-colors",
                isExited
                  ? "cursor-not-allowed text-muted-foreground/50"
                  : isChecked
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:bg-accent/50",
              )}
            >
              <input
                type="checkbox"
                checked={isChecked}
                disabled={isExited}
                onChange={(e) => {
                  setSelected((prev) => {
                    const next = new Set(prev);
                    if (e.target.checked) next.add(config.id);
                    else next.delete(config.id);
                    return next;
                  });
                }}
                className="sr-only"
              />
              <span
                className={cn(
                  "size-1.5 shrink-0 rounded-full",
                  isExited
                    ? "bg-muted-foreground/40"
                    : isChecked
                      ? "bg-green-500"
                      : "bg-muted-foreground/40",
                )}
              />
              {config.label}
            </label>
          );
        })}
      </div>

      {/* All / None buttons */}
      <button
        onClick={toggleAll}
        className="rounded px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        All
      </button>
      <button
        onClick={toggleNone}
        className="rounded px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        None
      </button>

      {/* Input */}
      <input
        ref={inputRef}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            broadcast();
          }
        }}
        placeholder="Type and press Enter to broadcast…"
        className="min-w-0 flex-1 rounded border border-border/60 bg-background px-2 py-0.5 text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-ring"
      />

      {/* Send button */}
      <button
        onClick={broadcast}
        disabled={!input.trim() || selected.size === 0}
        className="shrink-0 rounded border border-border/60 px-2 py-0.5 text-xs text-foreground transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
      >
        Send ↵
      </button>
    </div>
  );
}
