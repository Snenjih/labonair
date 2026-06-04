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
    The prompt (task description) is passed as a separate field and will be automatically quoted.
    Use flags for CLI options like --model.`,
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
        flags: z
          .string()
          .optional()
          .describe(
            'Optional CLI flags to pass, e.g. "--model claude-opus-4-7" or "--no-cache". Do NOT include the prompt here.',
          ),
        prompt: z
          .string()
          .optional()
          .describe(
            'Optional task/prompt for Claude, e.g. "fix the failing tests". Will be safely quoted. Omit to just open an interactive session.',
          ),
      }),
      needsApproval: true,
      execute: async ({ target, flags, prompt }) => {
        // Build the command: claude [flags] ["prompt"]
        const parts = ["claude"];
        if (flags?.trim()) parts.push(flags.trim());
        if (prompt?.trim()) {
          // Escape any double quotes inside the prompt, then wrap in double quotes.
          parts.push(`"${prompt.trim().replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`);
        }
        const cmd = parts.join(" ") + "\n";

        if (target === "current") {
          if (ctx.getActiveTabKind() !== "workspace") {
            return {
              success: false,
              error: "No active terminal. Switch to a terminal tab first, or use target 'new'.",
            };
          }
          ctx.injectIntoActivePty(cmd);
          return { success: true, target: "current terminal", command: cmd.trim() };
        }

        if (target === "new") {
          ctx.openTerminalWithCommand(cmd);
          return { success: true, target: "new terminal", command: cmd.trim() };
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
          command: cmd.trim(),
        };
      },
    }),
  } as const;
}
