import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useRef, useState } from "react";
import { useHostsStore } from "@/modules/hosts/store/hostsStore";
import { useNotificationStore } from "@/modules/notifications/store/useNotificationStore";
import type { WorkspaceTab } from "@/modules/tabs";
import type { TerminalPaneHandle } from "@/modules/terminal";
import type { CommandSnippet, SnippetExecMode, SnippetVariable } from "../types";
import { useCommandSnippetsStore } from "../store/commandSnippetsStore";
import { newRunId } from "./snippetUtils";
import { extractSnippetVariables, substituteSnippetVariables } from "./snippetVariables";

interface UseSnippetExecOptions {
  tabs: WorkspaceTab[];
  activeTerminalRef: () => TerminalPaneHandle | null;
  onNewLocalTab: (cwd?: string, command?: string) => void;
  onNewSshTab: (hostId: string, title: string, cwd?: string, command?: string) => void;
  onOpenLogDrawer: () => void;
}

/** Result of resolving a snippet's target host before an SSH-mode run. */
type HostResolution = { kind: "ask" } | { kind: "missing" } | { kind: "ok"; hostId: string };

function resolveSshHost(hostId: string | null | undefined): HostResolution {
  if (!hostId) return { kind: "ask" };
  const exists = useHostsStore.getState().hosts.some((h) => h.id === hostId);
  return exists ? { kind: "ok", hostId } : { kind: "missing" };
}

