import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import type { CreateHostPayload, Group, Host, UpdateHostPayload } from "../types";

interface HostsState {
  hosts: Host[];
  groups: Group[];
  selectedHostId: string | null;
  isLoading: boolean;

  fetchData: () => Promise<void>;
  createHost: (payload: CreateHostPayload) => Promise<Host>;
  updateHost: (payload: UpdateHostPayload) => Promise<Host>;
  deleteHost: (id: string) => Promise<void>;
  setSelectedHost: (id: string | null) => void;

  createGroup: (name: string, icon?: string, color?: string) => Promise<Group>;
  deleteGroup: (id: string) => Promise<void>;
}

export const useHostsStore = create<HostsState>((set) => ({
  hosts: [],
  groups: [],
  selectedHostId: null,
  isLoading: false,

  fetchData: async () => {
    set({ isLoading: true });
    const [hosts, groups] = await Promise.all([
      invoke<Host[]>("hosts_get_all"),
      invoke<Group[]>("groups_get_all"),
    ]);
    set({ hosts, groups, isLoading: false });
  },

  createHost: async (payload) => {
    const host = await invoke<Host>("hosts_create", payload as unknown as Record<string, unknown>);
    set((s) => ({ hosts: [...s.hosts, host] }));
    return host;
  },

  updateHost: async (payload) => {
    const host = await invoke<Host>("hosts_update", payload as unknown as Record<string, unknown>);
    set((s) => ({
      hosts: s.hosts.map((h) => (h.id === host.id ? host : h)),
    }));
    return host;
  },

  deleteHost: async (id) => {
    await invoke("hosts_delete", { id });
    set((s) => ({
      hosts: s.hosts.filter((h) => h.id !== id),
      selectedHostId: s.selectedHostId === id ? null : s.selectedHostId,
    }));
  },

  setSelectedHost: (id) => set({ selectedHostId: id }),

  createGroup: async (name, icon, color) => {
    const group = await invoke<Group>("groups_create", { name, icon, color });
    set((s) => ({ groups: [...s.groups, group] }));
    return group;
  },

  deleteGroup: async (id) => {
    await invoke("groups_delete", { id });
    set((s) => ({ groups: s.groups.filter((g) => g.id !== id) }));
  },
}));
