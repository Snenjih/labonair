import { tool } from "ai";
import { z } from "zod";
import type { ToolContext } from "./context";

export function buildClaudeTools(ctx: ToolContext) {
  return {
    spawn_claude_session: tool({
      description: `Opens a Claude CLI session in a terminal tab. Use when the user asks to start/open claude in a terminal.
    - target "new": opens a new terminal tab
    - target "current": uses the currently active terminal
    - target <number>: uses terminal tab at that 1-based index (1 = first terminal)
    Lists available terminals automatically. The command defaults to "claude" but can be refined.`,
      inputSchema: z.object({
        target: z
          .union([
            z.literal("new"),
            z.literal("current"),
            z.number().int().min(1),
          ])
          .describe(
            'Where to open the session. "new" = new tab, "current" = active terminal, or 1-based index of a specific terminal.',
          ),
        command: z
          .string()
          .default("claude")
          .describe(
            'The full command to run. Defaults to "claude". Can include flags like "--model claude-opus-4-7" or a task like "claude \'fix the tests\'"',
          ),
      }),
      needsApproval: true,
      execute: async ({ target, command }) => {
        const cmd = command.endsWith("\n") ? command : `${command}\n`;

        if (target === "current") {
          if (ctx.getActiveTabKind() !== "workspace") {
            return {
              success: false,
              error: "No active terminal. Switch to a terminal tab first, or use target 'new'.",
            };
          }
          ctx.injectIntoActivePty(cmd);
          return { success: true, target: "current terminal", command: cmd.trimEnd() };
        }

        if (target === "new") {
          ctx.openTerminalWithCommand(cmd);
          return { success: true, target: "new terminal", command: cmd.trimEnd() };
        }

        // Numeric index — find the terminal tab at that 1-based position
        const tabs = ctx.getTerminalTabs();
        const tab = tabs.find((t) => t.index === target);
        if (!tab) {
          const available = tabs.map((t) => `${t.index}: ${t.label}`).join(", ");
          return {
            success: false,
            error: `No terminal at index ${target}. Available: ${available || "none"}`,
          };
        }
        ctx.injectIntoTerminal(tab.id, cmd);
        return {
          success: true,
          target: `terminal ${target} (${tab.label})`,
          command: cmd.trimEnd(),
        };
      },
    }),
  } as const;
}
