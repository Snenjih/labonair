import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useRef } from "react";
import type { WorkspaceTab } from "@/modules/tabs";
import type { TerminalPaneHandle } from "@/modules/terminal";
import type { CommandSnippet, SnippetExecMode } from "../types";
import { useCommandSnippetsStore } from "../store/commandSnippetsStore";
import { newRunId } from "./snippetUtils";

interface UseSnippetExecOptions {
  tabs: WorkspaceTab[];
  activeTerminalRef: () => TerminalPaneHandle | null;
  onNewLocalTab: (cwd?: string, command?: string) => void;
  onNewSshTab: (hostId: string, title: string, cwd?: string, command?: string) => void;
  onOpenLogDrawer: () => void;
}

export function useSnippetExec({
  tabs,
  activeTerminalRef,
  onNewLocalTab,
  onNewSshTab,
  onOpenLogDrawer,
}: UseSnippetExecOptions) {
  const addRunLog = useCommandSnippetsStore((s) => s.addRunLog);
  const updateRunLog = useCommandSnippetsStore((s) => s.updateRunLog);
  const appendRunLine = useCommandSnippetsStore((s) => s.appendRunLine);

  // Track active run listeners so we can clean up
  const cleanupRef = useRef<Map<string, () => void>>(new Map());

  useEffect(() => {
    return () => {
      for (const cleanup of cleanupRef.current.values()) cleanup();
    };
  }, []);

  const registerRunListeners = useCallback(
    (runId: string) => {
      const outPromise = listen<{ runId: string; data: string; stream: "stdout" | "stderr" }>(
        "snippet_run_output",
        (e) => {
          if (e.payload.runId !== runId) return;
          appendRunLine(runId, e.payload.data, e.payload.stream);
        }
      );
      const donePromise = listen<{ runId: string; exitCode: number }>(
        "snippet_run_done",
        (e) => {
          if (e.payload.runId !== runId) return;
          updateRunLog(runId, {
            status: e.payload.exitCode === 0 ? "done" : "error",
            exitCode: e.payload.exitCode,
          });
          // Clean up this run's listeners
          cleanupRef.current.get(runId)?.();
          cleanupRef.current.delete(runId);
        }
      );

      const cleanup = () => {
        void outPromise.then((fn) => fn());
        void donePromise.then((fn) => fn());
      };
      cleanupRef.current.set(runId, cleanup);
    },
    [appendRunLine, updateRunLog]
  );

  const execSnippet = useCallback(
    async (snippet: CommandSnippet, modeOverride?: SnippetExecMode) => {
      const mode = modeOverride ?? snippet.defaultExecMode;

      if (mode === "inject") {
        // Paste command into active terminal without executing
        const handle = activeTerminalRef();
        if (handle) {
          handle.write(snippet.command);
        }
        return;
      }

      if (mode === "terminal") {
        if (snippet.target === "ssh") {
          if (!snippet.hostId) {
            console.warn("Snippet has no hostId, falling back to local terminal");
            onNewLocalTab(snippet.workingDir ?? undefined, snippet.command);
          } else {
            onNewSshTab(snippet.hostId, snippet.name, undefined, snippet.command);
          }
        } else {
          onNewLocalTab(snippet.workingDir ?? undefined, snippet.command);
        }
        return;
      }

      // Silent mode
      const runId = newRunId();
      addRunLog({
        runId,
        snippetName: snippet.name,
        startedAt: Date.now(),
        status: "running",
        lines: [],
      });
      onOpenLogDrawer();
      registerRunListeners(runId);

      if (snippet.target === "ssh") {
        // Find an active SSH session for this host
        const sshSession = findSshSessionForHost(tabs, snippet.hostId);
        if (!sshSession) {
          updateRunLog(runId, {
            status: "error",
            lines: [{ data: `No active SSH session for this host. Open a terminal tab first or use Terminal mode.\n`, stream: "stderr" }],
          });
          return;
        }
        try {
          await invoke("snippet_run_ssh", {
            runId,
            sessionId: sshSession,
            command: snippet.command,
          });
        } catch (err) {
          updateRunLog(runId, { status: "error" });
          appendRunLine(runId, String(err) + "\n", "stderr");
        }
      } else {
        try {
          await invoke("snippet_run_local", {
            runId,
            command: snippet.command,
            workingDir: snippet.workingDir ?? null,
          });
        } catch (err) {
          updateRunLog(runId, { status: "error" });
          appendRunLine(runId, String(err) + "\n", "stderr");
        }
      }
    },
    [tabs, activeTerminalRef, onNewLocalTab, onNewSshTab, onOpenLogDrawer, addRunLog, updateRunLog, appendRunLine, registerRunListeners]
  );

  return { execSnippet };
}

function findSshSessionForHost(
  tabs: WorkspaceTab[],
  hostId: string | null | undefined
): string | null {
  if (!hostId) return null;
  for (const tab of tabs) {
    for (const [sessionId, session] of Object.entries(tab.sessions)) {
      if (session.kind === "ssh" && session.hostId === hostId) {
        return sessionId;
      }
    }
  }
  return null;
}
