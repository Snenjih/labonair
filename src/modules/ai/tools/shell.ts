import { tool } from "ai";
import { z } from "zod";
import { invoke } from "@tauri-apps/api/core";
import { native } from "../lib/native";
import { checkShellCommand } from "../lib/security";
import type { ToolContext } from "./context";

/**
 * Per-session lazy shell-session id. The agent gets one persistent shell per
 * chat session, so cwd survives across tool calls (cd, mkdir+cd, etc).
 * Stored as Promise<number> so concurrent first calls share one creation.
 */
const sessionShells = new Map<string, Promise<number>>();

async function isShellAlive(shellId: number): Promise<boolean> {
  try {
    const r = await native.shellSessionRun(shellId, "echo __nx_ok__", 3);
    return r.exit_code === 0 && r.stdout.includes("__nx_ok__");
  } catch {
    return false;
  }
}

async function getSessionShell(
  sessionId: string,
  cwd: string | null,
): Promise<number> {
  const existing = sessionShells.get(sessionId);
  if (existing !== undefined) {
    try {
      const shellId = await existing;
      if (await isShellAlive(shellId)) return shellId;
    } catch {
      // Previous creation failed; fall through
    }
    sessionShells.delete(sessionId);
  }
  const p = native.shellSessionOpen(cwd);
  sessionShells.set(sessionId, p);
  return p;
}

/** Remove a session's cached shell on session delete (cleanup only; shell exits naturally). */
export function clearSessionShell(sessionId: string): void {
  sessionShells.delete(sessionId);
}

export function buildShellTools(ctx: ToolContext) {
  return {
    bash_run: tool({
      description:
        "Run a foreground shell command in this session's persistent agent shell. cwd persists across calls (so `cd foo` then `bash_run pwd` works). Use for short-lived commands (lint, test, search, build). For long-running or daemon processes (dev servers, watch tasks), use `bash_background`. NEVER invoke interactive tools (vim, less, top) — they will hang. Asks for user approval.",
      inputSchema: z.object({
        command: z.string(),
        timeout_secs: z.number().int().min(1).max(300).optional(),
      }),
      needsApproval: true,
      execute: async ({ command, timeout_secs }) => {
        const safety = checkShellCommand(command);
        if (!safety.ok) return { error: safety.reason };

        // Route through the active SSH session when user is in a remote tab.
        const sshTabId = ctx.getActiveSshTabId();
        if (sshTabId) {
          try {
            const r = await invoke<{ stdout: string; stderr: string; exit_code: number }>(
              "ssh_exec_command",
              { tabId: sshTabId, command },
            );
            return {
              command,
              stdout: r.stdout,
              stderr: r.stderr,
              exit_code: r.exit_code,
              remote: true,
            };
          } catch (e) {
            return { error: String(e) };
          }
        }

        const sid = ctx.getSessionId();
        if (!sid) return { error: "no active chat session" };
        try {
          const shellId = await getSessionShell(sid, ctx.getCwd());
          const r = await native.shellSessionRun(shellId, command, timeout_secs);
          return {
            command,
            stdout: r.stdout,
            stderr: r.stderr,
            exit_code: r.exit_code,
            timed_out: r.timed_out,
            truncated: r.truncated,
            cwd_after: r.cwd_after,
          };
        } catch (e) {
          return { error: String(e) };
        }
      },
    }),

    bash_background: tool({
      description:
        "Spawn a long-running background process (e.g. `pnpm dev`, `cargo watch`, log tailers). Returns a handle; use `bash_logs` to read its output and `bash_kill` to stop it. Output is captured into a 4MB ring buffer. Asks for user approval.",
      inputSchema: z.object({
        command: z.string(),
        cwd: z.string().nullable().optional(),
      }),
      needsApproval: true,
      execute: async ({ command, cwd }) => {
        const safety = checkShellCommand(command);
        if (!safety.ok) return { error: safety.reason };
        const effectiveCwd = cwd ?? ctx.getCwd();
        try {
          const handle = await native.shellBgSpawn(command, effectiveCwd);
          return { handle, command, cwd: effectiveCwd, ok: true };
        } catch (e) {
          return { error: String(e) };
        }
      },
    }),

    bash_logs: tool({
      description:
        "Read accumulated logs from a `bash_background` process. Pass `since_offset` from the previous response's `next_offset` to tail incrementally. `dropped` reports bytes evicted by the ring buffer.",
      inputSchema: z.object({
        handle: z.number().int(),
        since_offset: z.number().int().optional(),
      }),
      execute: async ({ handle, since_offset }) => {
        try {
          const r = await native.shellBgLogs(handle, since_offset);
          return r;
        } catch (e) {
          return { error: String(e) };
        }
      },
    }),

    bash_list: tool({
      description:
        "List all background processes spawned by `bash_background` in this app — running and exited. **Always call this BEFORE spawning a new long-running process** (especially dev servers like `pnpm dev`, `next dev`, `vite`) to avoid duplicates. If a matching process is already running, reuse it (call `open_preview` again instead of respawning). Auto-executes.",
      inputSchema: z.object({}),
      execute: async () => {
        try {
          const list = await native.shellBgList();
          return { processes: list };
        } catch (e) {
          return { error: String(e) };
        }
      },
    }),

    bash_kill: tool({
      description:
        "Terminate a `bash_background` process by handle. Idempotent — kills nothing if the handle is unknown or already exited.",
      inputSchema: z.object({ handle: z.number().int() }),
      execute: async ({ handle }) => {
        try {
          await native.shellBgKill(handle);
          return { handle, ok: true };
        } catch (e) {
          return { error: String(e) };
        }
      },
    }),
  } as const;
}
