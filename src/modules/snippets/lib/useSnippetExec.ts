import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useRef, useState } from "react";
import { useHostsStore } from "@/modules/hosts/store/hostsStore";
import { useNotificationStore } from "@/modules/notifications/store/useNotificationStore";
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
      setHostPickerRequest({ snippetName, resolve });
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
          const resolution = resolveSshHost(snippet.hostId);
          if (resolution.kind === "missing") {
            useNotificationStore.getState().addNotification({
              type: "error",
              title: "Snippet host missing",
              message: MISSING_HOST_MESSAGE,
            });
            return;
          }
          const hostId =
            resolution.kind === "ok" ? resolution.hostId : await promptForHost(snippet.name);
          if (!hostId) return; // user cancelled the host picker
          onNewSshTab(hostId, snippet.name, undefined, snippet.command);
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
            command: snippet.command,
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
            command: snippet.command,
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
    ],
  );

  const hostPicker = {
    open: hostPickerRequest !== null,
    snippetName: hostPickerRequest?.snippetName,
    onSelect: handleHostPickerSelect,
    onCancel: handleHostPickerCancel,
  };

  return { execSnippet, cancelRun, hostPicker };
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
