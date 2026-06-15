import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";

export type AgentTool = "claude" | "codex" | "open-code" | "aider" | "custom";

const KNOWN_TOOLS: AgentTool[] = ["claude", "codex", "open-code", "aider"];

export type FleetSession = {
  configId: string;
  ptyId: string;
  status: "starting" | "running" | "idle" | "exited";
  exitCode?: number;
  lastOutputAt: number;
};

type AgentFleetState = {
  sessions: Record<number, Record<string, FleetSession>>;
  availableTools: Record<string, boolean | "checking" | null>;

  launchAgent: (tabId: number, configId: string, command: string, cwd: string) => string;
  restartAgent: (tabId: number, configId: string, command: string, cwd: string) => string;
  killAgent: (tabId: number, configId: string) => void;
  recordActivity: (tabId: number, configId: string) => void;
  setStatus: (tabId: number, configId: string, status: FleetSession["status"], exitCode?: number) => void;
  detectTools: () => Promise<void>;
  cleanupTab: (tabId: number) => void;
};

export const useAgentFleetStore = create<AgentFleetState>((set) => ({
  sessions: {},
  availableTools: Object.fromEntries(KNOWN_TOOLS.map((t) => [t, null])),

  launchAgent: (tabId, configId, _command, _cwd) => {
    const ptyId = crypto.randomUUID();
    set((s) => ({
      sessions: {
        ...s.sessions,
        [tabId]: {
          ...(s.sessions[tabId] ?? {}),
          [configId]: {
            configId,
            ptyId,
            status: "starting",
            lastOutputAt: Date.now(),
          },
        },
      },
    }));
    return ptyId;
  },

  restartAgent: (tabId, configId, _command, _cwd) => {
    const ptyId = crypto.randomUUID();
    set((s) => ({
      sessions: {
        ...s.sessions,
        [tabId]: {
          ...(s.sessions[tabId] ?? {}),
          [configId]: {
            configId,
            ptyId,
            status: "starting",
            lastOutputAt: Date.now(),
          },
        },
      },
    }));
    return ptyId;
  },

  killAgent: (tabId, configId) => {
    set((s) => {
      const tabSessions = s.sessions[tabId];
      if (!tabSessions?.[configId]) return s;
      return {
        sessions: {
          ...s.sessions,
          [tabId]: {
            ...tabSessions,
            [configId]: { ...tabSessions[configId], status: "exited" },
          },
        },
      };
    });
  },

  recordActivity: (tabId, configId) => {
    set((s) => {
      const tabSessions = s.sessions[tabId];
      const session = tabSessions?.[configId];
      if (!session || session.status === "exited") return s;
      return {
        sessions: {
          ...s.sessions,
          [tabId]: {
            ...tabSessions,
            [configId]: { ...session, status: "running", lastOutputAt: Date.now() },
          },
        },
      };
    });
  },

  setStatus: (tabId, configId, status, exitCode) => {
    set((s) => {
      const tabSessions = s.sessions[tabId];
      const session = tabSessions?.[configId];
      if (!session) return s;
      return {
        sessions: {
          ...s.sessions,
          [tabId]: {
            ...tabSessions,
            [configId]: { ...session, status, ...(exitCode !== undefined ? { exitCode } : {}) },
          },
        },
      };
    });
  },

  detectTools: async () => {
    set((s) => ({
      availableTools: Object.fromEntries(
        KNOWN_TOOLS.map((t) => [t, s.availableTools[t] === true ? true : "checking"]),
      ),
    }));
    const results = await Promise.allSettled(
      KNOWN_TOOLS.map((tool) =>
        invoke<boolean>("pty_check_tool", { tool }).then((available) => ({ tool, available })),
      ),
    );
    const updates: Record<string, boolean> = {};
    for (const result of results) {
      if (result.status === "fulfilled") {
        updates[result.value.tool] = result.value.available;
      }
    }
    set((s) => ({
      availableTools: { ...s.availableTools, ...updates },
    }));
  },

  cleanupTab: (tabId) => {
    set((s) => {
      const next = { ...s.sessions };
      delete next[tabId];
      return { sessions: next };
    });
  },
}));

