import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { create } from "zustand";
import type {
  CommandSnippet,
  SnippetGroup,
  SnippetReorderItem,
  SnippetRunLog,
} from "../types";

interface CommandSnippetsState {
  snippets: CommandSnippet[];
  groups: SnippetGroup[];
  runLogs: SnippetRunLog[];
  hydrated: boolean;

  hydrate: () => Promise<void>;
  createSnippet: (payload: Omit<CommandSnippet, "id" | "createdAt" | "updatedAt">) => Promise<CommandSnippet>;
  updateSnippet: (id: string, payload: Partial<CommandSnippet>) => Promise<CommandSnippet>;
  deleteSnippet: (id: string) => Promise<void>;
  reorderSnippets: (items: SnippetReorderItem[]) => Promise<void>;

  createGroup: (name: string, icon?: string, color?: string) => Promise<SnippetGroup>;
  updateGroup: (id: string, name?: string, icon?: string, color?: string) => Promise<SnippetGroup>;
  deleteGroup: (id: string) => Promise<void>;

  addRunLog: (log: SnippetRunLog) => void;
  updateRunLog: (runId: string, patch: Partial<SnippetRunLog>) => void;
  appendRunLine: (runId: string, data: string, stream: "stdout" | "stderr") => void;
  clearRunLogs: () => void;
}

export const useCommandSnippetsStore = create<CommandSnippetsState>((set, get) => ({
  snippets: [],
  groups: [],
  runLogs: [],
  hydrated: false,

  hydrate: async () => {
    if (get().hydrated) return;
    const [snippets, groups] = await Promise.all([
      invoke<CommandSnippet[]>("snippets_get_all"),
      invoke<SnippetGroup[]>("snippet_groups_get_all"),
    ]);
    set({ snippets, groups, hydrated: true });

    void listen("nexum://snippets-changed", async () => {
      const [s, g] = await Promise.all([
        invoke<CommandSnippet[]>("snippets_get_all"),
        invoke<SnippetGroup[]>("snippet_groups_get_all"),
      ]);
      set({ snippets: s, groups: g });
    });
  },

  createSnippet: async (payload) => {
    const snippet = await invoke<CommandSnippet>("snippets_create", {
      name: payload.name,
      command: payload.command,
      target: payload.target,
      description: payload.description ?? null,
      hostId: payload.hostId ?? null,
      defaultExecMode: payload.defaultExecMode,
      workingDir: payload.workingDir ?? null,
      groupId: payload.groupId ?? null,
      tags: payload.tags ?? null,
      sortOrder: payload.sortOrder,
    });
    set((s) => ({ snippets: [...s.snippets, snippet] }));
    return snippet;
  },

  updateSnippet: async (id, payload) => {
    const snippet = await invoke<CommandSnippet>("snippets_update", {
      id,
      name: payload.name ?? null,
      command: payload.command ?? null,
      target: payload.target ?? null,
      description: payload.description ?? null,
      hostId: payload.hostId ?? null,
      defaultExecMode: payload.defaultExecMode ?? null,
      workingDir: payload.workingDir ?? null,
      groupId: payload.groupId ?? null,
      tags: payload.tags ?? null,
      sortOrder: payload.sortOrder ?? null,
    });
    set((s) => ({
      snippets: s.snippets.map((x) => (x.id === id ? snippet : x)),
    }));
    return snippet;
  },

  deleteSnippet: async (id) => {
    await invoke("snippets_delete", { id });
    set((s) => ({ snippets: s.snippets.filter((x) => x.id !== id) }));
  },

  reorderSnippets: async (items) => {
    await invoke("snippets_reorder", { items });
    set((s) => {
      const orderMap = new Map(items.map((i) => [i.id, i.sortOrder]));
      const updated = s.snippets.map((x) =>
        orderMap.has(x.id) ? { ...x, sortOrder: orderMap.get(x.id)! } : x
      );
      return { snippets: updated };
    });
  },

  createGroup: async (name, icon, color) => {
    const group = await invoke<SnippetGroup>("snippet_groups_create", { name, icon, color });
    set((s) => ({ groups: [...s.groups, group] }));
    return group;
  },

  updateGroup: async (id, name, icon, color) => {
    const group = await invoke<SnippetGroup>("snippet_groups_update", { id, name, icon, color });
    set((s) => ({ groups: s.groups.map((g) => (g.id === id ? group : g)) }));
    return group;
  },

  deleteGroup: async (id) => {
    await invoke("snippet_groups_delete", { id });
    set((s) => ({
      groups: s.groups.filter((g) => g.id !== id),
      snippets: s.snippets.map((x) => (x.groupId === id ? { ...x, groupId: null } : x)),
    }));
  },

  addRunLog: (log) => set((s) => ({ runLogs: [log, ...s.runLogs].slice(0, 50) })),

  updateRunLog: (runId, patch) =>
    set((s) => ({
      runLogs: s.runLogs.map((l) => (l.runId === runId ? { ...l, ...patch } : l)),
    })),

  appendRunLine: (runId, data, stream) =>
    set((s) => ({
      runLogs: s.runLogs.map((l) =>
        l.runId === runId
          ? { ...l, lines: [...l.lines, { data, stream }] }
          : l
      ),
    })),

  clearRunLogs: () => set({ runLogs: [] }),
}));