const MISSING_HOST_MESSAGE =
  "This snippet's target host no longer exists — edit the snippet to pick a new host.";

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

  // Pending "ask at runtime" host prompt — resolved by the picker dialog
  // rendered from `hostPicker` below, one run at a time.
  const [hostPickerRequest, setHostPickerRequest] = useState<{
    snippetName: string;
    resolve: (hostId: string | null) => void;
  } | null>(null);

  const promptForHost = useCallback((snippetName: string): Promise<string | null> => {
    return new Promise((resolve) => {
      // A second snippet run starting its own host prompt while an earlier
      // one is still awaiting an answer would otherwise silently replace
      // this single-slot request — orphaning the earlier run's `await`
      // forever (no error, no timeout, nothing the user could act on).
      // Resolving the stale one as cancelled first means the earlier run
      // aborts cleanly instead of hanging indefinitely.
      setHostPickerRequest((prev) => {
        prev?.resolve(null);
        return { snippetName, resolve };
      });
    });
  }, []);

  const handleHostPickerSelect = useCallback(
    (hostId: string) => {
      hostPickerRequest?.resolve(hostId);
      setHostPickerRequest(null);
    },
    [hostPickerRequest],
  );

  const handleHostPickerCancel = useCallback(() => {
    hostPickerRequest?.resolve(null);
    setHostPickerRequest(null);
  }, [hostPickerRequest]);

  // Pending "${VAR_NAME}" prompt — resolved by the variable prompt dialog
  // rendered from `variablePrompt` below, one run at a time. `resolve(null)`
  // means the user cancelled, which must abort the run entirely.
  const [variablePromptRequest, setVariablePromptRequest] = useState<{
    snippetName: string;
    variables: SnippetVariable[];
    resolve: (values: Record<string, string> | null) => void;
  } | null>(null);

  const promptForVariables = useCallback(
    (snippetName: string, variables: SnippetVariable[]): Promise<Record<string, string> | null> => {
      return new Promise((resolve) => {
        // Same stale-request hazard as promptForHost above — resolve any
        // still-pending variable prompt as cancelled before replacing it,
        // so an earlier run can never hang forever on an orphaned promise.
        setVariablePromptRequest((prev) => {
          prev?.resolve(null);
          return { snippetName, variables, resolve };
        });
      });
    },
    [],
  );

  const handleVariablePromptSubmit = useCallback(
    (values: Record<string, string>) => {
      variablePromptRequest?.resolve(values);
      setVariablePromptRequest(null);
    },
    [variablePromptRequest],
  );

  const handleVariablePromptCancel = useCallback(() => {
    variablePromptRequest?.resolve(null);
    setVariablePromptRequest(null);
  }, [variablePromptRequest]);

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
        },
      );
      const donePromise = listen<{ runId: string; exitCode: number; cancelled?: boolean }>(
        "snippet_run_done",
        (e) => {
          if (e.payload.runId !== runId) return;
          updateRunLog(runId, {
            status: e.payload.cancelled ? "cancelled" : e.payload.exitCode === 0 ? "done" : "error",
            exitCode: e.payload.exitCode,
          });
          // Clean up this run's listeners
          cleanupRef.current.get(runId)?.();
          cleanupRef.current.delete(runId);
        },
      );

      const cleanup = () => {
        void outPromise.then((fn) => fn());
        void donePromise.then((fn) => fn());
      };
      cleanupRef.current.set(runId, cleanup);
    },
    [appendRunLine, updateRunLog],
  );

  const cancelRun = useCallback((runId: string) => {
    void invoke("snippet_run_cancel", { runId }).catch((err) => {
      console.warn("Failed to cancel snippet run:", err);
    });
  }, []);

  const execSnippet = useCallback(
    async (snippet: CommandSnippet, modeOverride?: SnippetExecMode) => {
      const mode = modeOverride ?? snippet.defaultExecMode;

      // Resolve `${VAR_NAME}` placeholders before any exec path runs, so the
      // substituted command is shared by all three paths below (terminal
      // injection, silent invoke, direct PTY inject). Extraction is skipped
      // entirely when the command has none — this is the common case (most
      // snippets have no variables) and must add zero friction/delay to it.
      const variables = extractSnippetVariables(snippet.command);
      let command = snippet.command;
      if (variables.length > 0) {
        const values = await promptForVariables(snippet.name, variables);
        if (!values) return; // user cancelled the variable prompt — don't run at all
        command = substituteSnippetVariables(snippet.command, values);
      }

      if (mode === "inject") {
        // Paste command into active terminal without executing
        const handle = activeTerminalRef();
        if (handle) {
          handle.write(command);
        }
        return;
      }

      if (mode === "terminal") {
        if (snippet.target === "ssh") {
          const resolution = resolveSshHost(snippet.hostId);
          if (resolution.kind === "missing") {
            useNotificationStore.getState().addNotification({
              type: "error",
              title: "Snippet host missing",
              message: MISSING_HOST_MESSAGE,
            });
            return;
          }
          const hostId = resolution.kind === "ok" ? resolution.hostId : await promptForHost(snippet.name);
          if (!hostId) return; // user cancelled the host picker
          onNewSshTab(hostId, snippet.name, undefined, command);
        } else {
          onNewLocalTab(snippet.workingDir ?? undefined, command);
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

      // registerRunListeners is deferred until just before the invoke() call
      // that will actually trigger `snippet_run_done` — the SSH branch below
      // can bail out (no active session) before ever invoking, and
      // registering listeners for a runId that never gets a matching "done"
      // event leaks them until this hook unmounts.
      if (snippet.target === "ssh") {
        const resolution = resolveSshHost(snippet.hostId);
        if (resolution.kind === "missing") {
          updateRunLog(runId, {
            status: "error",
            lines: [{ data: `${MISSING_HOST_MESSAGE}\n`, stream: "stderr" }],
          });
          return;
        }
        const hostId = resolution.kind === "ok" ? resolution.hostId : await promptForHost(snippet.name);
        if (!hostId) {
          updateRunLog(runId, {
            status: "error",
            lines: [{ data: `Run cancelled — no host selected.\n`, stream: "stderr" }],
          });
          return;
        }
        // Find an active SSH session for this host
        const sshSession = findSshSessionForHost(tabs, hostId);
        if (!sshSession) {
          updateRunLog(runId, {
            status: "error",
            lines: [
              {
                data: `No active SSH session for this host. Open a terminal tab first or use Terminal mode.\n`,
                stream: "stderr",
              },
            ],
          });
          return;
        }
        registerRunListeners(runId);
        try {
          await invoke("snippet_run_ssh", {
            runId,
            sessionId: sshSession,
            command,
          });
        } catch (err) {
          updateRunLog(runId, { status: "error" });
          appendRunLine(runId, String(err) + "\n", "stderr");
        }
      } else {
        registerRunListeners(runId);
        try {
          await invoke("snippet_run_local", {
            runId,
            command,
            workingDir: snippet.workingDir ?? null,
          });
        } catch (err) {
          updateRunLog(runId, { status: "error" });
          appendRunLine(runId, String(err) + "\n", "stderr");
        }
      }
    },
    [
      tabs,
      activeTerminalRef,
      onNewLocalTab,
      onNewSshTab,
      onOpenLogDrawer,
      addRunLog,
      updateRunLog,
      appendRunLine,
      registerRunListeners,
      promptForHost,
      promptForVariables,
    ],
  );

  const hostPicker = {
    open: hostPickerRequest !== null,
    snippetName: hostPickerRequest?.snippetName,
    onSelect: handleHostPickerSelect,
    onCancel: handleHostPickerCancel,
  };

  const variablePrompt = {
    open: variablePromptRequest !== null,
    snippetName: variablePromptRequest?.snippetName,
    variables: variablePromptRequest?.variables ?? [],
    onSubmit: handleVariablePromptSubmit,
    onCancel: handleVariablePromptCancel,
  };

  return { execSnippet, cancelRun, hostPicker, variablePrompt };
}

function findSshSessionForHost(tabs: WorkspaceTab[], hostId: string | null | undefined): string | null {
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
